-- AlterEnum
ALTER TYPE "TipoCitaContrata" ADD VALUE 'UNIFICACION';

-- AlterTable
ALTER TABLE "CitaAgendada" ADD COLUMN     "contratasUnificarIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
