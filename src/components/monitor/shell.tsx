"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { cn } from "@/lib/utils";

/**
 * Armazón del monitor (barra lateral + barra superior). Marcado y clases
 * copiados del HTML que exporta Stitch; aquí solo se conectan los enlaces,
 * el selector de periodo (?rango=) y el refresco automático.
 */

const NAV = [
  { href: "/monitor", icono: "dashboard", texto: "Resumen" },
  { href: "/monitor/errores", icono: "error_outline", texto: "Errores" },
  { href: "/monitor/actividad", icono: "pulse_alert", texto: "Actividad" },
  { href: "/monitor/usuarios", icono: "group", texto: "Usuarios" },
  { href: "/monitor/negocio", icono: "payments", texto: "Negocio" },
  { href: "/monitor/calidad", icono: "fact_check", texto: "Calidad" },
];

const RANGOS = [
  { valor: "hoy", texto: "Hoy" },
  { valor: "7d", texto: "7 días" },
  { valor: "30d", texto: "30 días" },
];

const ACTIVO =
  "bg-primary-container text-on-primary-container font-headline-sm font-semibold rounded-lg shadow-[0_0_0_1px_#0F7BFF,0_0_12px_rgba(15,123,255,0.35)]";
const INACTIVO =
  "rounded-lg text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all font-body-md text-body-md";

/** Cada cuánto se vuelven a pedir los datos (el monitor es "en vivo"). */
const REFRESCO_MS = 60_000;

export function MonitorShell({
  nombre,
  version,
  saludOk,
  children,
}: {
  nombre: string;
  version: string;
  saludOk: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const rango = params.get("rango") ?? "hoy";
  const [actualizado, setActualizado] = useState(() => Date.now());
  const [ahora, setAhora] = useState(() => Date.now());
  const [busqueda, setBusqueda] = useState(params.get("q") ?? "");

  useEffect(() => {
    const t = setInterval(() => {
      router.refresh();
      setActualizado(Date.now());
    }, REFRESCO_MS);
    const reloj = setInterval(() => setAhora(Date.now()), 15_000);
    return () => {
      clearInterval(t);
      clearInterval(reloj);
    };
  }, [router]);

  function conRango(valor: string) {
    const p = new URLSearchParams(params.toString());
    p.set("rango", valor);
    return `${pathname}?${p.toString()}`;
  }

  function refrescar() {
    router.refresh();
    setActualizado(Date.now());
  }

  function buscar(e: React.FormEvent) {
    e.preventDefault();
    const q = busqueda.trim();
    const destino = pathname === "/monitor" ? "/monitor/actividad" : pathname;
    const p = new URLSearchParams(params.toString());
    if (q) p.set("q", q);
    else p.delete("q");
    router.push(`${destino}?${p.toString()}`);
  }

  const minutos = Math.floor((ahora - actualizado) / 60_000);

  return (
    <>
      <aside className="fixed left-0 top-0 z-50 flex h-full w-64 flex-col justify-between bg-surface-container-low p-space-md shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
        <div className="flex flex-col gap-space-md">
          <div className="flex items-center gap-space-sm px-space-xs py-space-xs">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img alt="Kredired" className="h-8 w-8 rounded-lg object-contain" src="/icons/kredired.png" />
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Kredired</span>
              <span className="font-label-xs text-label-xs uppercase tracking-wider text-on-surface-variant">
                Monitor Ops
              </span>
            </div>
          </div>
          <div className="px-space-xs">
            <div className="inline-flex items-center gap-space-xs rounded bg-surface-container-high px-space-sm py-space-xs text-primary">
              <span className={cn("h-1.5 w-1.5 rounded-full", saludOk ? "bg-secondary" : "bg-error")} />
              <span className="font-code-sm text-code-sm uppercase">Producción</span>
            </div>
          </div>
          <nav className="mt-space-sm flex flex-col gap-space-xs">
            {NAV.map((n) => {
              const activo = n.href === "/monitor" ? pathname === "/monitor" : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={`${n.href}?rango=${rango}`}
                  aria-current={activo ? "page" : undefined}
                  className={cn("flex items-center gap-space-sm px-space-sm py-space-sm", activo ? ACTIVO : INACTIVO)}
                >
                  <span className="material-symbols-outlined text-[18px]">{n.icono}</span>
                  <span>{n.texto}</span>
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex flex-col gap-space-xs pt-space-md">
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/monitor/login" })}
            className={cn("flex items-center gap-space-sm px-space-sm py-space-sm text-left", INACTIVO)}
          >
            <span className="material-symbols-outlined text-[18px]">logout</span>
            <span>Cerrar sesión</span>
          </button>
          <div className="flex items-center justify-between rounded-lg bg-surface-container px-space-sm py-space-sm">
            <div className="flex items-center gap-space-xs">
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    saludOk ? "bg-secondary" : "bg-error"
                  )}
                />
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", saludOk ? "bg-secondary" : "bg-error")} />
              </span>
              <span className={cn("font-label-xs text-label-xs", saludOk ? "text-secondary" : "text-error")}>
                {saludOk ? "Sistemas OK" : "Revisar sistema"}
              </span>
            </div>
            <span className="font-code-sm text-code-sm text-on-surface-variant">v{version}</span>
          </div>
        </div>
      </aside>

      <div className="pl-64">
        <header className="fixed left-64 right-0 top-0 z-40 h-16 bg-surface/80 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
          <div className="flex h-16 w-full items-center justify-between gap-space-md px-margin-desktop">
            <div className="flex items-center gap-space-lg">
              <div className="flex items-center gap-space-xs rounded-full bg-surface-container px-space-sm py-space-xs">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary" />
                </span>
                <span className="font-label-xs text-label-xs text-on-surface-variant">
                  {minutos < 1 ? "Actualizado hace un momento" : `Actualizado hace ${minutos} min`}
                </span>
              </div>
              <div className="flex items-center rounded-lg bg-surface-container p-space-xs">
                {RANGOS.map((r) => (
                  <Link
                    key={r.valor}
                    href={conRango(r.valor)}
                    className={cn(
                      "rounded px-space-sm py-space-xs font-body-sm text-body-sm transition-colors",
                      rango === r.valor
                        ? "bg-surface-container-high font-medium text-on-surface"
                        : "text-on-surface-variant hover:text-on-surface"
                    )}
                  >
                    {r.texto}
                  </Link>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-space-md">
              <form onSubmit={buscar} className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-space-sm text-[18px] text-outline">search</span>
                <input
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  className="h-9 w-64 rounded-lg bg-surface-container-lowest pl-8 pr-3 font-body-sm text-body-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-1 focus:ring-primary"
                  placeholder="Buscar en la actividad…"
                  type="text"
                />
              </form>
              <button
                type="button"
                onClick={refrescar}
                title="Refrescar métricas"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
              >
                <span className="material-symbols-outlined text-[20px]">refresh</span>
              </button>
              <div className="flex items-center gap-space-sm pl-space-xs">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
                  <span className="material-symbols-outlined text-[18px] text-on-primary">person</span>
                </div>
                <div className="hidden flex-col text-left xl:flex">
                  <span className="font-title-md text-title-md leading-none text-on-surface">{nombre}</span>
                  <span className="font-label-xs text-label-xs text-on-surface-variant">Acceso al monitor</span>
                </div>
              </div>
            </div>
          </div>
        </header>
        <main className="relative w-full bg-surface px-margin-desktop pt-16">
          <div className="flex w-full flex-col gap-space-lg py-space-md">{children}</div>
        </main>
      </div>
    </>
  );
}
