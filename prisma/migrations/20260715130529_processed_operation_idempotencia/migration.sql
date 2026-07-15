-- CreateTable
CREATE TABLE "ProcessedOperation" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "resultado" JSONB NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProcessedOperation_ownerId_idx" ON "ProcessedOperation"("ownerId");

-- CreateIndex
CREATE INDEX "ProcessedOperation_creadoEn_idx" ON "ProcessedOperation"("creadoEn");
