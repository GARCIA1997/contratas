import { describe, expect, it } from "vitest";
import { enlaceParaApp, esAndroid } from "./whatsapp-app";

describe("enlaceParaApp", () => {
  const href = "whatsapp://send?phone=523121128425&text=Hola%20mundo";
  it("sin preferencia el enlace no cambia", () => {
    expect(enlaceParaApp(href, "sistema")).toBe(href);
  });
  it("Business y normal usan un intent con su paquete y conservan teléfono y texto", () => {
    expect(enlaceParaApp(href, "business")).toBe(
      "intent://send?phone=523121128425&text=Hola%20mundo#Intent;scheme=whatsapp;package=com.whatsapp.w4b;end"
    );
    expect(enlaceParaApp(href, "normal")).toContain("package=com.whatsapp;end");
  });
  it("no toca enlaces que no son whatsapp:// (wa.me sin teléfono)", () => {
    expect(enlaceParaApp("https://wa.me/?text=x", "business")).toBe("https://wa.me/?text=x");
  });
  it("detecta Android", () => {
    expect(esAndroid("Mozilla/5.0 (Linux; Android 14; Pixel 8)")).toBe(true);
    expect(esAndroid("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe(false);
  });
});
