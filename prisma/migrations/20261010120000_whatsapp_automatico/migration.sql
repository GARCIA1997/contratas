-- WhatsApp automático: SOLO tablas y tipos nuevos. No modifica ni borra
-- columnas, tablas ni datos existentes (seguro sobre la BD de producción).
-- CreateEnum
CREATE TYPE "EstadoCuentaWhatsApp" AS ENUM ('DESCONECTADO', 'ESPERANDO_VINCULACION', 'CONECTADO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "SolicitudWhatsApp" AS ENUM ('NINGUNA', 'VINCULAR_QR', 'VINCULAR_CODIGO', 'DESCONECTAR');

-- CreateEnum
CREATE TYPE "TipoMensajeWhatsApp" AS ENUM ('RECIBO', 'POR_VENCER', 'VENCIDA', 'DEUDOR', 'PRESENTACION', 'CONFIRMACION_BAJA');

-- CreateEnum
CREATE TYPE "EstadoMensajeWhatsApp" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO', 'CANCELADO', 'REVISAR');

-- CreateEnum
CREATE TYPE "AckWhatsApp" AS ENUM ('ENVIADO', 'ENTREGADO', 'LEIDO');

-- CreateEnum
CREATE TYPE "EstadoCampanaWhatsApp" AS ENUM ('ACTIVA', 'PAUSADA', 'TERMINADA');

-- CreateTable
CREATE TABLE "CuentaWhatsApp" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "estado" "EstadoCuentaWhatsApp" NOT NULL DEFAULT 'DESCONECTADO',
    "solicitud" "SolicitudWhatsApp" NOT NULL DEFAULT 'NINGUNA',
    "solicitudEn" TIMESTAMP(3),
    "qr" TEXT,
    "codigoVinculacion" TEXT,
    "vinculacionExpira" TIMESTAMP(3),
    "waId" TEXT,
    "conectadoDesde" TIMESTAMP(3),
    "ultimaConexion" TIMESTAMP(3),
    "ultimoError" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "aceptoRiesgoEn" TIMESTAMP(3),
    "recibos" BOOLEAN NOT NULL DEFAULT false,
    "porVencer" BOOLEAN NOT NULL DEFAULT false,
    "vencidas" BOOLEAN NOT NULL DEFAULT false,
    "deudores" BOOLEAN NOT NULL DEFAULT false,
    "pausadaPorUsuario" BOOLEAN NOT NULL DEFAULT false,
    "pausadaPorUsuarioEn" TIMESTAMP(3),
    "pausadaPorAdmin" BOOLEAN NOT NULL DEFAULT false,
    "pausadaPorAdminEn" TIMESTAMP(3),
    "pausaMotivo" TEXT,
    "numeroManual" TEXT,
    "numeroManualConfirmadoEn" TIMESTAMP(3),
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CuentaWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WhatsAppLlave" (
    "cuentaId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "llaveId" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WhatsAppLlave_pkey" PRIMARY KEY ("cuentaId","tipo","llaveId")
);

-- CreateTable
CREATE TABLE "MensajeWhatsApp" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tipo" "TipoMensajeWhatsApp" NOT NULL,
    "prioridad" INTEGER NOT NULL,
    "telefono" TEXT NOT NULL,
    "destinatarioNombre" TEXT NOT NULL,
    "clienteId" TEXT,
    "deudorId" TEXT,
    "contrataId" TEXT,
    "numeroCuota" INTEGER,
    "pagoIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "abonoDeudorId" TEXT,
    "campanaId" TEXT,
    "orden" INTEGER,
    "claveDedupe" TEXT NOT NULL,
    "estado" "EstadoMensajeWhatsApp" NOT NULL DEFAULT 'PENDIENTE',
    "texto" TEXT,
    "programadoPara" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "envioId" TEXT,
    "motivo" TEXT,
    "revertido" BOOLEAN NOT NULL DEFAULT false,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MensajeWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvioWhatsApp" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "numeroOrigen" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "tipo" "TipoMensajeWhatsApp" NOT NULL,
    "texto" TEXT NOT NULL,
    "conPresentacion" BOOLEAN NOT NULL DEFAULT false,
    "waMensajeId" TEXT,
    "ack" "AckWhatsApp",
    "enviadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnvioWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptOutWhatsApp" (
    "cuentaId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "mensaje" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reactivadoEn" TIMESTAMP(3),

    CONSTRAINT "OptOutWhatsApp_pkey" PRIMARY KEY ("cuentaId","telefono")
);

-- CreateTable
CREATE TABLE "PresentacionWhatsApp" (
    "cuentaId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "via" TEXT NOT NULL,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PresentacionWhatsApp_pkey" PRIMARY KEY ("cuentaId","telefono")
);

-- CreateTable
CREATE TABLE "CampanaWhatsApp" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT NOT NULL,
    "estado" "EstadoCampanaWhatsApp" NOT NULL DEFAULT 'ACTIVA',
    "total" INTEGER NOT NULL,
    "iniciadaPor" TEXT NOT NULL,
    "pausaMotivo" TEXT,
    "iniciadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terminadaEn" TIMESTAMP(3),
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampanaWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlWhatsApp" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "paroGlobal" BOOLEAN NOT NULL DEFAULT false,
    "paroPor" TEXT,
    "paroEn" TIMESTAMP(3),
    "latidoEn" TIMESTAMP(3),
    "latido" JSONB,

    CONSTRAINT "ControlWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcesoWhatsApp" (
    "id" TEXT NOT NULL,
    "proceso" TEXT NOT NULL,
    "cuentaId" TEXT,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "ok" BOOLEAN,
    "procesados" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,

    CONSTRAINT "ProcesoWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BitacoraWhatsApp" (
    "id" TEXT NOT NULL,
    "cuentaId" TEXT,
    "tipo" TEXT NOT NULL,
    "detalle" JSONB,
    "actor" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BitacoraWhatsApp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CuentaWhatsApp_ownerId_key" ON "CuentaWhatsApp"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaWhatsApp_numero_key" ON "CuentaWhatsApp"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "CuentaWhatsApp_id_ownerId_key" ON "CuentaWhatsApp"("id", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "MensajeWhatsApp_claveDedupe_key" ON "MensajeWhatsApp"("claveDedupe");

-- CreateIndex
CREATE INDEX "MensajeWhatsApp_cuentaId_estado_programadoPara_idx" ON "MensajeWhatsApp"("cuentaId", "estado", "programadoPara");

-- CreateIndex
CREATE INDEX "MensajeWhatsApp_estado_actualizadoEn_idx" ON "MensajeWhatsApp"("estado", "actualizadoEn");

-- CreateIndex
CREATE INDEX "MensajeWhatsApp_deudorId_tipo_idx" ON "MensajeWhatsApp"("deudorId", "tipo");

-- CreateIndex
CREATE INDEX "MensajeWhatsApp_campanaId_idx" ON "MensajeWhatsApp"("campanaId");

-- CreateIndex
CREATE INDEX "EnvioWhatsApp_cuentaId_enviadoEn_idx" ON "EnvioWhatsApp"("cuentaId", "enviadoEn");

-- CreateIndex
CREATE INDEX "EnvioWhatsApp_waMensajeId_idx" ON "EnvioWhatsApp"("waMensajeId");

-- CreateIndex
CREATE INDEX "CampanaWhatsApp_cuentaId_estado_idx" ON "CampanaWhatsApp"("cuentaId", "estado");

-- CreateIndex
CREATE INDEX "ProcesoWhatsApp_proceso_inicio_idx" ON "ProcesoWhatsApp"("proceso", "inicio");

-- CreateIndex
CREATE INDEX "BitacoraWhatsApp_cuentaId_creadoEn_idx" ON "BitacoraWhatsApp"("cuentaId", "creadoEn");

-- CreateIndex
CREATE INDEX "BitacoraWhatsApp_creadoEn_idx" ON "BitacoraWhatsApp"("creadoEn");

-- AddForeignKey
ALTER TABLE "CuentaWhatsApp" ADD CONSTRAINT "CuentaWhatsApp_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WhatsAppLlave" ADD CONSTRAINT "WhatsAppLlave_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeWhatsApp" ADD CONSTRAINT "MensajeWhatsApp_cuentaId_ownerId_fkey" FOREIGN KEY ("cuentaId", "ownerId") REFERENCES "CuentaWhatsApp"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MensajeWhatsApp" ADD CONSTRAINT "MensajeWhatsApp_envioId_fkey" FOREIGN KEY ("envioId") REFERENCES "EnvioWhatsApp"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvioWhatsApp" ADD CONSTRAINT "EnvioWhatsApp_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptOutWhatsApp" ADD CONSTRAINT "OptOutWhatsApp_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PresentacionWhatsApp" ADD CONSTRAINT "PresentacionWhatsApp_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampanaWhatsApp" ADD CONSTRAINT "CampanaWhatsApp_cuentaId_fkey" FOREIGN KEY ("cuentaId") REFERENCES "CuentaWhatsApp"("id") ON DELETE CASCADE ON UPDATE CASCADE;

