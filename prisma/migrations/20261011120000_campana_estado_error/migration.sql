-- Estado ERROR para campañas de presentación que tenían destinatarios pero
-- no encolaron ningún mensaje. Solo agrega un valor al enum: no toca filas.
ALTER TYPE "EstadoCampanaWhatsApp" ADD VALUE 'ERROR';
