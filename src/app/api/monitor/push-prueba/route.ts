export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { handleApiError } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { enviarAUsuarios } from "@/lib/push";
import { requireMonitor } from "@/lib/monitor/datos";

/**
 * Manda un aviso push de prueba SOLO a los dispositivos de quien lo pide:
 * así se comprueba que le llegarán los avisos de incidentes de WhatsApp.
 */
export async function POST() {
  try {
    const user = await requireMonitor();
    const [dispositivos, antiguas] = await Promise.all([
      prisma.pushSubscription.count({ where: { userId: user.id } }),
      // Suscripciones de antes de guardar quién las activó: los avisos del
      // monitor no les llegan (van por persona, no por espacio).
      prisma.pushSubscription.count({ where: { ownerId: user.ownerId, userId: null } }),
    ]);
    const r = await enviarAUsuarios([user.id], {
      title: "Kredired Monitor: aviso de prueba",
      body: "Si ves esto, te llegarán los avisos cuando el WhatsApp automático tenga un problema.",
      url: "/monitor/whatsapp",
    });
    return NextResponse.json({ ...r, dispositivos, antiguas });
  } catch (error) {
    return handleApiError(error);
  }
}
