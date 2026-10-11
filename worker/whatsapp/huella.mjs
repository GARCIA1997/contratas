import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Huella del código que usa el worker de WhatsApp.
 *
 * La app la calcula al construirse (next.config.mjs) y el worker al
 * arrancar; el monitor las compara. Si difieren, cambió código que el
 * worker usa y hay que reconstruirlo (el deploy no lo reinicia a propósito).
 *
 * ÚNICA lista de lo que cuenta: si el worker empieza a importar otro
 * archivo de la app, agrégalo aquí.
 */
export const ARCHIVOS_DEL_WORKER = [
  "worker/whatsapp",
  "src/lib/whatsapp-auto",
  "src/lib/mensajes-whatsapp.ts",
  "src/lib/fechas.ts",
  "src/lib/contrata.ts",
  "src/lib/services/deudores.ts",
  "src/lib/utils.ts",
  "src/lib/prisma.ts",
  "prisma/schema.prisma",
];

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const IGNORAR = /(^|\/)(node_modules|\.turbo)(\/|$)|\.test\.ts$/;

function archivos(ruta) {
  const abs = join(RAIZ, ruta);
  let info;
  try {
    info = statSync(abs);
  } catch {
    return [];
  }
  if (info.isFile()) return [ruta];
  return readdirSync(abs)
    .flatMap((n) => archivos(join(ruta, n)))
    .filter((r) => !IGNORAR.test(r));
}

/** SHA-256 de rutas + contenido, en orden estable. Devuelve 12 caracteres. */
export function calcularHuella() {
  const h = createHash("sha256");
  const lista = ARCHIVOS_DEL_WORKER.flatMap(archivos)
    .map((r) => relative(RAIZ, join(RAIZ, r)).split("\\").join("/"))
    .sort();
  for (const r of lista) {
    h.update(r);
    h.update("\0");
    h.update(readFileSync(join(RAIZ, r)));
    h.update("\0");
  }
  return h.digest("hex").slice(0, 12);
}
