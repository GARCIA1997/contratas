-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Rol" AS ENUM ('ADMIN', 'VIEWER');

-- CreateEnum
CREATE TYPE "TipoContrata" AS ENUM ('SEMANAL', 'QUINCENAL');

-- CreateEnum
CREATE TYPE "ModoQuincenal" AS ENUM ('QUINCE_DIAS', 'DIAS_15_Y_ULTIMO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "rol" "Rol" NOT NULL DEFAULT 'VIEWER',
    "image" TEXT,
    "emailVerified" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "telefono" TEXT,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contrata" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "tipo" "TipoContrata" NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "abono" DOUBLE PRECISION NOT NULL,
    "fechaInicio" TIMESTAMP(3) NOT NULL,
    "numCuotas" INTEGER NOT NULL DEFAULT 10,
    "mes" TEXT NOT NULL,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contrata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pago" (
    "id" TEXT NOT NULL,
    "contrataId" TEXT NOT NULL,
    "numeroCuota" INTEGER NOT NULL,
    "fechaProgramada" TIMESTAMP(3) NOT NULL,
    "fechaPago" TIMESTAMP(3),
    "pagado" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Pago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Deudor" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "deudaInicial" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Deudor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AbonoDeudor" (
    "id" TEXT NOT NULL,
    "deudorId" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL,
    "monto" DOUBLE PRECISION NOT NULL,
    "restante" DOUBLE PRECISION NOT NULL,
    "notas" TEXT,

    CONSTRAINT "AbonoDeudor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Configuracion" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "nombreApp" TEXT NOT NULL DEFAULT 'ContratasApp',
    "tasaSemanal" DOUBLE PRECISION NOT NULL DEFAULT 125,
    "tasaQuincenal" DOUBLE PRECISION NOT NULL DEFAULT 135,
    "cuotasPorDefecto" INTEGER NOT NULL DEFAULT 10,
    "maxCuotas" INTEGER NOT NULL DEFAULT 52,
    "modoFechasQuincenal" "ModoQuincenal" NOT NULL DEFAULT 'QUINCE_DIAS',
    "colorPrimario" TEXT NOT NULL DEFAULT '#1e40af',
    "logoUrl" TEXT,

    CONSTRAINT "Configuracion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_ownerId_idx" ON "PushSubscription"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Cliente_ownerId_idx" ON "Cliente"("ownerId");

-- CreateIndex
CREATE INDEX "Contrata_clienteId_idx" ON "Contrata"("clienteId");

-- CreateIndex
CREATE INDEX "Contrata_ownerId_idx" ON "Contrata"("ownerId");

-- CreateIndex
CREATE INDEX "Pago_contrataId_idx" ON "Pago"("contrataId");

-- CreateIndex
CREATE INDEX "Deudor_ownerId_idx" ON "Deudor"("ownerId");

-- CreateIndex
CREATE INDEX "AbonoDeudor_deudorId_idx" ON "AbonoDeudor"("deudorId");

-- CreateIndex
CREATE UNIQUE INDEX "Configuracion_ownerId_key" ON "Configuracion"("ownerId");

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrata" ADD CONSTRAINT "Contrata_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contrata" ADD CONSTRAINT "Contrata_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pago" ADD CONSTRAINT "Pago_contrataId_fkey" FOREIGN KEY ("contrataId") REFERENCES "Contrata"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deudor" ADD CONSTRAINT "Deudor_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AbonoDeudor" ADD CONSTRAINT "AbonoDeudor_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "Deudor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Configuracion" ADD CONSTRAINT "Configuracion_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

