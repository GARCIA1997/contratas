import { describe, expect, it } from "vitest";
import { avisar, cerrarDialogo, confirmar, suscribirDialogo, type Dialogo } from "./dialogo";

describe("dialogo (alertas propias en vez de las del navegador)", () => {
  it("confirmar resuelve con lo que elige el usuario y avisar espera a que se cierre", async () => {
    let actual: Dialogo | null = null;
    const quitar = suscribirDialogo((d) => (actual = d));
    const p1 = confirmar("¿Eliminar?", { aceptar: "Eliminar", peligro: true });
    const p2 = avisar("Listo");
    expect(actual!.mensaje).toBe("¿Eliminar?");
    expect(actual!.peligro).toBe(true);
    cerrarDialogo(actual!.id, false);
    expect(await p1).toBe(false);
    expect(actual!.mensaje).toBe("Listo");
    cerrarDialogo(actual!.id, true);
    await p2;
    expect(actual).toBeNull();
    quitar();
  });
});
