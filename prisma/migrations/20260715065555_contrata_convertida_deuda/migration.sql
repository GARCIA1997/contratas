-- AlterTable
ALTER TABLE "Contrata" ADD COLUMN     "convertidaADeuda" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "deudorId" TEXT;

-- CreateIndex
CREATE INDEX "Contrata_deudorId_idx" ON "Contrata"("deudorId");

-- AddForeignKey
ALTER TABLE "Contrata" ADD CONSTRAINT "Contrata_deudorId_fkey" FOREIGN KEY ("deudorId") REFERENCES "Deudor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
