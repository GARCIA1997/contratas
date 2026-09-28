import { describe, expect, it } from "vitest";
import { DATOS_VIEJOS_MS, haceCuanto, resumirEstado } from "@/lib/offline/resumen-sync";
import type { EstadoSync } from "@/lib/offline/use-estado-sync";

const AHORA = 1_800_000_000_000;

function estado(cambios: Partial<EstadoSync> = {}): EstadoSync {
  return {
    modoLocal: false,
    calidad: "rapida",
    envio: { enviando: false, proximoReintento: null, ultimoEnvio: null },
    pendientes: 0,
    conflictos: 0,
    ultimoSync: AHORA - 60_000,
    ...cambios,
  };
}

describe("resumirEstado", () => {
  it("al día con datos frescos", () => {
    expect(resumirEstado(estado(), null, AHORA)).toMatchObject({ icono: "ok", tono: "ok", sugerencia: false });
  });

  it("al día pero con datos viejos: sugiere sincronizar", () => {
    const r = resumirEstado(estado({ ultimoSync: AHORA - DATOS_VIEJOS_MS - 1 }), null, AHORA);
    expect(r).toMatchObject({ icono: "ok", tono: "aviso", sugerencia: true });
  });

  it("la descarga previa al modo local manda sobre todo lo demás", () => {
    const r = resumirEstado(estado({ conflictos: 3, modoLocal: true }), { pct: 40 }, AHORA);
    expect(r).toMatchObject({ icono: "descargando", etiqueta: "Preparando 40%" });
  });

  it("conflictos por revisar van antes que modo local", () => {
    const r = resumirEstado(estado({ conflictos: 2, modoLocal: true }), null, AHORA);
    expect(r).toMatchObject({ icono: "revisar", tono: "error", etiqueta: "2 por revisar" });
  });

  it("modo local muestra el contador contra el límite y sugiere subir si ya hay buena señal", () => {
    const r = resumirEstado(estado({ modoLocal: true, pendientes: 12 }), null, AHORA);
    expect(r).toMatchObject({ icono: "local", etiqueta: "Local · 12/100", sugerencia: true });
  });

  it("modo local cerca del límite se pinta en rojo", () => {
    const r = resumirEstado(estado({ modoLocal: true, pendientes: 85, calidad: "sin-red" }), null, AHORA);
    expect(r).toMatchObject({ tono: "error", sugerencia: false });
  });

  it("sin señal automático (switch encendido) también muestra el contador", () => {
    const r = resumirEstado(estado({ calidad: "sin-red", pendientes: 5 }), null, AHORA);
    expect(r).toMatchObject({ icono: "sin-senal", etiqueta: "Sin señal · 5/100" });
  });

  it("señal débil con pendientes", () => {
    const r = resumirEstado(estado({ calidad: "lenta", pendientes: 2 }), null, AHORA);
    expect(r).toMatchObject({ icono: "debil", etiqueta: "Señal débil · 2" });
  });

  it("enviando", () => {
    const r = resumirEstado(
      estado({ pendientes: 4, envio: { enviando: true, proximoReintento: null, ultimoEnvio: null } }),
      null,
      AHORA
    );
    expect(r).toMatchObject({ icono: "enviando", etiqueta: "Subiendo 4" });
  });

  it("buena señal con pendientes esperando reintento", () => {
    const r = resumirEstado(estado({ pendientes: 1 }), null, AHORA);
    expect(r).toMatchObject({ icono: "espera", etiqueta: "1 por subir" });
  });
});

describe("haceCuanto", () => {
  it.each([
    [null, "nunca"],
    [AHORA - 10_000, "hace un momento"],
    [AHORA - 5 * 60_000, "hace 5 min"],
    [AHORA - 3 * 3_600_000, "hace 3 h"],
    [AHORA - 26 * 3_600_000, "hace 1 día"],
    [AHORA - 72 * 3_600_000, "hace 3 días"],
  ])("%s → %s", (epoch, texto) => {
    expect(haceCuanto(epoch, AHORA)).toBe(texto);
  });
});
