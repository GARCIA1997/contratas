"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BotonIgnorar } from "./acciones-calidad";
import { dinero, fechaHora } from "./formato";
import type { ContrataComparada } from "@/lib/monitor/datos";

type Comparacion = { a: ContrataComparada; b: ContrataComparada; minutosEntreCreacion: number };

const dia = (iso: string) => new Date(iso).toLocaleDateString("es-MX", { timeZone: "UTC", day: "2-digit", month: "short", year: "numeric" });

const FILAS: { campo: string; valor: (c: ContrataComparada) => string }[] = [
  { campo: "Tipo", valor: (c) => c.tipo },
  { campo: "Monto", valor: (c) => dinero(c.monto) },
  { campo: "Abono", valor: (c) => dinero(c.abono) },
  { campo: "Cuotas", valor: (c) => String(c.numCuotas) },
  { campo: "Fecha de inicio", valor: (c) => dia(c.fechaInicio) },
  { campo: "Notas", valor: (c) => c.notas?.trim() || "—" },
  { campo: "Creada", valor: (c) => fechaHora(c.creadoEn) },
  { campo: "Cuotas pagadas", valor: (c) => `${c.cuotasPagadas} / ${c.cuotasTotal}` },
  { campo: "Abonado", valor: (c) => dinero(c.totalAbonado) },
  { campo: "En deuda", valor: (c) => (c.convertidaADeuda ? "Sí" : "No") },
];

/** Botón "Comparar" de un caso de contratas duplicadas + modal lado a lado. */
export function ComparaContratas({ revision, clave }: { revision: string; clave: string }) {
  const [abierto, setAbierto] = useState(false);
  const [montado, setMontado] = useState(false);
  const [datos, setDatos] = useState<Comparacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [a, b] = clave.split(":");

  useEffect(() => setMontado(true), []);
  useEffect(() => {
    if (!abierto) return;
    let vivo = true;
    setDatos(null);
    setError(null);
    fetch(`/api/monitor/calidad/comparar?a=${encodeURIComponent(a)}&b=${encodeURIComponent(b)}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudo cargar");
        return (await r.json()) as Comparacion;
      })
      .then((d) => vivo && setDatos(d))
      .catch((e: Error) => vivo && setError(e.message));
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && setAbierto(false);
    window.addEventListener("keydown", tecla);
    return () => {
      vivo = false;
      window.removeEventListener("keydown", tecla);
    };
  }, [abierto, a, b]);

  const contenedor = montado ? document.getElementById("monitor") : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 rounded-lg bg-primary/15 px-2 py-1 font-label-sm text-label-sm text-primary transition-colors hover:bg-primary/25"
      >
        <span className="material-symbols-outlined text-[15px]">compare_arrows</span>
        Comparar
      </button>
      {abierto && contenedor &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={(e) => e.target === e.currentTarget && setAbierto(false)}
            role="dialog"
            aria-modal="true"
            aria-label="Comparar contratas"
          >
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-surface-container-low p-space-lg shadow-2xl">
              <div className="mb-space-md flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-headline-sm text-on-surface">Comparar contratas</h2>
                  {datos && (
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      {datos.a.cliente} · {datos.a.telefono ?? "sin teléfono"} · {datos.a.espacio} · creadas con{" "}
                      {datos.minutosEntreCreacion} min de diferencia
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setAbierto(false)} aria-label="Cerrar" className="text-on-surface-variant hover:text-on-surface">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {error && <p className="font-body-sm text-error">{error}</p>}
              {!datos && !error && <p className="font-body-sm text-on-surface-variant">Cargando…</p>}
              {datos && (
                <>
                  <table className="w-full text-left font-body-sm text-body-sm">
                    <thead>
                      <tr className="bg-surface-container-lowest font-label-xs text-label-xs uppercase tracking-wider text-outline">
                        <th className="rounded-l px-2.5 py-2">Campo</th>
                        <th className="px-2.5 py-2">Contrata A</th>
                        <th className="rounded-r px-2.5 py-2">Contrata B</th>
                      </tr>
                    </thead>
                    <tbody>
                      {FILAS.map((f) => {
                        const va = f.valor(datos.a);
                        const vb = f.valor(datos.b);
                        const difiere = va !== vb && f.campo !== "Creada";
                        return (
                          <tr key={f.campo} className={difiere ? "bg-tertiary-container/30" : ""}>
                            <td className="px-2.5 py-1.5 text-on-surface-variant">{f.campo}</td>
                            <td className={`px-2.5 py-1.5 ${difiere ? "text-tertiary" : "text-on-surface"}`}>{va}</td>
                            <td className={`px-2.5 py-1.5 ${difiere ? "text-tertiary" : "text-on-surface"}`}>{vb}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(datos.a.tienePagos || datos.b.tienePagos) && (
                    <p className="mt-space-md rounded-lg bg-tertiary-container/30 px-3 py-2 font-body-sm text-body-sm text-tertiary">
                      {datos.a.tienePagos && datos.b.tienePagos
                        ? "Las dos ya tienen cobros: revisa con cuidado antes de borrar alguna."
                        : `La contrata ${datos.a.tienePagos ? "A" : "B"} ya tiene cobros; la que conviene borrar es la ${datos.a.tienePagos ? "B" : "A"}.`}
                    </p>
                  )}
                  <p className="mt-space-sm font-label-sm text-label-sm text-outline">Para borrar una contrata, hazlo desde la app.</p>
                </>
              )}

              <div className="mt-space-md flex items-center justify-end gap-2">
                <BotonIgnorar revision={revision} clave={clave} />
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-lg bg-surface-container px-3 py-1 font-label-sm text-label-sm text-on-surface hover:bg-surface-container-high"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>,
          contenedor
        )}
    </>
  );
}
