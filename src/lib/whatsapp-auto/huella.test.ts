// @vitest-environment node
import { describe, expect, it } from "vitest";
import { ARCHIVOS_DEL_WORKER, calcularHuella } from "../../../worker/whatsapp/huella.mjs";

describe("huella del worker", () => {
  it("es estable y de 12 caracteres hex", () => {
    const a = calcularHuella();
    expect(a).toMatch(/^[0-9a-f]{12}$/);
    expect(calcularHuella()).toBe(a);
  });
  it("cubre el código del worker y lo que importa de la app", () => {
    expect(ARCHIVOS_DEL_WORKER).toEqual(
      expect.arrayContaining(["worker/whatsapp", "src/lib/whatsapp-auto", "prisma/schema.prisma"])
    );
  });
});
