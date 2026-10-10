export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleApiError } from "@/lib/api";
import { requireMonitor } from "@/lib/monitor/datos";
import {
  atenderRevertido,
  cambiarEstadoCampana,
  cambiarNumero,
  cancelarMensaje,
  crearCuenta,
  destinatariosPresentacion,
  eliminarCuenta,
  iniciarCampana,
  panelWhatsApp,
  paroGlobal,
  pausarComoAdmin,
  reactivarOptOut,
  reintentarMensaje,
  solicitar,
} from "@/lib/whatsapp-auto/admin";

export async function GET(req: NextRequest) {
  try {
    await requireMonitor();
    const cuenta = req.nextUrl.searchParams.get("cuenta") ?? undefined;
    if (req.nextUrl.searchParams.get("presentacion") === "1" && cuenta) {
      const lista = await destinatariosPresentacion(cuenta);
      return NextResponse.json({ total: lista.length, muestra: lista.slice(0, 300) });
    }
    return NextResponse.json(await panelWhatsApp(cuenta));
  } catch (error) {
    return handleApiError(error);
  }
}

const id = z.string().min(1).max(100);
const schema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("crear_cuenta"), ownerId: id, numero: z.string().max(30) }),
  z.object({ accion: z.literal("cambiar_numero"), cuentaId: id, numero: z.string().max(30) }),
  z.object({ accion: z.literal("eliminar_cuenta"), cuentaId: id }),
  z.object({ accion: z.literal("vincular_qr"), cuentaId: id }),
  z.object({ accion: z.literal("vincular_codigo"), cuentaId: id }),
  z.object({ accion: z.literal("desconectar"), cuentaId: id }),
  z.object({ accion: z.literal("pausar"), cuentaId: id, pausada: z.boolean() }),
  z.object({ accion: z.literal("paro_global"), activo: z.boolean() }),
  z.object({ accion: z.literal("cancelar_mensaje"), mensajeId: id }),
  z.object({ accion: z.literal("reintentar_mensaje"), mensajeId: id }),
  z.object({ accion: z.literal("atender_revertido"), mensajeId: id }),
  z.object({ accion: z.literal("reactivar_optout"), cuentaId: id, telefono: z.string().max(20) }),
  z.object({ accion: z.literal("iniciar_campana"), cuentaId: id, total: z.number().int().min(1) }),
  z.object({ accion: z.literal("campana"), campanaId: id, operacion: z.enum(["pausar", "reanudar", "terminar"]) }),
]);

export async function POST(req: NextRequest) {
  try {
    const user = await requireMonitor();
    const actor = user.nombre ?? user.email;
    const a = schema.parse(await req.json());
    switch (a.accion) {
      case "crear_cuenta":
        await crearCuenta(a.ownerId, a.numero, actor);
        break;
      case "cambiar_numero":
        await cambiarNumero(a.cuentaId, a.numero, actor);
        break;
      case "eliminar_cuenta":
        await eliminarCuenta(a.cuentaId, actor);
        break;
      case "vincular_qr":
        await solicitar(a.cuentaId, "VINCULAR_QR", actor);
        break;
      case "vincular_codigo":
        await solicitar(a.cuentaId, "VINCULAR_CODIGO", actor);
        break;
      case "desconectar":
        await solicitar(a.cuentaId, "DESCONECTAR", actor);
        break;
      case "pausar":
        await pausarComoAdmin(a.cuentaId, a.pausada, actor);
        break;
      case "paro_global":
        await paroGlobal(a.activo, actor);
        break;
      case "cancelar_mensaje":
        await cancelarMensaje(a.mensajeId, actor);
        break;
      case "reintentar_mensaje":
        await reintentarMensaje(a.mensajeId, actor);
        break;
      case "atender_revertido":
        await atenderRevertido(a.mensajeId);
        break;
      case "reactivar_optout":
        await reactivarOptOut(a.cuentaId, a.telefono, actor);
        break;
      case "iniciar_campana":
        await iniciarCampana(a.cuentaId, a.total, actor);
        break;
      case "campana":
        await cambiarEstadoCampana(a.campanaId, a.operacion, actor);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleApiError(error);
  }
}
