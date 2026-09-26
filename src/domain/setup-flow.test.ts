import { describe, expect, it } from "vitest";
import { isReachable, nextStep, parseStep, previousStep, resumeStep, stepSequence, type SetupState } from "./setup-flow";

const lines = [{ id: "a" }, { id: "b" }];
const base: SetupState = { setupStep: 0, completed: false, hasDates: false, lines: [] };

describe("secuencia", () => {
  it("incluye los tres subpasos por cada línea, en orden", () => {
    const seq = stepSequence(lines).map((s) => `${s.key}${s.lineId ? `:${s.lineId}` : ""}`);
    expect(seq).toEqual([
      "programa",
      "calendario",
      "horizontes",
      "lineas",
      "linea-norte:a",
      "linea-arbol:a",
      "linea-embudo:a",
      "linea-norte:b",
      "linea-arbol:b",
      "linea-embudo:b",
      "equipo",
      "puntaje",
      "resumen",
    ]);
  });
  it("siguiente y anterior cruzan de una línea a la otra", () => {
    expect(nextStep({ key: "linea-embudo", lineId: "a" }, lines)).toEqual({ key: "linea-norte", lineId: "b" });
    expect(previousStep({ key: "linea-norte", lineId: "b" }, lines)).toEqual({ key: "linea-embudo", lineId: "a" });
    expect(nextStep({ key: "lineas" }, [])).toEqual({ key: "equipo" });
    expect(nextStep({ key: "resumen" }, lines)).toBeNull();
  });
});

describe("resumeStep", () => {
  it("retoma en el primer paso pendiente", () => {
    expect(resumeStep(base)).toEqual({ key: "programa" });
    expect(resumeStep({ ...base, hasDates: true, setupStep: 1 })).toEqual({ key: "calendario" });
    expect(resumeStep({ ...base, hasDates: true, setupStep: 2 })).toEqual({ key: "horizontes" });
    expect(resumeStep({ ...base, hasDates: true, setupStep: 3 })).toEqual({ key: "lineas" });
  });
  it("dentro de las líneas, retoma en la primera sin métrica norte o sin árbol", () => {
    const s = { ...base, hasDates: true, setupStep: 4 };
    expect(
      resumeStep({ ...s, lines: [{ id: "a", hasNorthStar: true, hasInputs: true }, { id: "b", hasNorthStar: false, hasInputs: false }] }),
    ).toEqual({ key: "linea-norte", lineId: "b" });
    expect(resumeStep({ ...s, lines: [{ id: "a", hasNorthStar: true, hasInputs: false }] })).toEqual({ key: "linea-arbol", lineId: "a" });
    expect(resumeStep({ ...s, lines: [{ id: "a", hasNorthStar: true, hasInputs: true }] })).toEqual({ key: "equipo" });
  });
  it("completado va al resumen y todo es accesible", () => {
    const done = { ...base, completed: true, hasDates: true, setupStep: 5 };
    expect(resumeStep(done)).toEqual({ key: "resumen" });
    expect(isReachable({ key: "calendario" }, done)).toBe(true);
  });
});

describe("isReachable", () => {
  it("no deja saltar a pasos posteriores al pendiente", () => {
    const s = { ...base, hasDates: true, setupStep: 1 };
    expect(isReachable({ key: "programa" }, s)).toBe(true);
    expect(isReachable({ key: "calendario" }, s)).toBe(true);
    expect(isReachable({ key: "horizontes" }, s)).toBe(false);
  });
  it("con las líneas completas se abren equipo, priorización y resumen", () => {
    const s = { ...base, hasDates: true, setupStep: 4, lines: [{ id: "a", hasNorthStar: true, hasInputs: true }] };
    expect(isReachable({ key: "equipo" }, s)).toBe(true);
    expect(isReachable({ key: "puntaje" }, s)).toBe(true);
    expect(isReachable({ key: "resumen" }, s)).toBe(true);
    expect(isReachable({ key: "puntaje" }, { ...s, lines: [{ id: "a", hasNorthStar: false, hasInputs: false }] })).toBe(false);
  });
});

describe("parseStep", () => {
  it("valida el paso y exige la línea en los subpasos", () => {
    expect(parseStep("calendario", undefined)).toEqual({ key: "calendario" });
    expect(parseStep("linea-arbol", "x")).toEqual({ key: "linea-arbol", lineId: "x" });
    expect(parseStep("linea-arbol", undefined)).toBeNull();
    expect(parseStep("otro", undefined)).toBeNull();
  });
});
