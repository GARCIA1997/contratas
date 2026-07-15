import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Usuario admin inicial
  const email = (process.env.ADMIN_EMAIL ?? "admin@contratas.app").toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? "admin1234";
  const nombre = process.env.ADMIN_NOMBRE ?? "Administrador";

  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: { rol: "ADMIN", passwordHash, nombre },
    create: { email, passwordHash, nombre, rol: "ADMIN" },
  });
  console.log(`✓ Admin listo: ${email}`);

  // Configuración por usuario (la del admin)
  await prisma.configuracion.upsert({
    where: { ownerId: admin.id },
    update: {},
    create: { ownerId: admin.id },
  });
  console.log("✓ Configuración del admin creada");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
