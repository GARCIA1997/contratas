"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

/**
 * Login del monitor. Usa las mismas cuentas de Kredired (tabla User, mismo
 * proveedor de credenciales que la app); quién puede entrar lo decide
 * `User.accesoMonitor`, que el panel revisa del lado del servidor.
 * Diseño: pantalla "Iniciar sesión" del proyecto de Stitch.
 */
export default function MonitorLoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const sinAcceso = useSearchParams().has("sin-acceso");
  const [usuario, setUsuario] = useState("");
  const [password, setPassword] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEntrando(true);
    const r = await signIn("credentials", {
      email: usuario.trim(),
      password,
      redirect: false,
    });
    if (!r || r.error) {
      setEntrando(false);
      setError("Correo o contraseña incorrectos");
      return;
    }
    // El panel valida el permiso; sin él regresa aquí con ?sin-acceso.
    router.replace("/monitor");
    router.refresh();
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface px-margin">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage: "radial-gradient(#2e3544 1px, transparent 1px)",
          backgroundSize: "22px 22px",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: "radial-gradient(circle, rgba(15,123,255,0.22) 0%, rgba(15,123,255,0) 70%)" }}
      />

      <div className="relative w-full max-w-[400px] rounded-xl bg-surface-container-low p-space-xl shadow-[0_0_0_1px_#1E2D4A,0_24px_64px_rgba(0,0,0,0.45)]">
        <div className="mb-space-lg flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/kredired.png" alt="Kredired" className="mb-space-md h-12 w-12 rounded-xl" />
          <h1 className="font-headline-lg text-headline-lg text-on-surface">Monitor de operaciones</h1>
          <p className="mt-space-xs font-body-md text-body-md text-on-surface-variant">
            Acceso restringido al equipo de Kredired
          </p>
        </div>

        <form onSubmit={entrar} className="flex flex-col gap-space-md">
          <label className="flex flex-col gap-space-xs">
            <span className="font-title-md text-title-md text-on-surface">Correo o teléfono</span>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">alternate_email</span>
              <input
                value={usuario}
                onChange={(e) => setUsuario(e.target.value)}
                autoComplete="username"
                required
                className="h-11 w-full rounded-lg bg-surface-container-lowest pl-10 pr-space-md font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="tu@correo.com o teléfono"
              />
            </div>
          </label>
          <label className="flex flex-col gap-space-xs">
            <span className="font-title-md text-title-md text-on-surface">Contraseña</span>
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-outline">key</span>
              <input
                type={ver ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className="h-11 w-full rounded-lg bg-surface-container-lowest pl-10 pr-10 font-body-md text-body-md text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setVer((v) => !v)}
                aria-label={ver ? "Ocultar contraseña" : "Mostrar contraseña"}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[18px]">{ver ? "visibility_off" : "visibility"}</span>
              </button>
            </div>
          </label>

          {sinAcceso && !error && (
            <div className="flex items-center gap-space-xs rounded-lg bg-tertiary-container/30 px-space-sm py-space-sm font-body-sm text-body-sm text-tertiary">
              <span className="material-symbols-outlined text-[16px]">lock</span>
              Esta cuenta no tiene acceso al monitor.
            </div>
          )}
          {error && (
            <div className="flex items-center gap-space-xs rounded-lg bg-error-container/30 px-space-sm py-space-sm font-body-sm text-body-sm text-error">
              <span className="material-symbols-outlined text-[16px]">error</span>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={entrando}
            className="mt-space-xs flex h-11 items-center justify-center gap-space-sm rounded-lg bg-[#0F7BFF] font-title-md text-title-md text-white shadow-[0_0_12px_rgba(15,123,255,0.35)] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {entrando && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
            {entrando ? "Entrando…" : "Entrar al sistema"}
            {!entrando && <span className="material-symbols-outlined text-[18px]">arrow_forward</span>}
          </button>
        </form>

        <p className="mt-space-lg text-center font-label-xs text-label-xs text-outline">
          Usa la misma cuenta de Kredired · v{process.env.NEXT_PUBLIC_APP_VERSION ?? "dev"}
        </p>
      </div>
    </main>
  );
}
