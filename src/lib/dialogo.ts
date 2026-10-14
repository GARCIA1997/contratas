/**
 * Alertas y confirmaciones propias de la app, en lugar de `alert()` /
 * `confirm()` del navegador (que se ven distintas en cada teléfono, muestran
 * la dirección del sitio y en la PWA instalada rompen la apariencia de app).
 *
 * Se llaman igual que las nativas, pero devuelven una promesa:
 *   if (!(await confirmar("¿Eliminar?"))) return;
 *   void avisar("No se pudo eliminar.");
 * Las pinta <DialogoGlobal /> (app) o <DialogoMonitor /> (monitor), montados
 * una sola vez en cada layout.
 */

export type Dialogo = {
  id: number;
  tipo: "aviso" | "confirmacion";
  mensaje: string;
  aceptar: string;
  peligro: boolean;
  resolver: (ok: boolean) => void;
};

let cola: Dialogo[] = [];
let siguienteId = 1;
const oyentes = new Set<(d: Dialogo | null) => void>();

function notificar() {
  const actual = cola[0] ?? null;
  oyentes.forEach((o) => o(actual));
}

function abrir(d: Omit<Dialogo, "id" | "resolver">): Promise<boolean> {
  return new Promise((resolve) => {
    // Sin nadie que lo pinte (no debería pasar): se cae al nativo antes que
    // dejar la acción colgada para siempre.
    if (oyentes.size === 0) {
      if (d.tipo === "aviso") {
        window.alert(d.mensaje);
        resolve(true);
      } else resolve(window.confirm(d.mensaje));
      return;
    }
    cola.push({ ...d, id: siguienteId++, resolver: resolve });
    if (cola.length === 1) notificar();
  });
}

export function cerrarDialogo(id: number, ok: boolean) {
  const d = cola.find((x) => x.id === id);
  if (!d) return;
  cola = cola.filter((x) => x.id !== id);
  d.resolver(ok);
  notificar();
}

export function suscribirDialogo(oyente: (d: Dialogo | null) => void): () => void {
  oyentes.add(oyente);
  oyente(cola[0] ?? null);
  return () => oyentes.delete(oyente);
}

export function confirmar(mensaje: string, opts: { aceptar?: string; peligro?: boolean } = {}): Promise<boolean> {
  return abrir({ tipo: "confirmacion", mensaje, aceptar: opts.aceptar ?? "Aceptar", peligro: opts.peligro ?? false });
}

export async function avisar(mensaje: string): Promise<void> {
  await abrir({ tipo: "aviso", mensaje, aceptar: "Entendido", peligro: false });
}
