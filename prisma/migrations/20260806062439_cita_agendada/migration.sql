-- CreateEnum
CREATE TYPE "TipoCitaContrata" AS ENUM ('NUEVA', 'RENOVACION', 'SIN_DEFINIR');

-- CreateEnum
CREATE TYPE "EstadoCita" AS ENUM ('PENDIENTE', 'ENTREGADA', 'CANCELADA');

-- CreateTable
CREATE TABLE "CitaAgendada" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "contrataOrigenId" TEXT,
    "contrataCreadaId" TEXT,
    "tipo" "TipoCitaContrata" NOT NULL DEFAULT 'SIN_DEFINIR',
    "montoEstimado" DOUBLE PRECISION NOT NULL,
    "fechaEntrega" TIMESTAMP(3) NOT NULL,
    "notas" TEXT,
    "estado" "EstadoCita" NOT NULL DEFAULT 'PENDIENTE',
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CitaAgendada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CitaAgendada_contrataCreadaId_key" ON "CitaAgendada"("contrataCreadaId");

-- CreateIndex
CREATE INDEX "CitaAgendada_ownerId_estado_fechaEntrega_idx" ON "CitaAgendada"("ownerId", "estado", "fechaEntrega");

-- CreateIndex
CREATE INDEX "CitaAgendada_clienteId_idx" ON "CitaAgendada"("clienteId");

-- AddForeignKey
ALTER TABLE "CitaAgendada" ADD CONSTRAINT "CitaAgendada_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaAgendada" ADD CONSTRAINT "CitaAgendada_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaAgendada" ADD CONSTRAINT "CitaAgendada_contrataOrigenId_fkey" FOREIGN KEY ("contrataOrigenId") REFERENCES "Contrata"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CitaAgendada" ADD CONSTRAINT "CitaAgendada_contrataCreadaId_fkey" FOREIGN KEY ("contrataCreadaId") REFERENCES "Contrata"("id") ON DELETE SET NULL ON UPDATE CASCADE;
