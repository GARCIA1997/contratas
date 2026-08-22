"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Loader2, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoComoDataUri } from "@/lib/logo-data-uri";
import {
  capturarComoPng,
  compartirRecibo,
  puedeCompartirArchivos,
} from "@/lib/compartir-imagen";
import { linkWhatsApp } from "@/lib/whatsapp";
import { ReciboCard, type ReciboCardProps } from "@/components/recibo/recibo-card";

/**
 * Lo que aporta el llamador: el logo y el folio los administra este
 * componente. El Omit se distribuye sobre la unión a propósito — un
 * `Omit` normal la aplanaría y se perderían los campos propios de cada
 * variante.
 */
type OmitirEnUnion<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type DatosRecibo = OmitirEnUnion<ReciboCardProps, "logoDataUri" | "folio">;

function nuevoFolio() {
  const base =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2);
  return `KRD-${base.slice(0, 6).toUpperCase()}`;
}

function nombreArchivo(clienteNombre: string, variante: string) {
  const limpio = clienteNombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return `${variante}-${limpio || "cliente"}.png`;
}

/**
 * Botón único para compartir cualquiera de los recibos como imagen. Mantiene
 * la tarjeta montada fuera de pantalla (no solo al hacer clic) para que las
 * fuentes y el logo ya estén resueltos cuando el usuario la pide — capturar
 * un nodo recién montado es la principal fuente de imágenes a medio pintar.
 */
export function CompartirRecibo({
  datos,
  logoUrl,
  telefono,
  textoFallback,
  etiqueta = "Compartir por WhatsApp",
  variant = "default",
  size,
  className = "w-full",
  compacto = false,
  icono,
  onAntesDeCompartir,
  onListo,
}: {
  datos: DatosRecibo;
  logoUrl?: string | null;
  telefono: string | null;
  /** Texto plano de respaldo, para cuando solo se puede abrir WhatsApp con texto. */
  textoFallback: string;
  etiqueta?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "sm";
  className?: string;
  /**
   * Sin párrafos de error/enlace debajo — para cuando el botón vive dentro de
   * una rejilla (Ruta) donde un texto extra rompería la cuadrícula. El fallo
   * se comunica en la propia etiqueta del botón.
   */
  compacto?: boolean;
  icono?: ReactNode;
  /** Se ejecuta antes de capturar (p. ej. registrar el cobro en Ruta). */
  onAntesDeCompartir?: () => void | Promise<void>;
  /** Se ejecuta al terminar, haya o no compartido (p. ej. cerrar el modal). */
  onListo?: () => void;
}) {
  const [logoDataUri, setLogoDataUri] = useState<string | null>(null);
  const [folio] = useState(nuevoFolio);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkManual, setLinkManual] = useState<string | null>(null);
  const tarjetaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelado = false;
    logoComoDataUri(logoUrl ?? null).then((uri) => {
      if (!cancelado) setLogoDataUri(uri);
    });
    return () => {
      cancelado = true;
    };
  }, [logoUrl]);

  async function compartir() {
    if (!tarjetaRef.current) return;
    setOcupado(true);
    setError(null);
    setLinkManual(null);
    // Se abre ANTES de cualquier await: si se abriera después, el navegador
    // ya perdió el gesto del clic y bloquea la ventana como pop-up. Cuando
    // el dispositivo sabe compartir archivos no hace falta.
    const ventana = puedeCompartirArchivos() ? null : window.open("", "_blank");
    try {
      await onAntesDeCompartir?.();
      const blob = await capturarComoPng(tarjetaRef.current);
      const salida = await compartirRecibo(blob, {
        nombreArchivo: nombreArchivo(datos.clienteNombre, datos.variante),
        textoFallback,
        telefono,
        ventanaFallback: ventana,
      });
      if (salida === "bloqueado") {
        setLinkManual(linkWhatsApp(telefono, textoFallback));
      }
      onListo?.();
    } catch {
      ventana?.close();
      setError("No se pudo generar la imagen. Intenta de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {/* Fuera de pantalla, pero en el DOM: html-to-image clona el nodo, así
          que no importa que no se vea — importa que ya esté renderizado. */}
      <div
        aria-hidden
        style={{ position: "fixed", top: 0, left: -10000, pointerEvents: "none" }}
      >
        <ReciboCard ref={tarjetaRef} {...datos} logoDataUri={logoDataUri} folio={folio} />
      </div>

      <Button
        className={className}
        variant={variant}
        size={size}
        disabled={ocupado}
        onClick={compartir}
      >
        {ocupado ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          (icono ?? <Share2 className="size-4" />)
        )}
        {ocupado ? "Generando…" : compacto && error ? "Reintentar" : etiqueta}
      </Button>

      {!compacto && error && (
        <p className="text-center text-xs text-destructive">{error}</p>
      )}
      {!compacto && linkManual && (
        <p className="text-center text-xs text-muted-foreground">
          La imagen se descargó. Tu navegador bloqueó WhatsApp —{" "}
          <a
            href={linkManual}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline"
          >
            ábrelo aquí
          </a>{" "}
          y adjúntala.
        </p>
      )}
    </>
  );
}
