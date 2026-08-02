-- CreateTable
CREATE TABLE "ErrorLog" (
    "id" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "ownerId" TEXT,
    "actorId" TEXT,
    "mensaje" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "contexto" JSONB,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErrorLog_ownerId_creadoEn_idx" ON "ErrorLog"("ownerId", "creadoEn");

-- CreateIndex
CREATE INDEX "ErrorLog_creadoEn_idx" ON "ErrorLog"("creadoEn");
