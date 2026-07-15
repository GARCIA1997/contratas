-- AlterEnum
ALTER TYPE "TipoContrata" ADD VALUE 'MENSUAL';

-- AlterTable
ALTER TABLE "Configuracion" ADD COLUMN     "tasaMensual" DOUBLE PRECISION NOT NULL DEFAULT 200;
