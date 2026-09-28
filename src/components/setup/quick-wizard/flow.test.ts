import { describe, expect, it } from "vitest";
import { QUICK_STEPS, STEP_TEXT, stepForField, validateQuickStep } from "./flow";

const ok = { lines: [{ templateKey: "pospago" }], customOn: false, lineName: "", startDate: "2026-10-01" };

describe("pasos del arranque rápido", () => {
  it("son cinco, con el resumen al final, y todos tienen su pregunta", () => {
    expect(QUICK_STEPS).toEqual(["nombre", "lineas", "fechas", "calendario", "resumen"]);
    for (const k of QUICK_STEPS) expect(STEP_TEXT[k].title.length).toBeGreaterThan(5);
  });

  it("explica una vez que en Arriero se dice programa", () => {
    expect(STEP_TEXT.nombre.title).toMatch(/proyecto de growth/);
    expect(STEP_TEXT.nombre.subtitle).toMatch(/le decimos programa/);
  });
});

describe("validateQuickStep", () => {
  it("pide al menos una línea", () => {
    expect(validateQuickStep("lineas", { ...ok, lines: [] })).toHaveProperty("lines");
  });

  it("pide el nombre de la otra línea", () => {
    const custom = { ...ok, customOn: true, lines: [{ templateKey: "generic", lineName: "x" }], lineName: "x" };
    expect(validateQuickStep("lineas", custom)).toHaveProperty("lineName");
    expect(validateQuickStep("lineas", { ...custom, lineName: "Hogar fibra" })).toEqual({});
  });

  it("pide una fecha de inicio válida", () => {
    expect(validateQuickStep("fechas", { ...ok, startDate: "" })).toHaveProperty("startDate");
    expect(validateQuickStep("fechas", ok)).toEqual({});
  });

  it("el nombre y el calendario no bloquean", () => {
    expect(validateQuickStep("nombre", ok)).toEqual({});
    expect(validateQuickStep("calendario", ok)).toEqual({});
  });
});

describe("stepForField", () => {
  it("manda cada error del servidor a su pantalla", () => {
    expect(stepForField("name")).toBe("nombre");
    expect(stepForField("lines")).toBe("lineas");
    expect(stepForField("lineName")).toBe("lineas");
    expect(stepForField("startDate")).toBe("fechas");
    expect(stepForField("months")).toBe("fechas");
    expect(stepForField("useTelcoCalendar")).toBe("calendario");
    expect(stepForField("otro")).toBe("resumen");
  });
});
