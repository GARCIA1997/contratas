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
