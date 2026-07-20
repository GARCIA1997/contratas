-- CreateTable
CREATE TABLE "CorteCaja" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "contratasDadas" DOUBLE PRECISION NOT NULL,
    "numContratasDadas" INTEGER NOT NULL,
    "cobrado" DOUBLE PRECISION NOT NULL,
    "gananciaInteres" DOUBLE PRECISION NOT NULL,
    "saldoPendienteFin" DOUBLE PRECISION NOT NULL,
    "contratasActivasFin" INTEGER NOT NULL,
    "generadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CorteCaja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CorteCaja_ownerId_idx" ON "CorteCaja"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CorteCaja_ownerId_anio_mes_key" ON "CorteCaja"("ownerId", "anio", "mes");

-- AddForeignKey
ALTER TABLE "CorteCaja" ADD CONSTRAINT "CorteCaja_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
