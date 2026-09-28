import { describe, expect, it } from "vitest";
import { parentPath, sectionOf } from "./navigation";

describe("parentPath", () => {
  it("no hay a dónde volver desde el inicio", () => {
    expect(parentPath("/")).toBeNull();
  });
  it("sube un nivel", () => {
    expect(parentPath("/programas")).toBe("/");
    expect(parentPath("/programas/p1")).toBe("/programas");
    expect(parentPath("/programas/p1/ejercicios/e1")).toBe("/programas/p1/ejercicios");
    expect(parentPath("/pilotos/x/ficha")).toBe("/pilotos/x");
    expect(parentPath("/ideas/s1")).toBe("/ideas");
  });
  it("salta carpetas sin página y rutas que redirigen", () => {
    expect(parentPath("/programas/p1/lineas/l1")).toBe("/programas/p1");
    expect(parentPath("/admin/usuarios")).toBe("/");
    expect(parentPath("/programas/p1/tableros/gantt")).toBe("/programas/p1");
  });
  it("ignora la query", () => {
    expect(parentPath("/programas/p1/ejercicios?tab=x")).toBe("/programas/p1");
  });
});

describe("sectionOf", () => {
  it("reconoce las secciones", () => {
    expect(sectionOf("/")).toBe("inicio");
    expect(sectionOf("/programas/p1/ejercicios")).toBe("programas");
    expect(sectionOf("/pilotos/nuevo")).toBe("pilotos");
    expect(sectionOf("/tableros")).toBe("tableros");
    expect(sectionOf("/direccion")).toBe("direccion");
    expect(sectionOf("/recua")).toBe("recua");
    expect(sectionOf("/insights/abc")).toBe("insights");
    expect(sectionOf("/ideas")).toBe("ideas");
    expect(sectionOf("/ideas/s1")).toBe("ideas");
    expect(sectionOf("/aprender")).toBeNull();
  });
});
