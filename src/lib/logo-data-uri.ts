/**
 * Convierte el logo configurado (URL propia o externa) a data URI antes de
 * incrustarlo en el recibo. Es necesario para la captura con html-to-image:
 * un <img> cross-origin sin cabeceras CORS permisivas "mancha" el canvas y
 * hace fallar la captura completa. Cualquier fallo (red, CORS, URL rota) se
 * traga en silencio — el recibo debe poder generarse siempre, con o sin
 * logo; el llamador cae al distintivo con iniciales si esto devuelve null.
 */
export async function logoComoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
