import { describe, expect, it } from "vitest";
import { safeNext } from "./redirect";

describe("safeNext", () => {
  it("acepta rutas internas con query y fragmento", () => {
    expect(safeNext("/pilotos/abc?tab=lectura#x")).toBe("/pilotos/abc?tab=lectura#x");
    expect(safeNext("/restablecer")).toBe("/restablecer");
  });

  it("rechaza destinos externos o raros", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "\\\\evil.com", "https://evil.com", "evil.com", "/\u0000x", "", null, undefined, " //evil.com"]) {
      expect(safeNext(bad as string)).toBe("/programas");
    }
  });

  it("usa el respaldo indicado", () => {
    expect(safeNext("https://x.com", "/login")).toBe("/login");
  });
});
