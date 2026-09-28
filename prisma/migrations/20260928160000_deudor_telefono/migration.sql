-- Teléfono del deudor, para mandarle recordatorios de abono por WhatsApp.
ALTER TABLE "Deudor" ADD COLUMN "telefono" TEXT;

-- Los deudores que salieron de una contrata ("marcar como deuda") ya tienen
-- un teléfono conocido: el del cliente de esa contrata. Se toma el de la
-- contrata más reciente que tenga teléfono.
UPDATE "Deudor" d
SET "telefono" = sub."telefono"
FROM (
  SELECT DISTINCT ON (k."deudorId") k."deudorId", c."telefono"
  FROM "Contrata" k
  JOIN "Cliente" c ON c."id" = k."clienteId"
  WHERE k."deudorId" IS NOT NULL
    AND c."telefono" IS NOT NULL
    AND c."telefono" <> ''
  ORDER BY k."deudorId", k."creadoEn" DESC
) sub
WHERE d."id" = sub."deudorId"
  AND d."telefono" IS NULL;
