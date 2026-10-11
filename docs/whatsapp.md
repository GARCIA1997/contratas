# Plan: WhatsApp automático para Kredired (Baileys, por fases)

> Estado: **implementado (v4.14.0)**. Las secciones 0–11 son el plan aprobado; la sección 12 describe cómo quedó el código y la 13 cómo operarlo.
> Versión 2: incorpora las decisiones de la revisión (recibos, recordatorios, cupo, presentación, opt-out, monitor y procesos).

---

## 0. Contexto del proyecto

- **Kredired**: Next.js 14 (App Router) + Prisma + PostgreSQL, PWA con modo offline (Dexie + cola de escrituras con Idempotency-Key). Cobradores de préstamos semanales, quincenales y mensuales en México.
- **Repositorio**: `/Users/alejandrogarcia/Development/projects/contratas`. Rama principal `main`.
- **Producción**: `kredired.cloud`. VPS Hostinger KVM 2: **2 vCPU, 8 GB RAM, 100 GB disco**, Ubuntu 24.04, Docker Compose. Deploy al hacer merge a `main`.
- **Zona horaria de negocio**: `America/Mexico_City` (sin horario de verano).
- **Monitor** (`/monitor`): panel solo para el administrador (`User.accesoMonitor`).
- **Idioma**: responder siempre en español.

### Reglas de trabajo (obligatorias)

- Nunca `git push` ni merge sin pedirlo explícitamente en ese momento.
- Rama nueva desde `main`. Merge con **merge commit**. Tag **después** del merge.
- Antes de producción: `./deploy/backup-db.sh` y verificar con `pg_restore -l`.
- Antes de PR: `npx tsc --noEmit`, `npx next lint`, `npm test`.
- Versión: features → minor, fixes → patch. Confirmar antes de subirla.
- Sin envíos de WhatsApp de ningún tipo (ni de prueba) sin confirmación explícita.

### Dependencias previas

- Ramas abiertas que tocan cobros: `feat/calidad-ignorar` (PR #43) y `feat/modo-local-switch` (cola offline). Además, la feature de **teléfono y mensaje default en Deudor**. Definir orden de merge antes de la fase 1: la fase 1 parte de `main` con las tres integradas.

---

## 1. Objetivo y alcance

Enviar mensajes de WhatsApp automáticos (recibos, recordatorios de cuota, recordatorios a deudores y una presentación inicial) desde **hasta 6 números**, todos administrados por el dueño, usando **Baileys** (dispositivo vinculado por QR).

- **Máximo 6 números, uno por usuario de la app.** Cada número pertenece a un usuario distinto (con sus propios clientes y deudores) y **no tiene que ser** el número con el que el usuario se registró o inicia sesión. El dueño de la plataforma los administra todos desde el monitor. Todo lo que sigue (cupo, freno, opt-out, presentación) aplica **por número**, salvo que se diga lo contrario.
- **Riesgo aceptado:** WhatsApp puede bloquear el número. **La seguridad del número tiene prioridad sobre cualquier otra regla**, con una sola excepción explícita: los recibos (sección 5.1).

---

## 2. Decisiones confirmadas

| Tema | Decisión |
|---|---|
| Librería | Baileys |
| Números | Hasta 6. El primero: la línea eSIM "Automático" (WhatsApp Business "Kredired Automático"). Se agregan de uno en uno. |
| Vinculación | Solo desde el monitor, por QR o por **código de vinculación** (ver 4.1) |
| Propiedad | **1 usuario ↔ 1 número.** El número de WhatsApp es independiente del teléfono/correo de la cuenta del usuario. |
| Contenedores | **Uno solo** (`whatsapp-worker`) con hasta 6 sesiones. No uno por número. |
| Cupo diario | **100 por día por número**, estricto para todo **excepto recibos** |
| Recibos | Al insertar el cobro en BD, en la misma transacción. **Cualquier día y hora.** Se pueden pasar de 100. |
| Recordatorios de cuota | Misma ventana que la Ruta. Todos los días, **9:00–19:00** |
| Recordatorio vencida | **Una sola vez**, el día siguiente a la fecha límite |
| Deudores | Cada **15 días** desde lo más reciente entre su último abono y su último recordatorio. Sin teléfono, no se envía. |
| Presentación | Sí se hace, con rampa (20/día → 30/día) dentro del cupo de 100 |
| Opt-out | Excluye **solo mensajes automáticos**. El envío manual no cambia. |
| Corrección de recibo | No hay corrección automática. Se marca en el monitor. |

---

## 3. Estado actual (fuera del código)

- eSIM "Automático" activa en el iPhone 17 Pro del dueño, con WhatsApp Business "Kredired Automático", sin herramientas automáticas activas.
- **Pendiente del dueño:** recargar la línea antes de su vigencia y anotar la fecha.
- **Fase 2 en curso de forma manual:** el dueño manda mensajes cada semana en días distintos para calentar el número. El iPhone debe conectarse al menos cada pocos días (WhatsApp desvincula los dispositivos vinculados tras ~14 días sin el teléfono principal).

---

## 4. Modelo de datos

### Cambios a tablas existentes
- `Deudor.telefono` (ya existe en la feature de deudores) y su mensaje default.

### 4.1 Aislamiento entre usuarios (obligatorio)

- `CuentaWhatsApp.ownerId` es **único** (un número por usuario) y `CuentaWhatsApp.numero` es **único** (un número no puede estar en dos usuarios).
- El número se captura en el monitor al crear la cuenta; **nunca** se toma de `User` (correo/teléfono de registro).
- Al vincular, el worker compara el número que reporta WhatsApp (`sock.user.id`) con `CuentaWhatsApp.numero`. **Si no coincide, se desconecta y se marca error**: evita vincular por error el teléfono de otro usuario.
- `MensajeSalida` lleva `cuentaId` y `ownerId`, con FK compuesta `(cuentaId, ownerId) → CuentaWhatsApp(id, ownerId)`: la BD impide que un mensaje de un usuario quede asignado al número de otro.
- El despachador envía cada mensaje **solo por la sesión de su `cuentaId`**, y antes de enviar revalida que el cliente/deudor pertenezca a ese `ownerId`.
- Todo proceso (P2, P5) genera mensajes **iterando por cuenta**, con consultas filtradas por `ownerId`.
- `OptOut` y `Presentacion` son **por cuenta**: `(cuentaId, telefonoNormalizado)`. Si una persona es cliente de dos usuarios, decir "NO" a uno no la da de baja con el otro.
- El cupo, el freno, la campaña y la bitácora son por cuenta.
- La sesión cifrada y las llaves (`WhatsAppLlave`) cuelgan de `cuentaId`; borrar o desvincular una cuenta borra solo sus llaves.
- El usuario en Configuración solo ve **su** cuenta. Los datos de otras cuentas solo existen en el monitor.
- **Pruebas obligatorias en la fase 1:** un usuario no puede leer ni encolar mensajes con la cuenta de otro; opt-out de un usuario no afecta a otro; un cliente con el mismo teléfono en dos usuarios genera mensajes independientes.

### 4.2 Vinculación a distancia

Como el teléfono de cada usuario no está físicamente con el administrador:
- **Código de vinculación** (Baileys `requestPairingCode`): el administrador captura el número en el monitor, se genera un código de 8 caracteres y el usuario lo escribe en su WhatsApp → Dispositivos vinculados → Vincular con número de teléfono. No requiere escanear nada.
- **QR** como alternativa, si el administrador tiene el teléfono enfrente.
- El código y el QR caducan; se registran en la bitácora quién los generó y cuándo.

### 4.3 Pausas (usuario y administrador)

- Dos banderas independientes en `CuentaWhatsApp`: `pausadaPorUsuario` y `pausadaPorAdmin` (más el **paro global** del monitor).
- Se envía solo si **ninguna** está activa.
- El usuario pausa y reanuda la suya desde Configuración. **No puede quitar** una pausa del administrador ni el paro global; en su pantalla ve "Pausado por el administrador".
- El administrador ve y controla las 6 cuentas desde el monitor, incluidas las pausas puestas por usuarios (puede ver quién pausó y cuándo).
- **Vincular, cambiar o desvincular el número: solo desde el monitor.** El usuario no tiene esas opciones.
- **Durante una pausa:**
  - Los recibos se siguen generando (el cobro sí ocurrió), pero no salen.
  - Los recordatorios no se generan (se programarían con datos viejos).
  - Al reanudar, los recibos pendientes con **más de 24 h** se cancelan (quedan listados en el monitor para envío manual) y el resto sale con el espaciado normal. Así una pausa larga no termina en una ráfaga.
- Cada pausa y reanudación queda en la bitácora con quién la hizo.

### 4.4 Cambio o baja de número
- Cambiar el número de un usuario = desvincular la cuenta, cancelar sus mensajes `pendiente` y crear otra cuenta (con su propio calentamiento y su propia presentación).
- Si un usuario se elimina o se desactiva: se desvincula la sesión, se borran sus llaves y sus pendientes se cancelan.

### Tablas nuevas

| Tabla | Campos clave | Notas |
|---|---|---|
| `CuentaWhatsApp` | id, **ownerId (único)**, **numero (único)**, estado, sesionCifrada, ultimaConexion, aceptoRiesgoEn, pausada | Estado: `desconectado`, `esperando_qr`, `conectado`, `pausado`, `bloqueado` |
| `WhatsAppLlave` | cuentaId, tipo, id, valorCifrado | Auth state propio de Baileys (llaves Signal). **No** usar `useMultiFileAuthState`. |
| `MensajeConfig` | ownerId, tipo, activo, plantilla | Interruptor por tipo |
| `MensajeSalida` (outbox) | id, **cuentaId**, ownerId, tipo, prioridad, telefono, clienteId?, deudorId?, **claveDedupe (única)**, estado, programadoPara, enviadoEn, ack, error, origen, contexto (JSON), presentacionIncluida | Ver estados y claves abajo |
| `OptOut` | **(cuentaId, telefonoNormalizado)** (PK), fecha, mensajeRecibido, reactivadoEn? | Por cuenta y teléfono |
| `Presentacion` | **(cuentaId, telefonoNormalizado)** (PK), fecha, via (`campana` / `primer_mensaje`) | Garantiza una sola presentación |
| `CampanaPresentacion` | id, cuentaId, estado, total, enviados, inicio, pausadaPor?, rampaDia | Una activa a la vez |
| `ProcesoEjecucion` | proceso, inicio, fin, resultado, procesados, error | Para la sección "Procesos" del monitor |
| `BitacoraWhatsApp` | cuentaId?, fecha, tipo, detalle (JSON) | Conexiones, envíos, errores, alertas |

### Estados de `MensajeSalida`

`pendiente` → `enviando` → `enviado` → (`entregado` / `leido` por ack)
Además: `cancelado`, `fallido`, `revisar` (quedó en `enviando` y el worker se cayó: **no se reintenta solo**).

### Claves de deduplicación

| Tipo | Clave |
|---|---|
| Recibo | `recibo:{Idempotency-Key de la operación}` |
| Por vencer | `por_vencer:{contrataId}:{numeroCuota}` |
| Vencida | `vencida:{contrataId}:{numeroCuota}` |
| Deudor | `deudor:{deudorId}:{fechaCorte}` |
| Presentación | `presentacion:{cuentaId}:{telefonoNormalizado}` |

Insertar siempre con `ON CONFLICT (claveDedupe) DO NOTHING`.

### Teléfonos
Normalizar a E.164 (`+52…`) al guardar y al comparar. Resolver el JID con `onWhatsApp()` antes del primer envío a un número. Si no tiene WhatsApp, el mensaje pasa a `fallido` con motivo y no se reintenta.

---

## 5. Reglas de negocio

### 5.1 Recibos

- **Disparo:** en la **misma transacción** del servidor que aplica el cobro (outbox transaccional). Si el cobro no llega a la BD (cola rechazada o descartada), no existe recibo.
- **Interruptor de recibos automáticos apagado:** no se genera nada; envío manual como hoy.
- **Un recibo por operación**, no por cuota. Los 4 caminos de cobro:
  - `pagos/[cuota]/toggle` (marcar cuota)
  - `pagos/[cuota]/abonar` (abono parcial)
  - `clientes/[id]/abonar` (abono repartido)
  - `clientes/[id]/cobrar-vencidas` (varias cuotas)
- **Agrupación:** recibos del mismo cliente dentro de una ventana de **5 segundos** se unen en un solo mensaje (p. ej. la Ruta manda una operación por cuota). El recibo debe llegar mientras el cobrador sigue con el cliente.
- **Fecha del recibo:** la de captura en el teléfono (`fechaCaptura`), no la de sincronización. Si llegó tarde: "cobro del día X".
- **Horario:** cualquier día y hora.
- **Cupo:** cuentan en los 100 pero **nunca se bloquean** por el cupo.
- **Ráfagas:** los recibos salen con **10–30 s al azar** entre cada uno, con espaciado propio: no esperan detrás de un recordatorio.
- **Desmarcar una cuota:** si el recibo sigue `pendiente`, se cancela. Si ya salió, no se envía corrección; queda en el monitor como "recibo de cobro revertido".
- **Abonos al deudor: exactamente igual que los cobros de cuotas.** Mismo interruptor de "recibos automáticos", recibo generado en la transacción de `agregarAbono`, clave `recibo:{Idempotency-Key}`, cualquier día y hora, agrupación de 5 s, espaciado en ráfagas y fecha de captura. Si el abono se elimina antes de que salga el recibo, se cancela; si ya salió, queda en el monitor como revertido. El abono también reinicia el contador de 15 días del recordatorio (5.3).

### 5.2 Recordatorios de cuota

- **Ventana:** la misma que usa la Ruta (`aggregarRutaDelDia`, `src/lib/services/ruta.ts`), con `anclarFechaCliente` y `DIAS_ANTICIPACION_COBRO`.
- **Por vencer:** el primer día en que la cuota entra a la Ruta (`fechaProgramada − DIAS_ANTICIPACION_COBRO`).
- **Vencida:** `fechaProgramada + 1 día`, si no está pagada. **Una sola vez.**
- **Horario:** 9:00–19:00, todos los días.
- **Monto:** se calcula **al momento de enviar** (`abono − montoAbonado`). Si ya está pagada, se cancela.
- **Agrupación:** varias cuotas del mismo cliente el mismo día → un solo mensaje.
- **Exclusiones:** contrata `convertidaADeuda`, cliente sin teléfono, opt-out.
- **Cancelación automática:** cuota pagada, contrata liquidada / renovada / unificada, cliente eliminado o teléfono cambiado.

### 5.3 Recordatorios a deudores

- Cada **15 días** desde lo más reciente entre su último abono y su último recordatorio.
- Solo si saldo > 0 y tiene teléfono. Sin teléfono no se genera nada.
- Texto: el mensaje default de la feature de deudores.
- Horario 9:00–19:00, todos los días.

### 5.4 Cupo diario y prioridades

Tope de **100 mensajes por día por número** (cada número lleva su propio contador). Orden de prioridad:

1. Recibos (siempre salen, aunque se pase de 100)
2. Recordatorios de cuota
3. Recordatorios a deudores
4. Presentación (solo lo que sobre)

Lo que no cabe pasa al día siguiente con la misma prioridad y se **revalida** antes de enviarse. Espaciado general entre mensajes no-recibo: 30 s – 3 min al azar.

### 5.5 Presentación

| Regla | Valor |
|---|---|
| Destinatarios | Clientes con ≥1 contrata activa y teléfono + deudores con saldo > 0 y teléfono. Sin opt-out. Un mensaje por teléfono. |
| Rampa | 20/día los primeros 3 días sin incidentes → 30/día como tope |
| Espaciado | 4–10 min al azar, 9:00–19:00 |
| Variación | 3–4 versiones del texto, rotando, con `{nombre}` |
| Orden | Primero quienes pagaron más recientemente |
| Freno | Pausa automática con **2** "NO" o bloqueos en un día los primeros 3 días; **3** después. También ante cualquier error de cuenta restringida. Reanuda solo el administrador. |
| Inicio | Desde el monitor, con lista, conteo y casilla de confirmación |
| Requisito previo | Fase 2 cumplida: 3–4 semanas con conversaciones reales con respuesta |
| Primer mensaje | Si un cliente recibe un recibo o recordatorio antes de su turno en la campaña, ese mensaje lleva antes la línea de presentación y se registra en `Presentacion`. |

### 5.6 Opt-out

- **Detección:** mensaje entrante que, completo y normalizado (sin acentos, minúsculas, sin espacios extremos), sea `no`, `baja`, `stop`, `alto` o `ya no`. No se busca la palabra suelta dentro de un texto.
- **Respuesta:** una sola vez, "Listo, no le enviaremos más mensajes automáticos".
- **Reactivación:** si escribe `alta` o `si`.
- **Alcance:** solo mensajes automáticos (recibos, recordatorios, presentación). El envío manual no cambia.
- **Llave:** cuenta + teléfono normalizado (el opt-out con un usuario no afecta a otro).
- Las demás respuestas las atiende el dueño en el iPhone; el worker no las procesa.

### 5.7 Seguridad general

1. Todo apagado por defecto.
2. Paro global inmediato desde el monitor.
3. Pausa automática ante error de cuenta restringida o bloqueo.
4. Envío "a lo más una vez": marcar `enviando` antes de enviar; tomar mensajes con `FOR UPDATE SKIP LOCKED`.
5. Sin links en los mensajes. Sin listas de difusión.
6. Sesión cifrada en BD con llave en variable de entorno (`WHATSAPP_SESSION_KEY`, secret de CI). Nunca en el repo ni en disco sin cifrar.
7. Aviso de privacidad (LFPDPPP) actualizado antes de la fase 3.

---

## 6. Arquitectura y procesos

### Contenedores

- `web` (Next.js, existente): genera recibos en la transacción del cobro. **No** habla con WhatsApp.
- `whatsapp-worker` (nuevo, Node): **un solo contenedor** que mantiene hasta 6 sesiones de Baileys (una conexión por número) y corre los procesos de abajo. Se comunica con `web` **solo a través de la BD**.
- El pipeline de deploy solo reinicia `whatsapp-worker` si cambió su código (reconexiones frecuentes son señal de riesgo).
- Límites en Compose: `mem_limit` 1.5 GB para el worker (~150–200 MB por sesión); alerta si una sesión pasa de 300 MB.
- **Aislamiento entre sesiones:** cada sesión con su propio supervisor y manejo de errores. Si un número se bloquea, se cae o lanza una excepción, los otros siguen enviando.
- **Arranque escalonado:** las sesiones se conectan con 20–40 s de diferencia, nunca todas a la vez (mismo servidor e IP reconectando 6 cuentas juntas es una señal de riesgo).
- **Misma IP para todos los números:** si WhatsApp marca uno, puede afectar la reputación de los demás. Activar los números de uno en uno, con calentamiento cada uno, y no compartir destinatarios entre números sin necesidad.

### Procesos

| # | Proceso | Dónde | Frecuencia | Qué hace |
|---|---|---|---|---|
| P1 | Generador de recibos | `web`, en la transacción del cobro | Por cada cobro | Inserta en `MensajeSalida` con clave `recibo:{Idempotency-Key}` si el tipo está activo |
| P2 | Programador de recordatorios | worker | Cada hora (y al arrancar) | Calcula cuotas por vencer / vencidas y deudores con la lógica de la Ruta; inserta con `ON CONFLICT DO NOTHING` |
| P3 | Despachador | worker | Bucle continuo | Toma por prioridad, valida horario / cupo / opt-out / revalida monto, agrupa por cliente, aplica espaciado y envía |
| P4 | Receptor | worker | Eventos de Baileys | Procesa opt-out / reactivación y acks (entregado, leído) |
| P5 | Campaña de presentación | worker | Junto con P3 | Encola la cuota diaria de la rampa; aplica el freno |
| P6 | Supervisor de conexión | worker | Continuo | Reconexión con espera creciente (5 s → 15 s → 1 min → 5 min); detecta `loggedOut` / restricción → `bloqueado` / `pausado` |
| P7 | Latido (heartbeat) | worker | Cada 30 s | Escribe estado, memoria, CPU, versión de Baileys. Si falta > 2 min, el monitor alerta "worker caído" |
| P8 | Limpieza | worker | Diario, 3:00 | Pasa a `revisar` los `enviando` viejos; purga bitácora > 90 días |

Cada ejecución de P2, P5 y P8 escribe en `ProcesoEjecucion`.

---

## 7. Monitor: sección WhatsApp

### 7.0 Tabla de números (vista principal)
Una fila por número (hasta 6): número, **usuario al que pertenece**, estado con color, enviados hoy / 100, cola pendiente, campaña de presentación, último fallo, memoria de su sesión. Al tocar una fila se abre el detalle (7.1–7.8) de ese número. **Paro global** arriba detiene los 6; cada número tiene además su propio pausar / reanudar.

### 7.1 Encabezado del número
- Estado del número con color: conectado / esperando QR / desconectado / pausado / bloqueado, y desde cuándo.
- **Botón de paro global** y botón **Pausar / Reanudar**.
- Latido del worker: "hace 12 s" (rojo si > 2 min).
- Alertas activas (ver 7.9).

### 7.2 Conexión
- Número, última conexión, número de reconexiones hoy y en 7 días, versión de Baileys.
- **Crear cuenta** (elegir usuario + capturar número), **Generar código de vinculación** o **QR** (se regeneran al caducar), **Desconectar**, **Cambiar número**.
- Alerta si el número vinculado no coincide con el capturado.
- Recursos del worker: memoria (MB), CPU (%), uptime.

### 7.3 Cupo del día
- Barra `enviados / 100`, con desglose por tipo (recibos, por vencer, vencidas, deudores, presentación).
- Indicador de "pasado del tope por recibos" y cuántos.
- Hora del próximo envío programado.

### 7.4 Cola de salida
- Conteo por estado: pendientes, enviando, enviados hoy, entregados, leídos, fallidos, cancelados, **por revisar**.
- Tabla filtrable (tipo, estado, fecha, cliente): destinatario, tipo, programado para, estado, ack, error.
- Acciones por mensaje: ver texto renderizado, cancelar, reintentar (solo `fallido` / `revisar`, con confirmación).
- Lista de **recibos de cobros revertidos** (ya enviados y luego desmarcados), para atenderlos a mano.

### 7.5 Campaña de presentación
- Total de destinatarios, enviados, faltan, días estimados.
- Rampa actual (20 o 30), día de la campaña, "NO" recibidos hoy y en total.
- Estado: activa / pausada (motivo) / terminada. Botones iniciar (con lista y casilla) / pausar / reanudar.

### 7.6 Opt-outs
- Lista: teléfono, nombre (cliente o deudor), fecha, mensaje recibido.
- Reactivar a mano (con confirmación).

### 7.7 Procesos
Tabla con P1–P8: última ejecución, duración, resultado, elementos procesados, próxima ejecución y último error. Rojo si un proceso no corre en su frecuencia esperada.

### 7.8 Bitácora
Conexiones, desconexiones, QR generados, pausas, paros, envíos, errores y alertas. Filtro por tipo y fecha.

### 7.9 Alertas
| Alerta | Condición |
|---|---|
| Worker caído | Sin latido > 2 min |
| Sesión caída | Desconectado > 10 min sin reconectar |
| Número restringido | Error de cuenta restringida o `loggedOut` |
| Tope superado | Más de 100 en el día por recibos |
| Fallos altos | > 2 % de fallidos en el día |
| Freno de presentación | Campaña pausada automáticamente |
| Memoria alta | Worker > 300 MB |
| Por revisar | Hay mensajes en estado `revisar` |
| Recibos nocturnos | Recibos enviados fuera de 9:00–19:00 (informativo) |

---

## 8. Configuración del usuario

- Tarjeta **"WhatsApp automático"** en Configuración, apagada por defecto. Solo se enciende si el administrador ya vinculó un número a ese usuario y está conectado.
- Muestra: número vinculado (solo lectura), estado, enviados hoy / 100, último envío y botón **Pausar / Reanudar** (ver 4.3).
- **El usuario no ve el historial de mensajes** (qué se mandó, a quién, acuses). El historial, la cola y la bitácora solo existen en el monitor. Las APIs del worker/outbox no se exponen a usuarios sin `accesoMonitor`. Al encenderla: confirmación del riesgo con casilla (`aceptoRiesgoEn`).
- Interruptores por tipo: recibos automáticos, por vencer, vencidas, deudores.
- Número manual (solo informativo); si es igual al automático, aviso y casilla.
- Plantillas: se reutilizan las existentes; verificar que tengan las variables necesarias (monto pendiente calculado al enviar, fecha de captura, varias cuotas agrupadas). Vista previa con datos de ejemplo.

---

## 9. Fases

| Fase | Qué incluye | Criterio para avanzar |
|---|---|---|
| 0. Planeación | Este documento | Aprobado |
| 1. Configuración (sin WhatsApp) | Tablas y migración, P1 generando registros en outbox (sin enviar), P2 programando, monitor completo con QR **deshabilitado**, configuración del usuario | Pruebas locales: claves de dedupe, cancelaciones, cola offline sin recibos de operaciones rechazadas |
| 2. Conexión | QR activo para **el primer número**, P4, P6, P7. Sin envíos automáticos. Calentamiento manual en paralelo. | 3–4 semanas conectado, sin bloqueos, con conversaciones reales |
| 3. Recibos | P3 solo para recibos, primero a número de prueba | Sin quejas ni bloqueos |
| 4. Presentación | P5 con rampa y freno | Pocos "NO", sin bloqueos |
| 5. Recordatorios | Cuotas y deudores | Fallos < 2 %, sin bloqueos |
| 6. Más números | Agregar los números 2 a 6 **de uno en uno**, cada uno con su propio calentamiento de 3–4 semanas antes de enviar automáticos | Memoria del worker estable y sin bloqueos en los números previos |

---

## 10. Riesgos y medidas

| Riesgo | Medida |
|---|---|
| Bloqueo del número | Calentamiento, cupo de 100, espaciado, variación, opt-out, freno, sin links |
| Ráfaga al sincronizar | Recibos con 20–60 s entre cada uno y agrupados por cliente |
| Recibo de cobro no registrado | Outbox transaccional: sin cobro en BD no hay recibo |
| Recibo duplicado | Clave = Idempotency-Key de la operación |
| Monto desactualizado | Recordatorios calculan el monto al enviar |
| Reenvío tras caída | Estado `enviando` + `revisar`, sin reintento automático |
| Desvinculación | Teléfono principal conectado al menos cada pocos días |
| Deploy reinicia sesión | Worker en contenedor aparte, solo se reinicia si cambia su código |
| La línea caduca | Recordatorio de vigencia; alerta de sesión caída |

---

## 11. Instrucciones para la siguiente conversación

1. Lee este documento completo y `CLAUDE.md`.
2. Verifica el estado de git y el orden de merge de las ramas de la sección 0.
3. Presenta el **plan de implementación de la fase 1** (archivos, migración, pruebas) para aprobación **antes** de escribir código.
4. En la fase 1 no se conecta ni se simula una conexión real a WhatsApp.
5. Ningún envío sin confirmación explícita.
6. Responde siempre en español.

---

## 12. Implementación (v4.14.0)

### Dónde vive cada cosa

| Pieza | Archivo |
|---|---|
| Tablas y migración (solo tablas/tipos nuevos) | `prisma/schema.prisma`, `prisma/migrations/20261010120000_whatsapp_automatico` |
| Reglas puras (cupo, horario, prioridades, opt-out, rampa, freno) | `src/lib/whatsapp-auto/reglas.ts` |
| Qué recordatorios tocan hoy (misma ventana que la Ruta) | `src/lib/whatsapp-auto/planificar.ts` |
| Recibo en la transacción del cobro (P1) | `src/lib/whatsapp-auto/recibos.ts` + los 5 servicios de cobro |
| Idempotency-Key disponible para el recibo | `src/lib/whatsapp-auto/contexto-operacion*.ts`, `src/lib/idempotency.ts` |
| Acciones y datos del monitor | `src/lib/whatsapp-auto/admin.ts`, `src/app/api/monitor/whatsapp`, `src/app/monitor/(panel)/whatsapp` |
| Tarjeta del usuario | `src/lib/whatsapp-auto/usuario.ts`, `src/app/api/whatsapp`, `src/components/config/whatsapp-automatico.tsx` |
| Worker (proceso aparte, paquete npm propio) | `worker/whatsapp/` |

### Worker (`worker/whatsapp/`)

- `index.ts`: reconcilia las órdenes del monitor cada 3 s, despacha cada 5 s, programa recordatorios cada hora, latido cada 30 s, limpieza al arrancar y diario a las 3:00. Arranque escalonado de sesiones (20–40 s entre cada una).
- `sesion.ts`: una conexión de Baileys por cuenta, aislada. Vinculación por **código** (`requestPairingCode`) o QR; verifica que el número vinculado sea el capturado; reconexión 5 s → 15 s → 1 min → 5 min; 401 → sesión borrada; 403/402 → cuenta BLOQUEADA y pausada.
- `auth-bd.ts` + `cifrado.ts`: sesión de Baileys en `WhatsAppLlave`, cifrada AES-256-GCM con `WHATSAPP_SESSION_KEY`.
- `despachador.ts` (P3), `programador.ts` (P2), `receptor.ts` (P4: bajas y acuses), `campana.ts` (P5).
- Tiene su **propio `package.json`**: Baileys depende de `libsignal` desde GitHub, así que se mantiene fuera de la imagen y del lockfile de la app web.

### Decisiones tomadas al implementar

- Los recibos se generan solo para los 5 caminos de cobro acordados (marcar cuota, abonar a cuota, abono repartido, cobrar vencidas, abono a deudor). Las cuotas que se liquidan al **renovar/unificar** no generan recibo automático (siguen el flujo manual del recibo de entrega).
- Un recibo pendiente se revalida al enviarse: si el cobro se revirtió (por cualquier camino, incluso editar o borrar la contrata), si cambió el teléfono o si tiene más de 24 h, se cancela.
- Si el usuario apaga "WhatsApp automático", tampoco salen los recibos que estaban en cola.
- Solo la confirmación de baja/alta sale aunque el usuario lo haya apagado (respeta pausas y paro global).

### El cobro tiene prioridad (v4.14.0, revisión)

- El recibo **nunca** puede hacer fallar un cobro. Todo lo que se prepara antes de guardar va en try/catch; si el INSERT del recibo es lo que falla, el cobro se guarda sin él (solo se reintenta ante errores del recibo: P2002/P2003 sobre `MensajeWhatsApp`, para no cobrar dos veces).
- Sin WhatsApp automático activo, el cobro se escribe exactamente como antes (misma escritura, sin transacción extra, sin id pre-generado).
- Si falla la preparación: renglón `FALLIDO` ("No se pudo preparar…") + `ErrorLog` (origen `whatsapp-recibo`) + alerta en el monitor.
- La app avisa al worker con `pg_notify('whatsapp_salida')`; el worker escucha (`LISTEN`) y despacha al cerrar la ventana de 5 s. Si la escucha se cae, sigue la revisión cada 5 s.

### Pantalla del cobro

- `SeguimientoRecibo` (Ruta, Cobrar pendiente, Abonar) consulta `/api/whatsapp/recibos?claves=` por la Idempotency-Key del cobro:
  - en el teléfono (sin señal) → "se enviará al sincronizar";
  - enviado → "✓ Recibo enviado por WhatsApp";
  - falló, o sin confirmación en **60 s** → "Falló el envío automático del recibo. El cobro sí quedó registrado." + botón manual.
- Al agotarse el tiempo NO se cancela el automático: si sale después, el cliente recibe el mismo recibo dos veces (riesgo aceptado).
- Sin automático o cliente sin teléfono: la pantalla es la de siempre.
- **Reintentar** (monitor) solo vuelve a mandar el mensaje; el cobro ya está registrado. Un recibo que no se pudo preparar no tiene texto: el monitor pide mandarlo a mano.

## 13. Operación

### Primera puesta en marcha (VPS)

1. Respaldo: `./deploy/backup-db.sh` y `pg_restore -l` del archivo.
2. Merge del PR → el deploy aplica la migración (solo tablas nuevas) y actualiza la app. **El worker no arranca solo.**
3. En el VPS, agregar a `.env`: `WHATSAPP_SESSION_KEY=$(openssl rand -base64 32)` (guárdala aparte: si se pierde hay que volver a vincular).
4. Construir y levantar el worker:
   ```bash
   cd ~/kredired
   sudo docker compose --profile whatsapp build whatsapp
   sudo docker compose --profile whatsapp up -d whatsapp
   sudo docker compose logs -f whatsapp
   ```
5. Monitor → WhatsApp: el encabezado debe decir "worker vivo".
6. Asignar el número al usuario → **Código de vinculación** → el usuario lo escribe en WhatsApp → Dispositivos vinculados → Vincular con número de teléfono.
7. El usuario enciende "WhatsApp automático" en Configuración (acepta el riesgo) y elige los tipos. Nada se envía hasta este paso.

### Actualizar el worker

El deploy automático **no** lo reinicia (a propósito). Para no olvidarlo, la app y el worker calculan una **huella** del código que usa el worker (lista única en `worker/whatsapp/huella.mjs`): la app al construirse, el worker al arrancar. El encabezado del monitor muestra las dos (`código app … · worker …`) y, si no coinciden, aparece una alerta roja con el comando. Ahí se repite el paso 4. La sesión queda en la BD: reconecta sola, sin volver a vincular.

Si el worker empieza a importar otro archivo de la app, agrégalo a `ARCHIVOS_DEL_WORKER` en `huella.mjs`.

### Emergencias

- **Paro global** (monitor): corta todos los envíos al instante sin desconectar.
- Pausar una cuenta: botón Pausar en su detalle.
- Apagar el worker por completo: `sudo docker compose --profile whatsapp stop whatsapp`.

