import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import { limpiarNombre, normalizarNombre } from "@/lib/beneficiarios";

/**
 * Mantenimiento de beneficiarios (función "beneficiarios"). Son acciones de
 * administrador y requieren señal: mueven contratas entre personas o
 * clientes, y eso lo decide el servidor, no el teléfono.
 */

async function deEsteEspacio(ownerId: string, id: string) {
  const b = await prisma.beneficiario.findFirst({ where: { id, ownerId } });
  if (!b) throw new HttpError(404, "Beneficiario no encontrado");
  return b;
}

/** Corrige el nombre en todas sus contratas a la vez. */
export async function renombrarBeneficiario(ownerId: string, id: string, nombre: string) {
  const b = await deEsteEspacio(ownerId, id);
  const limpio = limpiarNombre(nombre);
  const nombreNormalizado = normalizarNombre(limpio);
  if (!nombreNormalizado) throw new HttpError(400, "Escribe un nombre");
  const otro = await prisma.beneficiario.findFirst({
    where: { clienteId: b.clienteId, nombreNormalizado, id: { not: id } },
    select: { nombre: true },
  });
  if (otro) throw new HttpError(409, `Ya existe «${otro.nombre}» en este cliente: usa «Unir» para juntarlos`);
  return prisma.beneficiario.update({ where: { id }, data: { nombre: limpio, nombreNormalizado } });
}

/**
 * Junta dos beneficiarios duplicados del mismo cliente ("Alex" y
 * "Alejandro"): las contratas de `origenId` pasan a `destinoId` y el
 * sobrante se borra. No toca pagos ni montos.
 */
export async function unirBeneficiarios(ownerId: string, origenId: string, destinoId: string) {
  if (origenId === destinoId) throw new HttpError(400, "Elige otro beneficiario");
  const [origen, destino] = await Promise.all([deEsteEspacio(ownerId, origenId), deEsteEspacio(ownerId, destinoId)]);
  if (origen.clienteId !== destino.clienteId) throw new HttpError(400, "Solo se unen beneficiarios del mismo cliente");
  const [movidas] = await prisma.$transaction([
    prisma.contrata.updateMany({ where: { ownerId, beneficiarioId: origenId }, data: { beneficiarioId: destinoId } }),
    prisma.beneficiario.delete({ where: { id: origenId } }),
  ]);
  return { contratasMovidas: movidas.count, destino: { id: destino.id, nombre: destino.nombre } };
}

/**
 * El beneficiario pasa a ser cliente propio: se crea el cliente, sus
 * contratas se mueven a él (sin beneficiario) y el beneficiario se borra.
 * Desde entonces los mensajes de esas contratas le llegan a él (si tiene
 * teléfono), no al cliente que las cobraba.
 */
export async function convertirEnCliente(ownerId: string, id: string, telefono: string | null) {
  const b = await deEsteEspacio(ownerId, id);
  return prisma.$transaction(async (tx) => {
    const cliente = await tx.cliente.create({
      data: { ownerId, nombre: b.nombre, telefono: telefono?.trim() || null },
      select: { id: true, nombre: true },
    });
    const movidas = await tx.contrata.updateMany({
      where: { ownerId, beneficiarioId: id },
      data: { clienteId: cliente.id, beneficiarioId: null },
    });
    await tx.beneficiario.delete({ where: { id } });
    return { cliente, contratasMovidas: movidas.count };
  });
}
