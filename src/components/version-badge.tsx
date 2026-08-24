/**
 * Versión del build que está corriendo, tomada de package.json en tiempo
 * de compilación (ver `env` en next.config.mjs).
 *
 * Sirve para saber, desde el celular y sin pedirle nada a nadie, si el
 * equipo ya trae el despliegue nuevo — con una PWA el service worker puede
 * seguir sirviendo una versión anterior hasta que se actualice, así que
 * "¿ya te llegó el cambio?" no se puede responder de otra forma.
 *
 * Coincide con la etiqueta de git del mismo nombre (v4.0.1, etc.).
 */
export function VersionBadge() {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) return null;
  return (
    <span
      title={`Versión ${version}`}
      className="select-none text-[10px] font-medium tabular-nums text-muted-foreground/70"
    >
      v{version}
    </span>
  );
}
