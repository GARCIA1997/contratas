/**
 * Textos propios del envío automático. Los recibos y recordatorios usan las
 * plantillas de siempre (`mensajes-whatsapp.ts`); aquí solo va lo que no
 * existía: presentación, la línea de presentación del primer mensaje y la
 * confirmación de baja.
 *
 * La presentación rota entre varias versiones: el mismo texto idéntico a
 * cientos de contactos es justo lo que el antispam de WhatsApp castiga.
 */

/**
 * `r` = primer nombre de quien manda (el dueño de la cuenta, p. ej.
 * "Alejandro"), para que el cliente reconozca a la persona y no solo la
 * marca: "le escribe Alejandro de Kredired". Sin nombre capturado, el texto
 * habla en nombre del negocio.
 */
const PRESENTACIONES = [
  (n: string, app: string, r: string | null) =>
    `Hola ${n}, ${r ? `le escribe ${r} de ${app}` : `le escribimos de ${app}`}. A partir de hoy recibirá sus recordatorios y comprobantes de pago desde este número. Si no desea recibir mensajes, responda NO y no le volveremos a escribir.`,
  (n: string, app: string, r: string | null) =>
    `Buen día ${n}. ${r ? `Soy ${r}, de ${app}` : `Somos ${app}`}: desde este número le haremos llegar sus comprobantes y avisos de pago. Puede guardarlo en sus contactos. Si prefiere no recibirlos, conteste NO.`,
  (n: string, app: string, r: string | null) =>
    `Hola ${n}, este es el nuevo número de ${r ? `${r}, de ${app}` : app}. Por aquí le enviaremos sus recibos y recordatorios. Si no desea recibir estos mensajes, responda NO.`,
  (n: string, app: string, r: string | null) =>
    `${n}, le saluda ${r ? `${r} de ${app}` : app}. Le avisamos que sus comprobantes y recordatorios de pago llegarán desde este número. Si no quiere recibirlos, solo responda NO.`,
];

export function textoPresentacion(
  nombre: string,
  nombreApp: string,
  indice: number,
  remitente?: string | null
): string {
  const f = PRESENTACIONES[Math.abs(indice) % PRESENTACIONES.length];
  return f(primerNombre(nombre), nombreApp, nombreRemitente(remitente));
}

/** Va antes del primer mensaje a alguien que todavía no recibió la presentación. */
export function lineaPresentacion(nombreApp: string, remitente?: string | null): string {
  const r = nombreRemitente(remitente);
  const quien = r ? `Le escribe ${r} de *${nombreApp}*` : `Le escribimos de *${nombreApp}*`;
  return `👋 ${quien}. Desde este número recibirá sus comprobantes y recordatorios (si no desea recibirlos, responda NO).`;
}

/**
 * Primer nombre del usuario para firmar. Se descarta lo que no parece un
 * nombre (vacío, un correo o un número), para no mandar "le escribe
 * alejandro@gmail.com".
 */
export function nombreRemitente(nombre: string | null | undefined): string | null {
  if (!nombre || /[@\d]/.test(nombre)) return null;
  return primerNombre(nombre) || null;
}

export function textoConfirmacionBaja(nombreApp: string): string {
  return `Listo, no le enviaremos más mensajes automáticos de ${nombreApp}. Si cambia de opinión, responda ALTA.`;
}

export function textoConfirmacionAlta(nombreApp: string): string {
  return `Listo, volverá a recibir sus comprobantes y recordatorios de ${nombreApp}.`;
}

function primerNombre(nombre: string): string {
  const p = nombre.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}
