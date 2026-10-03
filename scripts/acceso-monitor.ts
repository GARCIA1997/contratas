/**
 * Otorga o quita el acceso al monitor de operaciones (/monitor).
 *
 *   npx tsx scripts/acceso-monitor.ts <correo>          → otorga
 *   npx tsx scripts/acceso-monitor.ts <correo> --quitar → quita
 *
 * En producción se corre dentro del contenedor de la app (ver DEPLOY.md).
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const [correo, bandera] = process.argv.slice(2);
  if (!correo) {
    console.error("Uso: npx tsx scripts/acceso-monitor.ts <correo> [--quitar]");
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    const otorgar = bandera !== "--quitar";
    const user = await prisma.user.update({
      where: { email: correo.trim() },
      data: { accesoMonitor: otorgar },
      select: { email: true, nombre: true, accesoMonitor: true },
    });
    console.log(`${user.nombre ?? user.email}: acceso al monitor ${user.accesoMonitor ? "OTORGADO" : "QUITADO"}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
