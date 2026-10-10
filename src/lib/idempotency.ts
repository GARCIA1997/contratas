import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { conClaveOperacion } from "@/lib/whatsapp-auto/contexto-operacion-servidor";

/**
 * Cuánto se espera a que termine una operación que otra petición ya tomó
 * antes de considerar que ese proceso murió y poder retomarla. Tiene que
 * ser holgadamente mayor que la mutación más lenta (renovar/unificar, que
 * recalendarizan cuotas dentro de una transacción).
 */
const VENTANA_EN_CURSO_MS = 2 * 60 * 1000;

/**
 * Se devuelve mientras otra petición con la misma key sigue ejecutando la
 * mutación. Es 503 y no 409 a propósito: la cola offline trata cualquier
 * 4xx como "conflicto" y lo excluye para siempre de los reintentos
 * automáticos (ver `flushQueue`), mientras que un 5xx lo deja como "failed"
 * y lo vuelve a intentar solo — que es justo lo que queremos aquí, porque
 * no es un error del cliente sino un "todavía no, vuelve a preguntar".
 */
function enCurso(): HttpError {
  return new HttpError(
    503,
    "Esta operación todavía se está procesando. Se reintentará sola."
  );
}

/**
 * Protege una mutación contra reintentos duplicados (p. ej. la cola de
 * escritura offline reintentando tras perder la respuesta del servidor).
 *
 * La fila de `ProcessedOperation` se inserta ANTES de ejecutar la mutación,
 * no después: la llave primaria hace de candado, así que de dos peticiones
 * concurrentes con la misma key solo una gana el insert y ejecuta. La otra
 * recibe 503 y reintenta más tarde, cuando ya hay un resultado guardado que
 * devolver.
 *
 * El orden importa — consultar y luego ejecutar (como se hacía antes) deja
 * una ventana en la que ambas peticiones ven "no procesada" y ambas cobran.
 */
export async function withIdempotency<T>(
  req: NextRequest,
  ownerId: string,
  endpoint: string,
  run: () => Promise<T>
): Promise<T> {
  const key = req.headers.get("Idempotency-Key");
  if (!key) return run();
  // El recibo automático de WhatsApp usa esta misma key como clave única.
  const ejecutar = () => conClaveOperacion(key, run);

  try {
    await prisma.processedOperation.create({
      data: { id: key, ownerId, endpoint, completada: false },
    });
  } catch {
    // La key ya existe: o alguien la está ejecutando ahora, o ya terminó.
    return resolverExistente(key, ownerId, endpoint, ejecutar);
  }

  return ejecutarYGuardar(key, ejecutar);
}

/** Corre la mutación con la reserva ya tomada y guarda su resultado. */
async function ejecutarYGuardar<T>(key: string, run: () => Promise<T>): Promise<T> {
  let resultado: T;
  try {
    resultado = await run();
  } catch (e) {
    // La mutación falló, así que no hay nada que memorizar: se libera la
    // reserva para que el reintento pueda volver a intentarlo (mismo
    // comportamiento que antes, cuando un fallo simplemente no dejaba
    // registro). Si no se liberara, el reintento chocaría contra su propia
    // reserva y quedaría atorado en 503 hasta que expirara la ventana.
    await prisma.processedOperation.delete({ where: { id: key } }).catch(() => undefined);
    throw e;
  }
  // La mutación YA se aplicó: si falla guardar el resultado no se debe
  // liberar la reserva ni responder error — el reintento volvería a
  // ejecutarla (duplicado) o chocaría con el id ya creado (500 eterno que
  // atora la cola). La reserva queda "en curso" y, pasada la ventana, un
  // reintento la retoma; las altas con id del teléfono se reconocen como
  // ya hechas (ver `contrataYaCreada`) en vez de duplicarse.
  await prisma.processedOperation
    .update({
      where: { id: key },
      data: { resultado: resultado as object, completada: true },
    })
    .catch(() => undefined);
  return resultado;
}

async function resolverExistente<T>(
  key: string,
  ownerId: string,
  endpoint: string,
  run: () => Promise<T>
): Promise<T> {
  const previo = await prisma.processedOperation.findUnique({ where: { id: key } });

  // Desapareció entre el insert fallido y esta consulta: quien la tenía
  // falló y la liberó, así que este intento es legítimo.
  if (!previo) return run();

  // Misma key para otra operación distinta: no es un reintento de esto,
  // no hay nada memorizado que aplique.
  if (previo.ownerId !== ownerId || previo.endpoint !== endpoint) return run();

  if (previo.completada) return previo.resultado as T;

  // Reservada pero sin resultado: alguien la está ejecutando ahora mismo.
  const edadMs = Date.now() - previo.creadoEn.getTime();
  if (edadMs < VENTANA_EN_CURSO_MS) throw enCurso();

  // Pasó la ventana sin completarse: el proceso que la tomó murió (deploy a
  // media petición, reinicio del contenedor). Se retoma, pero con un candado
  // optimista sobre `creadoEn` para que dos peticiones que expiren a la vez
  // no la retomen las dos.
  const retomada = await prisma.processedOperation.updateMany({
    where: { id: key, completada: false, creadoEn: previo.creadoEn },
    data: { creadoEn: new Date() },
  });
  if (retomada.count === 0) throw enCurso();

  return ejecutarYGuardar(key, run);
}
