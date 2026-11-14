-- Ajustes de envío del WhatsApp automático por cuenta (Monitor → WhatsApp).
-- Solo columnas nuevas con el comportamiento original como valor por defecto.
ALTER TABLE "CuentaWhatsApp"
  ADD COLUMN "avisoDiasAntes" INTEGER[] DEFAULT ARRAY[2]::INTEGER[],
  ADD COLUMN "vencidaDiasDespues" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "vencidaRepetirCada" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "vencidaRepeticiones" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "horaInicio" INTEGER NOT NULL DEFAULT 9,
  ADD COLUMN "horaFin" INTEGER NOT NULL DEFAULT 22,
  ADD COLUMN "diasEntreDeudor" INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN "cupoDiario" INTEGER NOT NULL DEFAULT 200;
