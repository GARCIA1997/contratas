/**
 * Qué app de WhatsApp abren los envíos manuales en ESTE teléfono.
 *
 * Con dos cuentas en el mismo teléfono (WhatsApp y WhatsApp Business), el
 * enlace `whatsapp://` abre la que el sistema decida. En Android se puede
 * forzar la app con un enlace "intent" que nombra el paquete. En iPhone no
 * hay forma confiable (las dos apps registran el mismo esquema), así que
 * ahí siempre decide el sistema.
 *
 * Se guarda en el teléfono (no en la cuenta): cada teléfono tiene sus apps.
 */

export type AppWhatsApp = "sistema" | "normal" | "business";

const CLAVE = "kredired:whatsapp-app";

const PAQUETE: Record<Exclude<AppWhatsApp, "sistema">, string> = {
  normal: "com.whatsapp",
  business: "com.whatsapp.w4b",
};

export function leerAppWhatsApp(): AppWhatsApp {
  try {
    const v = localStorage.getItem(CLAVE);
    return v === "normal" || v === "business" ? v : "sistema";
  } catch {
    return "sistema";
  }
}

export function guardarAppWhatsApp(app: AppWhatsApp) {
  try {
    if (app === "sistema") localStorage.removeItem(CLAVE);
    else localStorage.setItem(CLAVE, app);
  } catch {
    // Sin almacenamiento: se queda el comportamiento del sistema.
  }
}

export function esAndroid(userAgent: string): boolean {
  return /Android/i.test(userAgent);
}

/**
 * `whatsapp://send?phone=…&text=…` → intent de Android hacia la app elegida.
 * Cualquier otro enlace (o "sistema") se devuelve igual.
 */
export function enlaceParaApp(href: string, app: AppWhatsApp): string {
  if (app === "sistema" || !href.startsWith("whatsapp://")) return href;
  const resto = href.slice("whatsapp://".length);
  return `intent://${resto}#Intent;scheme=whatsapp;package=${PAQUETE[app]};end`;
}
