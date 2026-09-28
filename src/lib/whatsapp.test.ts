import { describe, expect, it } from "vitest";
import { linkWhatsApp } from "./whatsapp";

describe("linkWhatsApp", () => {
  it("completa con 52 un número mexicano capturado a 10 dígitos", () => {
    expect(linkWhatsApp("312 123 4567", "hola")).toBe("whatsapp://send?phone=523121234567&text=hola");
  });

  it("respeta el número que ya trae lada", () => {
    expect(linkWhatsApp("+52 313 191 1315", "hola")).toBe(
      "whatsapp://send?phone=523131911315&text=hola"
    );
  });

  it("sin teléfono deja elegir el contacto", () => {
    expect(linkWhatsApp(null, "hola")).toBe("https://wa.me/?text=hola");
  });
});
