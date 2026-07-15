import type { Rol } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      rol: Rol;
      /** Espacio de trabajo efectivo: el del dueño si es miembro, el propio si no. */
      ownerId: string;
    } & DefaultSession["user"];
  }

  interface User {
    rol?: Rol;
    ownerId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    rol?: Rol;
    ownerId?: string;
  }
}
