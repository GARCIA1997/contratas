import { prisma } from "@/lib/prisma";

/** Registra cada corrida de un proceso periódico (sección Procesos del monitor). */
export async function conProceso(proceso: string, cuentaId: string | null, fn: () => Promise<number>) {
  const fila = await prisma.procesoWhatsApp.create({ data: { proceso, cuentaId } });
  try {
    const procesados = await fn();
    await prisma.procesoWhatsApp.update({ where: { id: fila.id }, data: { fin: new Date(), ok: true, procesados } });
  } catch (e) {
    await prisma.procesoWhatsApp.update({
      where: { id: fila.id },
      data: { fin: new Date(), ok: false, error: e instanceof Error ? e.message : String(e) },
    });
  }
}
