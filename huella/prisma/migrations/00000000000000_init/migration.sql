-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "TipoIdentificador" AS ENUM ('EMAIL', 'ALIAS', 'NOMBRE', 'TELEFONO', 'DOMINIO');

-- CreateEnum
CREATE TYPE "OrigenIdentificador" AS ENUM ('CUESTIONARIO', 'PIVOTE');

-- CreateEnum
CREATE TYPE "Nivel" AS ENUM ('GRATIS', 'PROFUNDO');

-- CreateEnum
CREATE TYPE "EstadoEscaneo" AS ENUM ('PENDIENTE', 'EN_CURSO', 'COMPLETADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "TipoHallazgo" AS ENUM ('CUENTA', 'BRECHA', 'FILTRACION', 'BROKER', 'BUSQUEDA', 'PERFIL', 'DOMINIO');

-- CreateEnum
CREATE TYPE "Confianza" AS ENUM ('ENCONTRADO', 'NO_ENCONTRADO', 'NO_CONCLUYENTE');

-- CreateEnum
CREATE TYPE "Severidad" AS ENUM ('CRITICA', 'ALTA', 'MEDIA', 'BAJA');

-- CreateEnum
CREATE TYPE "CanalSolicitud" AS ENUM ('FORMULARIO', 'EMAIL', 'CUENTA');

-- CreateEnum
CREATE TYPE "BaseLegal" AS ENUM ('ART15', 'ART17', 'ART21');

-- CreateEnum
CREATE TYPE "EstadoSolicitud" AS ENUM ('PENDIENTE', 'ENVIADA', 'RESPONDIDA', 'CUMPLIDA', 'DENEGADA', 'VENCIDA');

-- CreateTable
CREATE TABLE "Sujeto" (
    "id" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "alias" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nombre" TEXT,
    "ciudad" TEXT,
    "telefono" TEXT,
    "dominios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "titularidadAceptada" BOOLEAN NOT NULL DEFAULT false,
    "incluirSensibles" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Sujeto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Identificador" (
    "id" TEXT NOT NULL,
    "escaneoId" TEXT NOT NULL,
    "tipo" "TipoIdentificador" NOT NULL,
    "valor" TEXT NOT NULL,
    "origen" "OrigenIdentificador" NOT NULL DEFAULT 'CUESTIONARIO',
    "derivadoDeId" TEXT,

    CONSTRAINT "Identificador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Escaneo" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sujetoId" TEXT NOT NULL,
    "nivel" "Nivel" NOT NULL DEFAULT 'GRATIS',
    "estado" "EstadoEscaneo" NOT NULL DEFAULT 'PENDIENTE',
    "sitiosTotal" INTEGER NOT NULL DEFAULT 0,
    "sitiosHechos" INTEGER NOT NULL DEFAULT 0,
    "rondaPivote" INTEGER NOT NULL DEFAULT 0,
    "propietarioId" TEXT,
    "pagadoEn" TIMESTAMP(3),
    "expiraEn" TIMESTAMP(3),

    CONSTRAINT "Escaneo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hallazgo" (
    "id" TEXT NOT NULL,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "escaneoId" TEXT NOT NULL,
    "identificadorId" TEXT,
    "tipo" "TipoHallazgo" NOT NULL,
    "fuente" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "url" TEXT,
    "dominio" TEXT,
    "confianza" "Confianza" NOT NULL,
    "severidad" "Severidad" NOT NULL DEFAULT 'BAJA',
    "datos" JSONB,

    CONSTRAINT "Hallazgo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Solicitud" (
    "id" TEXT NOT NULL,
    "creadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hallazgoId" TEXT NOT NULL,
    "servicio" TEXT NOT NULL,
    "canal" "CanalSolicitud" NOT NULL,
    "base" "BaseLegal" NOT NULL DEFAULT 'ART17',
    "estado" "EstadoSolicitud" NOT NULL DEFAULT 'PENDIENTE',
    "enviadaEn" TIMESTAMP(3),
    "venceEn" TIMESTAMP(3),
    "notas" TEXT,

    CONSTRAINT "Solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Identificador_escaneoId_idx" ON "Identificador"("escaneoId");

-- CreateIndex
CREATE UNIQUE INDEX "Identificador_escaneoId_tipo_valor_key" ON "Identificador"("escaneoId", "tipo", "valor");

-- CreateIndex
CREATE UNIQUE INDEX "Escaneo_token_key" ON "Escaneo"("token");

-- CreateIndex
CREATE INDEX "Escaneo_propietarioId_idx" ON "Escaneo"("propietarioId");

-- CreateIndex
CREATE INDEX "Escaneo_expiraEn_idx" ON "Escaneo"("expiraEn");

-- CreateIndex
CREATE INDEX "Hallazgo_escaneoId_confianza_idx" ON "Hallazgo"("escaneoId", "confianza");

-- CreateIndex
CREATE INDEX "Hallazgo_escaneoId_tipo_idx" ON "Hallazgo"("escaneoId", "tipo");

-- CreateIndex
CREATE INDEX "Solicitud_hallazgoId_idx" ON "Solicitud"("hallazgoId");

-- CreateIndex
CREATE INDEX "Solicitud_estado_venceEn_idx" ON "Solicitud"("estado", "venceEn");

-- AddForeignKey
ALTER TABLE "Identificador" ADD CONSTRAINT "Identificador_escaneoId_fkey" FOREIGN KEY ("escaneoId") REFERENCES "Escaneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Identificador" ADD CONSTRAINT "Identificador_derivadoDeId_fkey" FOREIGN KEY ("derivadoDeId") REFERENCES "Identificador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Escaneo" ADD CONSTRAINT "Escaneo_sujetoId_fkey" FOREIGN KEY ("sujetoId") REFERENCES "Sujeto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hallazgo" ADD CONSTRAINT "Hallazgo_escaneoId_fkey" FOREIGN KEY ("escaneoId") REFERENCES "Escaneo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hallazgo" ADD CONSTRAINT "Hallazgo_identificadorId_fkey" FOREIGN KEY ("identificadorId") REFERENCES "Identificador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Solicitud" ADD CONSTRAINT "Solicitud_hallazgoId_fkey" FOREIGN KEY ("hallazgoId") REFERENCES "Hallazgo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

