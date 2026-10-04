-- Casos de Monitor → Calidad marcados como revisados y correctos.
CREATE TABLE "CalidadIgnorada" (
    "id" TEXT NOT NULL,
    "revision" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "ignoradoPor" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalidadIgnorada_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalidadIgnorada_revision_clave_key" ON "CalidadIgnorada"("revision", "clave");
