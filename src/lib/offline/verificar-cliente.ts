import { db } from "@/lib/offline/db";
import { debeTrabajarLocal, fetchConTimeout } from "@/lib/offline/conexion";
import { normalizarTexto, soloDigitos } from "@/lib/texto";
import type { ClienteDeOtro, ResultadoVerificacion } from "@/lib/services/clientes-globales";

/**
 * ¿El cliente que se está por registrar ya existe?
 *
 * Reportado en campo: un alta fallaba en pantalla pero sí se había ido a la
 * cola (o al servidor) sin verse todavía en el teléfono, y el cobrador lo
 * registraba otra vez — cliente duplicado. Por eso se revisa en TRES lados:
 *  1. el teléfono (IndexedDB),
 *  2. la cola de pendientes (un alta que aún no sube),
 *  3. el servidor, si hay señal (lo propio que el teléfono aún no bajó, y
 *     los clientes de otros administradores con el mismo teléfono).
 */

/** Los últimos 10 dígitos: "+52 313 191 1315" y "3131911315" son el mismo. */
export function telefonoClave(telefono: string | null | undefined): string | null {
  const d = soloDigitos(telefono ?? "");
  return d.length >= 10 ? d.slice(-10) : null;
}

export type Verificacion =
  | { tipo: "nuevo" }
  /** Nombre y teléfono iguales (o solo nombre si no hay teléfono): ya es tuyo. */
  | {
      tipo: "propio";
      cliente: { id: string; nombre: string; telefono: string | null };
      /** Está en el teléfono pero su alta todavía no sube (cola). */
      enCola: boolean;
      /** Está en el servidor pero no en el teléfono (falta sincronizar). */
      soloEnServidor: boolean;
    }
  /** Solo coincide el teléfono: ese número es de otra persona. */
  | {
      tipo: "telefono";
      duenoDelNumero: string;
      /** null = es un cliente tuyo; si no, el administrador que lo tiene. */
      administrador: string | null;
    }
  /** Nombre y teléfono iguales en el espacio de otro administrador. */
  | { tipo: "otros"; otros: ClienteDeOtro[] };

export async function verificarClienteNuevo(
  ownerId: string,
  datos: { nombre: string; telefono?: string | null }
): Promise<Verificacion> {
  const tel = telefonoClave(datos.telefono);
  const nombre = normalizarTexto(datos.nombre);
  const mismoNombre = (c: { nombre: string }) => !!nombre && normalizarTexto(c.nombre) === nombre;
  const mismoTel = (c: { telefono: string | null }) => !!tel && telefonoClave(c.telefono) === tel;

  // 1 y 2: teléfono + cola. Un alta en cola ya tiene su fila local (el
  // efecto optimista la inserta), así que basta con buscar en clientes y
  // luego ver si su alta sigue pendiente.
  if (db) {
    const locales = (await db.clientes.where("ownerId").equals(ownerId).toArray()).filter((c) => !c._deletedAt);
    const igual = tel ? locales.find((c) => mismoTel(c) && mismoNombre(c)) : locales.find(mismoNombre);
    if (igual) {
      const enCola =
        (await db.writeQueue
          .where("ownerId")
          .equals(ownerId)
          .filter((op) => op.type === "cliente.crear" && (op.payload as { id?: string }).id === igual.id)
          .count()) > 0;
      return {
        tipo: "propio",
        cliente: { id: igual.id, nombre: igual.nombre, telefono: igual.telefono },
        enCola,
        soloEnServidor: false,
      };
    }
    const numero = tel ? locales.find(mismoTel) : undefined;
    if (numero) return { tipo: "telefono", duenoDelNumero: numero.nombre, administrador: null };
  }

  // 3: servidor. Sin señal (o en modo local) se omite: no hay forma de
  // saberlo y no se debe frenar el alta en campo.
  if (debeTrabajarLocal()) return { tipo: "nuevo" };
  try {
    const res = await fetchConTimeout(
      "/api/clientes/verificar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: datos.nombre, telefono: datos.telefono ?? null }),
      },
      6_000
    );
    if (!res.ok) return { tipo: "nuevo" };
    const r = (await res.json()) as ResultadoVerificacion;
    if (r.propio) return { tipo: "propio", cliente: r.propio, enCola: false, soloEnServidor: true };
    if (r.telefonoPropio) return { tipo: "telefono", duenoDelNumero: r.telefonoPropio.nombre, administrador: null };
    const mismo = r.otros.filter((o) => o.mismoNombre);
    if (mismo.length > 0) return { tipo: "otros", otros: mismo };
    if (r.otros[0]) {
      return { tipo: "telefono", duenoDelNumero: r.otros[0].nombre, administrador: r.otros[0].administrador };
    }
  } catch {
    // Red lenta o caída: se sigue con el alta normal.
  }
  return { tipo: "nuevo" };
}
