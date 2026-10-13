import { mensajeCobro, type CobroContrata } from "@/lib/mensajes-whatsapp";

/** Lo que se guarda en `MensajeWhatsApp.datos` para poder juntar recibos al enviar. */
export type DatosRecibo = { total: number; contratas: CobroContrata[] };

const r2 = (n: number) => Math.round(n * 100) / 100;

function esDatos(d: unknown): d is DatosRecibo {
  const x = d as DatosRecibo | null;
  return !!x && typeof x.total === "number" && Array.isArray(x.contratas);
}

/**
 * Solo por id: dos contratas distintas del mismo cliente pueden tener el
 * mismo tipo, monto y cuotas, y juntarlas mostraría un solo saldo.
 */
function mismaContrata(a: CobroContrata, b: CobroContrata): boolean {
  return Boolean(a.contrataId) && a.contrataId === b.contrataId;
}

/**
 * Junta varios recibos de cobro del mismo cliente en UN comprobante (un solo
 * encabezado y un solo TOTAL). Null si alguno no trae datos estructurados
 * (recibo viejo o de abono a deudor): entonces se concatenan los textos.
 */
export function unirRecibos(opts: {
  nombreApp: string;
  clienteNombre: string;
  datos: unknown[];
  fecha?: Date;
}): string | null {
  if (opts.datos.length < 2 || !opts.datos.every(esDatos)) return null;
  const contratas: CobroContrata[] = [];
  for (const d of opts.datos as DatosRecibo[]) {
    for (const c of d.contratas) {
      const previa = contratas.find((x) => mismaContrata(x, c));
      if (!previa) {
        contratas.push({ ...c, cuotas: [...c.cuotas] });
        continue;
      }
      previa.cuotas = [...previa.cuotas, ...c.cuotas].sort((a, b) => a.numeroCuota - b.numeroCuota);
      previa.subtotal = r2(previa.subtotal + c.subtotal);
      if (previa.saldoTrasCobro !== undefined && c.saldoTrasCobro !== undefined) {
        previa.saldoTrasCobro = Math.min(previa.saldoTrasCobro, c.saldoTrasCobro);
      }
    }
  }
  const total = r2((opts.datos as DatosRecibo[]).reduce((s, d) => s + d.total, 0));
  return mensajeCobro({ nombreApp: opts.nombreApp, clienteNombre: opts.clienteNombre, total, contratas, fecha: opts.fecha });
}
