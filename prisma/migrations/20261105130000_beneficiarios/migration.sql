-- Beneficiarios: contratas a nombre de otras personas que cobra el cliente.
CREATE TABLE "Beneficiario" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "nombreNormalizado" TEXT NOT NULL,
    "clienteConvertidoId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Beneficiario_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Beneficiario_clienteId_nombreNormalizado_key" ON "Beneficiario"("clienteId", "nombreNormalizado");
CREATE INDEX "Beneficiario_ownerId_idx" ON "Beneficiario"("ownerId");

ALTER TABLE "Beneficiario" ADD CONSTRAINT "Beneficiario_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Beneficiario" ADD CONSTRAINT "Beneficiario_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Columna nueva y opcional: las contratas existentes quedan igual (null = del cliente).
ALTER TABLE "Contrata" ADD COLUMN "beneficiarioId" TEXT;
CREATE INDEX "Contrata_beneficiarioId_idx" ON "Contrata"("beneficiarioId");
ALTER TABLE "Contrata" ADD CONSTRAINT "Contrata_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
