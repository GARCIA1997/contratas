import { prisma } from "@/lib/prisma";
import { FUNCIONES, type ClaveFuncion } from "@/lib/funciones";

/** Claves de las funciones encendidas para el espacio (solo las del catálogo). */
export async function funcionesActivas(ownerId: string): Promise<ClaveFuncion[]> {
  const filas = await prisma.funcionEspacio.findMany({
    where: { ownerId, activa: true },
    select: { clave: true },
  });
  return filas.map((f) => f.clave).filter((c): c is ClaveFuncion => c in FUNCIONES);
}

export async function tieneFuncion(ownerId: string, clave: ClaveFuncion): Promise<boolean> {
  const fila = await prisma.funcionEspacio.findUnique({
    where: { ownerId_clave: { ownerId, clave } },
    select: { activa: true },
  });
  return fila?.activa ?? false;
}

/** Enciende o apaga una función para un espacio (solo dueños: los miembros heredan la de su espacio). */
export async function cambiarFuncion(ownerId: string, clave: ClaveFuncion, activa: boolean, actor: string) {
  const dueno = await prisma.user.findFirst({ where: { id: ownerId, workspaceOwnerId: null }, select: { id: true } });
  if (!dueno) throw new Error("Solo se activan funciones a dueños de espacio");
  await prisma.funcionEspacio.upsert({
    where: { ownerId_clave: { ownerId, clave } },
    create: { ownerId, clave, activa, actualizadoPor: actor },
    update: { activa, actualizadoPor: actor },
  });
}

/** Para el monitor: estado de cada función por espacio. */
export async function tablaFunciones() {
  const [duenos, filas] = await Promise.all([
    prisma.user.findMany({
      where: { workspaceOwnerId: null },
      select: { id: true, nombre: true, email: true },
      orderBy: { creadoEn: "asc" },
    }),
    prisma.funcionEspacio.findMany(),
  ]);
  const de = new Map(filas.map((f) => [`${f.ownerId}:${f.clave}`, f]));
  return {
    duenos,
    estado: (ownerId: string, clave: ClaveFuncion) => de.get(`${ownerId}:${clave}`) ?? null,
  };
}
