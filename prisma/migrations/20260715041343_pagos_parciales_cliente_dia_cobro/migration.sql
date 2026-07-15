-- AlterTable
ALTER TABLE "Cliente" ADD COLUMN     "direccion" TEXT,
ADD COLUMN     "referencia" TEXT;

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "diaCobroSemanal" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "Pago" ADD COLUMN     "montoAbonado" DOUBLE PRECISION NOT NULL DEFAULT 0;
