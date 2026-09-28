/** Limpia el teléfono a solo dígitos (formato requerido por wa.me). */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/[^\d]/g, "");
}

/**
 * WhatsApp necesita el número con código de país. Un número mexicano
 * capturado a 10 dígitos (sin +52) no abría el chat; se completa con 52.
 * Los que ya traen lada (12+ dígitos) no se tocan.
 */
function conLada(digitos: string): string {
  return digitos.length === 10 ? `52${digitos}` : digitos;
}

/**
 * Link de WhatsApp para enviar `mensaje`: directo al contacto si hay
 * teléfono guardado, o de selección libre (el usuario elige el contacto al
 * abrir WhatsApp) si no.
 *
 * Con teléfono se usa el esquema nativo `whatsapp://` en vez de
 * `https://wa.me/...` — reportado en campo: sin señal, el link de wa.me a
 * veces no abría la app. wa.me depende de que el sistema resuelva un
 * "universal link" sobre una URL https real; whatsapp:// es un esquema de
 * app que el SO intercepta directo, sin tocar la red, para abrir la
 * conversación ya armada (el envío en sí lo maneja WhatsApp con su propia
 * conexión, en cuanto la tenga). Sin teléfono no hay más remedio que
 * wa.me (deja elegir el contacto), que sí depende de cargar esa página.
 */
export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const digitos = telefono ? conLada(soloDigitos(telefono)) : null;
  return digitos
    ? `whatsapp://send?phone=${digitos}&text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}
