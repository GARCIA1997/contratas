import { toPng } from "html-to-image";
import { linkWhatsApp } from "@/lib/whatsapp";

/**
 * Captura un nodo del DOM como PNG. pixelRatio 2 evita que se vea borroso
 * en pantallas retina; backgroundColor blanco evita transparencia si el
 * navegador no calcula bien el fondo del nodo capturado. Sin cacheBust a
 * propósito: el logo ya llega embebido como data URI (ver
 * logo-data-uri.ts), y cacheBust intenta re-pedir esas imágenes agregando
 * un query param — con una data: URI eso puede colgarse en vez de fallar.
 *
 * Con timeout: si algo se atora (imagen que nunca termina de decodificar,
 * fuente que no carga), mejor un error claro que un botón "Generando…"
 * congelado para siempre.
 */
export async function capturarComoPng(node: HTMLElement): Promise<Blob> {
  const dataUrl = await Promise.race([
    toPng(node, { pixelRatio: 2, backgroundColor: "#ffffff" }),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Tardó demasiado en generar la imagen")), 8000)
    ),
  ]);
  const res = await fetch(dataUrl);
  return res.blob();
}

/** Sin blob real todavía: solo pregunta si ESTE navegador sabe compartir archivos. */
export function puedeCompartirArchivos(): boolean {
  if (typeof navigator === "undefined" || typeof navigator.canShare !== "function") {
    return false;
  }
  try {
    const muestra = new File([], "recibo.png", { type: "image/png" });
    return navigator.canShare({ files: [muestra] });
  } catch {
    return false;
  }
}

export type ResultadoCompartir = "compartido" | "cancelado" | "descargado" | "bloqueado";

/**
 * Comparte la imagen por el share sheet nativo (Android/iOS: el usuario
 * elige WhatsApp y la imagen ya llega adjunta) o, si el navegador no
 * soporta compartir archivos (típicamente escritorio), descarga el PNG y
 * abre WhatsApp con el texto para que se adjunte a mano.
 *
 * Importante: a diferencia del link de WhatsApp de solo texto que se usaba
 * antes, el share sheet nativo NO abre el chat del cliente directamente —
 * es una limitación de WhatsApp (su API de enlaces no acepta adjuntos), no
 * de esta app. El usuario elige el contacto tras tocar WhatsApp.
 *
 * `ventanaFallback` debe venir de un `window.open("", "_blank")` hecho de
 * forma SÍNCRONA en el mismo click (antes de capturar la imagen, que es
 * async) — si se abre después de un `await`, el navegador ya perdió el
 * gesto del usuario y bloquea la ventana como pop-up. Si no hay ventana
 * (bloqueada o no aplica porque sí hay share de archivos), se devuelve
 * "bloqueado" para que el llamador muestre un link manual como último
 * recurso — nunca debe fallar en silencio.
 */
export async function compartirRecibo(
  blob: Blob,
  opts: {
    nombreArchivo: string;
    textoFallback: string;
    telefono: string | null;
    ventanaFallback: Window | null;
  }
): Promise<ResultadoCompartir> {
  const file = new File([blob], opts.nombreArchivo, { type: "image/png" });

  if (puedeCompartirArchivos() && navigator.canShare({ files: [file] })) {
    opts.ventanaFallback?.close();
    try {
      await navigator.share({ files: [file] });
      return "compartido";
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "cancelado";
      // Cualquier otro fallo de share cae al plan B de abajo.
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = opts.nombreArchivo;
  a.click();
  URL.revokeObjectURL(url);

  const link = linkWhatsApp(opts.telefono, opts.textoFallback);
  if (opts.ventanaFallback) {
    opts.ventanaFallback.location.href = link;
    return "descargado";
  }
  return "bloqueado";
}
