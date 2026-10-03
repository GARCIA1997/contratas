import { describe, expect, it, vi } from "vitest";
import { reintentarSiCursorInvalido } from "./dexie-retry";

describe("reintentarSiCursorInvalido", () => {
  it("retorna el resultado directo si no hay error", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    expect(await reintentarSiCursorInvalido(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("reintenta si falla con el error de cursor de WebKit, y devuelve el resultado si el reintento funciona", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attempt to iterate a cursor that doesn't exist"))
      .mockResolvedValueOnce("ok");
    expect(await reintentarSiCursorInvalido(fn)).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("no reintenta otros errores — los deja pasar de inmediato", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("otro error cualquiera"));
    await expect(reintentarSiCursorInvalido(fn)).rejects.toThrow("otro error cualquiera");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("se rinde tras agotar los intentos si el error de cursor persiste", async () => {
    const fn = vi
      .fn()
      .mockRejectedValue(new Error("Attempt to iterate a cursor that doesn't exist"));
    await expect(reintentarSiCursorInvalido(fn, 3)).rejects.toThrow(
      "cursor that doesn't exist"
    );
    expect(fn).toHaveBeenCalledTimes(3);
  });
});

describe("esFallaIndexedDB", () => {
  it("reconoce todas las variantes del bug de WebKit reportadas en producción", async () => {
    const { esFallaIndexedDB } = await import("./dexie-retry");
    for (const m of [
      "Attempt to iterate a cursor that doesn't exist",
      "Attempt to get all index records from database without an in-progress transaction",
      "Attempt to get count from database without an in-progress transaction",
      "An internal error was encountered in the Indexed Database server",
    ]) {
      expect(esFallaIndexedDB(new Error(m))).toBe(true);
    }
  });

  it("también cuando Dexie envuelve el error nativo en `inner`", async () => {
    const { esFallaIndexedDB } = await import("./dexie-retry");
    const err = Object.assign(new Error("UnknownError"), {
      inner: new Error("An internal error was encountered in the Indexed Database server"),
    });
    expect(esFallaIndexedDB(err)).toBe(true);
  });

  it("no confunde errores normales", async () => {
    const { esFallaIndexedDB } = await import("./dexie-retry");
    expect(esFallaIndexedDB(new Error("Monto inválido"))).toBe(false);
    expect(esFallaIndexedDB(null)).toBe(false);
  });

  it("reintenta las variantes de conexión muerta, no solo la del cursor", async () => {
    const { conIndexedDBSano } = await import("./dexie-retry");
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("Attempt to get count from database without an in-progress transaction"))
      .mockRejectedValueOnce(new Error("An internal error was encountered in the Indexed Database server"))
      .mockResolvedValueOnce(7);
    expect(await conIndexedDBSano(fn)).toBe(7);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
