/** Limpia el teléfono a solo dígitos (formato requerido por wa.me). */
export function soloDigitos(telefono: string): string {
  return telefono.replace(/[^\d]/g, "");
}

/**
 * Link de WhatsApp para enviar `mensaje`: directo al contacto si hay
 * teléfono guardado, o de selección libre (el usuario elige el contacto al
 * abrir WhatsApp) si no.
 */
export function linkWhatsApp(telefono: string | null, mensaje: string): string {
  const digitos = telefono ? soloDigitos(telefono) : null;
  return digitos
    ? `https://wa.me/${digitos}?text=${encodeURIComponent(mensaje)}`
    : `https://wa.me/?text=${encodeURIComponent(mensaje)}`;
}
