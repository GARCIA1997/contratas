import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import type { Rol } from "@prisma/client";

const googleEnabled =
  !!process.env.GOOGLE_CLIENT_ID && !!process.env.GOOGLE_CLIENT_SECRET;

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        });
        if (!user?.passwordHash) return null;

        const ok = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!ok) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.nombre,
          image: user.image,
          rol: user.rol,
          // Espacio efectivo: el del dueño si es miembro invitado, el propio si no.
          ownerId: user.workspaceOwnerId ?? user.id,
        };
      },
    }),
    ...(googleEnabled
      ? [
          GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID!,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          }),
        ]
      : []),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in `user` is present. For Google, look up the role from DB.
      if (user) {
        token.rol = (user as { rol?: Rol }).rol ?? token.rol;
        token.uid = user.id;
        token.ownerId = (user as { ownerId?: string }).ownerId ?? token.ownerId;
      }
      // Sesiones sin rol u ownerId (Google, o JWTs emitidos antes de que
      // existieran los espacios de trabajo): completar desde la DB.
      if ((!token.rol || !token.ownerId) && token.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: token.email },
          select: { id: true, rol: true, workspaceOwnerId: true },
        });
        if (dbUser) {
          token.rol = dbUser.rol;
          token.uid = dbUser.id;
          token.ownerId = dbUser.workspaceOwnerId ?? dbUser.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? "";
        session.user.rol = (token.rol as Rol) ?? "VIEWER";
        session.user.ownerId =
          (token.ownerId as string) ?? (token.uid as string) ?? "";
      }
      return session;
    },
  },
};
