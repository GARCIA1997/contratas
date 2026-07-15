import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type SessionUser = {
  id: string;
  email: string;
  nombre: string | null;
  rol: "ADMIN" | "VIEWER";
  /**
   * Espacio de trabajo efectivo: el id del dueño del espacio si el usuario
   * es un miembro invitado, o su propio id si es dueño. TODO dato de
   * dominio (clientes, contratas, deudores, config) se scopea con esto,
   * nunca con `id`.
   */
  ownerId: string;
};

/** Devuelve el usuario autenticado o lanza 401. Base del aislamiento por espacio. */
export async function requireUser(): Promise<SessionUser> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    throw new HttpError(401, "No autenticado");
  }
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    nombre: session.user.name ?? null,
    rol: session.user.rol,
    ownerId: session.user.ownerId || session.user.id,
  };
}

/** Como requireUser pero exige rol ADMIN (escritura). */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.rol !== "ADMIN") {
    throw new HttpError(403, "Requiere permisos de administrador");
  }
  return user;
}
