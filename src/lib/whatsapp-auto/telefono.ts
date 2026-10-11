/**
 * Teléfonos para el envío automático: solo dígitos con lada de país.
 *
 * Todo lo que se compara (opt-out, presentación, cambio de teléfono) usa
 * esta forma, así que "312 112 8425", "+52 312 112 8425" y "5213121128425"
 * son el mismo número. Los celulares de México viejos traían un 1 después
 * del 52 (521…); WhatsApp ya no lo usa, se quita.
 */
export function normalizarTelefono(telefono: string | null | undefined): string | null {
  if (!telefono) return null;
  const d = telefono.replace(/\D/g, "");
  if (d.length === 10) return `52${d}`;
  if (d.length === 13 && d.startsWith("521")) return `52${d.slice(3)}`;
  if (d.length === 12 && d.startsWith("52")) return d;
  // Otros países: se acepta tal cual si tiene un largo razonable (E.164).
  if (d.length >= 11 && d.length <= 15) return d;
  return null;
}

export function jidDe(telefonoNormalizado: string): string {
  return `${telefonoNormalizado}@s.whatsapp.net`;
}

/** "523121128425:12@s.whatsapp.net" → "523121128425". */
export function telefonoDeJid(jid: string | null | undefined): string | null {
  if (!jid) return null;
  return normalizarTelefono(jid.split("@")[0].split(":")[0]);
}
