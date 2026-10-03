-- Permiso para entrar al monitor de operaciones (/monitor). Nadie lo tiene
-- por defecto: se otorga a mano con scripts/acceso-monitor.ts.
ALTER TABLE "User" ADD COLUMN "accesoMonitor" BOOLEAN NOT NULL DEFAULT false;
