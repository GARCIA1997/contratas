-- Idempotencia a prueba de carreras.
--
-- Antes, `withIdempotency` consultaba y luego ejecutaba: dos peticiones con
-- la misma Idempotency-Key que llegaran antes de que la primera guardara su
-- resultado pasaban ambas la consulta y ejecutaban la mutación las dos
-- (doble cobro). Escenario real en 3G: la petición se cuelga pero sí llegó
-- al servidor, el cliente reintenta con la misma key y el servidor la
-- ejecuta otra vez.
--
-- Ahora la fila se inserta ANTES de ejecutar, y la llave primaria hace de
-- candado: solo una petición logra el insert. `completada` distingue una
-- reserva en curso de un resultado ya listo.

ALTER TABLE "ProcessedOperation" ALTER COLUMN "resultado" DROP NOT NULL;

ALTER TABLE "ProcessedOperation"
  ADD COLUMN "completada" BOOLEAN NOT NULL DEFAULT false;

-- Todo lo que ya existía se guardó DESPUÉS de ejecutarse con el esquema
-- anterior, así que son operaciones terminadas: sin esto se verían como
-- reservas huérfanas y se volverían a ejecutar.
UPDATE "ProcessedOperation" SET "completada" = true;
