import { startOfDay } from "date-fns";
import { prisma } from "@/lib/prisma";
import { registrarBitacora } from "@/lib/whatsapp-auto/bitacora";
import { interpretarRespuesta, PRIORIDAD, umbralFreno } from "@/lib/whatsapp-auto/reglas";
import { textoConfirmacionAlta, textoConfirmacionBaja } from "@/lib/whatsapp-auto/textos";
import { diasConEnvioDeCampana } from "./campana";

/**
 * Mensajes que llegan al número automático. Solo interesan las bajas
 * ("NO", "BAJA"…) y las reactivaciones ("ALTA"); cualquier otra respuesta
 * la atiende el dueño del número en su teléfono.
 */
export async function procesarEntrante(cuentaId: string, telefono: string, texto: string | null) {
  const respuesta = interpretarRespuesta(texto);
  if (!respuesta) return;
  const cuenta = await prisma.cuentaWhatsApp.findUnique({
    where: { id: cuentaId },
    select: { id: true, ownerId: true, owner: { select: { configuracion: { select: { nombreApp: true } } } } },
  });
  if (!cuenta) return;
  const nombreApp = cuenta.owner.configuracion?.nombreApp ?? "Kredired";
  const previo = await prisma.optOutWhatsApp.findUnique({ where: { cuentaId_telefono: { cuentaId, telefono } } });

  if (respuesta === "baja") {
    if (previo?.activo) return;
    await prisma.$transaction([
      prisma.optOutWhatsApp.upsert({
        where: { cuentaId_telefono: { cuentaId, telefono } },
        create: { cuentaId, telefono, mensaje: texto ?? "" },
        update: { activo: true, mensaje: texto ?? "", fecha: new Date(), reactivadoEn: null },
      }),
      // Nada automático pendiente le vuelve a llegar.
      prisma.mensajeWhatsApp.updateMany({
        where: { cuentaId, telefono, estado: "PENDIENTE" },
        data: { estado: "CANCELADO", motivo: "El destinatario pidió no recibir mensajes" },
      }),
      confirmar(cuenta, telefono, "baja", textoConfirmacionBaja(nombreApp)),
    ]);
    await registrarBitacora({ cuentaId, tipo: "opt_out", detalle: { telefono, texto } });
    await revisarFreno(cuentaId);
    return;
  }

  if (previo?.activo) {
    await prisma.$transaction([
      prisma.optOutWhatsApp.update({
        where: { cuentaId_telefono: { cuentaId, telefono } },
        data: { activo: false, reactivadoEn: new Date() },
      }),
      confirmar(cuenta, telefono, "alta", textoConfirmacionAlta(nombreApp)),
    ]);
    await registrarBitacora({ cuentaId, tipo: "opt_out_reactivado", detalle: { telefono } });
  }
}

function confirmar(cuenta: { id: string; ownerId: string }, telefono: string, tipo: string, texto: string) {
  return prisma.mensajeWhatsApp.create({
    data: {
      cuentaId: cuenta.id,
      ownerId: cuenta.ownerId,
      tipo: "CONFIRMACION_BAJA",
      prioridad: PRIORIDAD.CONFIRMACION_BAJA,
      telefono,
      destinatarioNombre: telefono,
      claveDedupe: `confirmacion_${tipo}:${cuenta.id}:${telefono}:${Date.now()}`,
      texto,
    },
  });
}

/** Freno de la campaña de presentación: demasiadas bajas en el día la pausan sola. */
async function revisarFreno(cuentaId: string) {
  const campana = await prisma.campanaWhatsApp.findFirst({ where: { cuentaId, estado: "ACTIVA" } });
  if (!campana) return;
  const bajasHoy = await prisma.optOutWhatsApp.count({
    where: { cuentaId, activo: true, fecha: { gte: startOfDay(new Date()) } },
  });
  const umbral = umbralFreno(await diasConEnvioDeCampana(campana.id));
  if (bajasHoy < umbral) return;
  const motivo = `Freno automático: ${bajasHoy} bajas hoy (umbral ${umbral})`;
  await prisma.campanaWhatsApp.update({ where: { id: campana.id }, data: { estado: "PAUSADA", pausaMotivo: motivo } });
  await registrarBitacora({ cuentaId, tipo: "alerta_freno_campana", detalle: { motivo } });
}
