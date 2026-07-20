import webpush from "web-push";
import { startOfDay, endOfDay, addHours, subHours } from "date-fns";
import { prisma } from "@/lib/prisma";
import { anclarFechaCliente } from "@/lib/fechas";

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@contratas.app";

export const pushEnabled = !!PUBLIC && !!PRIVATE;

if (pushEnabled) {
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
}

export function vapidPublicKey(): string {
  return PUBLIC;
}

type Payload = {
  title: string;
  body: string;
  url?: string;
};

/** Envía una notificación a todas las suscripciones de un usuario. */
export async function enviarAOwner(ownerId: string, payload: Payload) {
  if (!pushEnabled) return { enviadas: 0, deshabilitado: true };

  const subs = await prisma.pushSubscription.findMany({ where: { ownerId } });
  let enviadas = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: s.endpoint,
            keys: { p256dh: s.p256dh, auth: s.auth },
          },
          JSON.stringify(payload)
        );
        enviadas += 1;
      } catch (e) {
        // 404/410 → suscripción caducada; se limpia.
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        }
      }
    })
  );

  return { enviadas, deshabilitado: false };
}

/**
 * Cuenta las cuotas que vencen hoy (no pagadas) de un usuario y arma el
 * texto del recordatorio. Devuelve null si no hay cobros hoy.
 */
export async function recordatorioCobrosHoy(
  ownerId: string,
  hoy: Date = new Date()
): Promise<Payload | null> {
  // El filtro en SQL usa un margen de 12h a cada lado: `fechaProgramada`
  // guarda una fecha calendario (sin hora), pero cuotas generadas antes de
  // fijar la zona horaria del servidor pueden haber quedado desfasadas
  // unas horas del "medianoche México" esperado. El filtro exacto por día
  // calendario se hace después, en JS, con `anclarFechaCliente` (igual que
  // el resto de la lógica de vencido/próximo).
  const pagosCandidatos = await prisma.pago.findMany({
    where: {
      pagado: false,
      fechaProgramada: {
        gte: subHours(startOfDay(hoy), 12),
        lte: addHours(endOfDay(hoy), 12),
      },
      contrata: { ownerId },
    },
    include: { contrata: { include: { cliente: true } } },
  });

  // `hoy` es un instante en vivo (no una fecha calendario guardada): se
  // ancla con `startOfDay` local, no con `anclarFechaCliente` (que lee
  // componentes UTC y daría el día equivocado cerca de medianoche).
  const hoyAnclado = startOfDay(hoy);
  const pagos = pagosCandidatos.filter(
    (p) =>
      anclarFechaCliente(p.fechaProgramada).getTime() === hoyAnclado.getTime()
  );

  if (pagos.length === 0) return null;

  const total = pagos.reduce((s, p) => s + p.contrata.abono, 0);
  const nombres = Array.from(
    new Set(pagos.map((p) => p.contrata.cliente.nombre))
  );
  const detalle =
    nombres.length <= 3
      ? nombres.join(", ")
      : `${nombres.slice(0, 3).join(", ")} y ${nombres.length - 3} más`;

  return {
    title: `Cobros de hoy (${pagos.length})`,
    body: `${detalle}. Total esperado: $${total.toLocaleString("es-MX")}`,
    url: "/",
  };
}
