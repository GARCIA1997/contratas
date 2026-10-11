import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * La sesión de WhatsApp equivale a tener el teléfono: se guarda cifrada
 * (AES-256-GCM) con una llave que vive solo en el entorno del worker.
 * Formato: base64(iv[12] | tag[16] | texto cifrado).
 */
function llave(): Buffer {
  const raw = process.env.WHATSAPP_SESSION_KEY;
  const k = raw ? Buffer.from(raw, "base64") : Buffer.alloc(0);
  if (k.length !== 32) {
    throw new Error("WHATSAPP_SESSION_KEY debe ser 32 bytes en base64 (openssl rand -base64 32)");
  }
  return k;
}

let cache: Buffer | null = null;
const k = () => (cache ??= llave());

export function verificarLlave() {
  k();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", k(), iv);
  const datos = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), datos]).toString("base64");
}

export function descifrar(valor: string): string {
  const b = Buffer.from(valor, "base64");
  const d = createDecipheriv("aes-256-gcm", k(), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}
