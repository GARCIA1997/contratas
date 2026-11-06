-- Funciones en prueba por espacio de trabajo (monitor → Funciones).
CREATE TABLE "FuncionEspacio" (
    "ownerId" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "actualizadoPor" TEXT,
    "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FuncionEspacio_pkey" PRIMARY KEY ("ownerId","clave")
);

ALTER TABLE "FuncionEspacio" ADD CONSTRAINT "FuncionEspacio_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
