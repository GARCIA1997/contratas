import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { HttpError } from "@/lib/session";
import type { RegistroInput, UsuarioInput } from "@/lib/validaciones";

export type UsuarioResumen = {
  id: string;
  nombre: string | null;
  email: string;
  rol: "ADMIN" | "VIEWER";
  creadoEn: string;
};

/**
 * Usuarios del espacio de trabajo: el dueño (id = ownerId) más los miembros
 * invitados (workspaceOwnerId = ownerId). Nunca lista cuentas de otros
 * espacios — cada registro público es una mini-empresa independiente.
 */
export async function listUsuarios(ownerId: string): Promise<UsuarioResumen[]> {
  const usuarios = await prisma.user.findMany({
    where: { OR: [{ id: ownerId }, { workspaceOwnerId: ownerId }] },
    orderBy: { creadoEn: "asc" },
    select: { id: true, nombre: true, email: true, rol: true, creadoEn: true },
  });
  return usuarios.map((u) => ({
    id: u.id,
    nombre: u.nombre,
    email: u.email,
    rol: u.rol,
    creadoEn: u.creadoEn.toISOString(),
  }));
}

/** Lanza 404 si el usuario no es el dueño ni un miembro del espacio. */
async function requireUsuarioDelEspacio(ownerId: string, id: string) {
  const usuario = await prisma.user.findFirst({
    where: { id, OR: [{ id: ownerId }, { workspaceOwnerId: ownerId }] },
  });
  if (!usuario) throw new HttpError(404, "Usuario no encontrado");
  return usuario;
}

/** Crea un miembro invitado dentro del espacio del dueño. */
export async function crearUsuario(ownerId: string, input: UsuarioInput) {
  const email = input.email.toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    return await prisma.user.create({
      data: {
        email,
        nombre: input.nombre ?? null,
        passwordHash,
        rol: input.rol,
        workspaceOwnerId: ownerId,
      },
      select: { id: true, email: true, rol: true, nombre: true },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new HttpError(409, "Ya existe un usuario con ese email");
    }
    throw e;
  }
}

/**
 * Registro público de una cuenta nueva e independiente: el usuario queda
 * como ADMIN de su propio espacio (contratas, clientes y configuración
 * aislados del resto de las cuentas).
 */
export async function registrarUsuario(input: RegistroInput) {
  const email = input.email.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(input.password, 10);
  try {
    return await prisma.user.create({
      data: {
        email,
        nombre: input.nombre,
        passwordHash,
        rol: "ADMIN",
      },
      select: { id: true, email: true, rol: true, nombre: true },
    });
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new HttpError(409, "Ya existe una cuenta con ese usuario");
    }
    throw e;
  }
}

export async function actualizarUsuario(
  ownerId: string,
  id: string,
  input: { nombre?: string | null; rol?: "ADMIN" | "VIEWER"; password?: string }
) {
  await requireUsuarioDelEspacio(ownerId, id);
  if (id === ownerId && input.rol && input.rol !== "ADMIN") {
    throw new HttpError(400, "El dueño del espacio siempre es ADMIN");
  }

  const data: Prisma.UserUpdateInput = {};
  if (input.nombre !== undefined) data.nombre = input.nombre;
  if (input.rol !== undefined) data.rol = input.rol;
  if (input.password) data.passwordHash = await bcrypt.hash(input.password, 10);

  return prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, rol: true, nombre: true },
  });
}

/**
 * Elimina un miembro del espacio. Impide eliminarse a sí mismo y eliminar
 * al dueño del espacio (su cuenta arrastra todos los datos del espacio).
 */
export async function eliminarUsuario(
  ownerId: string,
  id: string,
  actorId: string
) {
  if (id === actorId) {
    throw new HttpError(400, "No puedes eliminar tu propia cuenta");
  }
  if (id === ownerId) {
    throw new HttpError(400, "No se puede eliminar al dueño del espacio");
  }
  await requireUsuarioDelEspacio(ownerId, id);
  await prisma.user.delete({ where: { id } });
}
