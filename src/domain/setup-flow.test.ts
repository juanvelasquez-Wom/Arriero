import { describe, expect, it } from "vitest";
import {
  canFinishEarly,
  isReachable,
  isStepDone,
  nextStep,
  parseStep,
  previousStep,
  resumeStep,
  setupProgress,
  stepSequence,
  type SetupState,
} from "./setup-flow";

const lines = [{ id: "a" }, { id: "b" }];
const base: SetupState = { setupStep: 0, completed: false, hasDates: false, lines: [] };
const ready = { id: "a", hasNorthStar: true, hasInputs: true };
const empty = { id: "b", hasNorthStar: false, hasInputs: false };

describe("secuencia", () => {
  it("una sola pantalla por línea, sin equipo ni priorización en el camino principal", () => {
    const seq = stepSequence(lines).map((s) => `${s.key}${s.lineId ? `:${s.lineId}` : ""}`);
    expect(seq).toEqual(["programa", "calendario", "lineas", "linea:a", "linea:b", "resumen"]);
  });
  it("1 línea son 5 pantallas y 3 líneas son 7", () => {
    expect(stepSequence([{ id: "a" }])).toHaveLength(5);
    expect(stepSequence([{ id: "a" }, { id: "b" }, { id: "c" }])).toHaveLength(7);
  });
  it("siguiente y anterior cruzan de una línea a la otra", () => {
    expect(nextStep({ key: "linea", lineId: "a" }, lines)).toEqual({ key: "linea", lineId: "b" });
    expect(previousStep({ key: "linea", lineId: "b" }, lines)).toEqual({ key: "linea", lineId: "a" });
    expect(nextStep({ key: "linea", lineId: "b" }, lines)).toEqual({ key: "resumen" });
    expect(nextStep({ key: "lineas" }, [])).toEqual({ key: "resumen" });
    expect(nextStep({ key: "resumen" }, lines)).toBeNull();
  });
  it("los opcionales vuelven al resumen", () => {
    expect(nextStep({ key: "equipo" }, lines)).toEqual({ key: "resumen" });
    expect(previousStep({ key: "puntaje" }, lines)).toEqual({ key: "resumen" });
  });
});

describe("resumeStep", () => {
  it("retoma en el primer paso pendiente", () => {
    expect(resumeStep(base)).toEqual({ key: "programa" });
    expect(resumeStep({ ...base, hasDates: true, setupStep: 1 })).toEqual({ key: "calendario" });
    // Programas del asistente anterior: calendario guardado, horizontes no.
    expect(resumeStep({ ...base, hasDates: true, setupStep: 2 })).toEqual({ key: "calendario" });
    expect(resumeStep({ ...base, hasDates: true, setupStep: 3 })).toEqual({ key: "lineas" });
  });
  it("dentro de las líneas, retoma en la primera sin métrica norte o sin árbol", () => {
    const s = { ...base, hasDates: true, setupStep: 4 };
    expect(resumeStep({ ...s, lines: [ready, empty] })).toEqual({ key: "linea", lineId: "b" });
    expect(resumeStep({ ...s, lines: [{ id: "a", hasNorthStar: true, hasInputs: false }] })).toEqual({ key: "linea", lineId: "a" });
    expect(resumeStep({ ...s, lines: [ready] })).toEqual({ key: "resumen" });
  });
  it("completado va al resumen y todo es accesible", () => {
    const done = { ...base, completed: true, hasDates: true, setupStep: 5 };
    expect(resumeStep(done)).toEqual({ key: "resumen" });
    expect(isReachable({ key: "calendario" }, done)).toBe(true);
    expect(isReachable({ key: "equipo" }, done)).toBe(true);
  });
});

describe("isReachable y terminar después", () => {
  it("no deja saltar a pasos posteriores al pendiente", () => {
    const s = { ...base, hasDates: true, setupStep: 1 };
    expect(isReachable({ key: "programa" }, s)).toBe(true);
    expect(isReachable({ key: "calendario" }, s)).toBe(true);
    expect(isReachable({ key: "lineas" }, s)).toBe(false);
    expect(isReachable({ key: "resumen" }, s)).toBe(false);
    expect(isReachable({ key: "equipo" }, s)).toBe(false);
  });
  it("con las líneas creadas se abre todo, aunque falten líneas por configurar", () => {
    const s = { ...base, hasDates: true, setupStep: 4, lines: [empty, { ...empty, id: "c" }] };
    expect(canFinishEarly(s)).toBe(true);
    expect(isReachable({ key: "resumen" }, s)).toBe(true);
    expect(isReachable({ key: "puntaje" }, s)).toBe(true);
    expect(isReachable({ key: "linea", lineId: "c" }, s)).toBe(true);
  });
  it("sin líneas no hay resumen", () => {
    const s = { ...base, hasDates: true, setupStep: 4 };
    expect(canFinishEarly(s)).toBe(false);
    expect(isReachable({ key: "resumen" }, s)).toBe(false);
    expect(isReachable({ key: "lineas" }, s)).toBe(true);
  });
});

describe("avance", () => {
  it("cuenta lo hecho según los datos, no según la pantalla", () => {
    const s = { ...base, hasDates: true, setupStep: 4, lines: [ready, empty] };
    expect(isStepDone({ key: "calendario" }, s)).toBe(true);
    expect(isStepDone({ key: "linea", lineId: "a" }, s)).toBe(true);
    expect(isStepDone({ key: "linea", lineId: "b" }, s)).toBe(false);
    // programa, calendario, líneas y la línea a: 4 de 6.
    expect(setupProgress(s)).toBe(67);
    expect(setupProgress(base)).toBe(0);
    expect(setupProgress({ ...s, completed: true, lines: [ready] })).toBe(100);
  });
});

describe("parseStep", () => {
  it("valida el paso y exige la línea en la pantalla de línea", () => {
    expect(parseStep("calendario", undefined)).toEqual({ key: "calendario" });
    expect(parseStep("linea", "x")).toEqual({ key: "linea", lineId: "x" });
    expect(parseStep("linea", undefined)).toBeNull();
    expect(parseStep("otro", undefined)).toBeNull();
  });
  it("traduce los enlaces del asistente anterior", () => {
    expect(parseStep("horizontes", undefined)).toEqual({ key: "calendario" });
    expect(parseStep("linea-arbol", "x")).toEqual({ key: "linea", lineId: "x" });
    expect(parseStep("linea-embudo", undefined)).toBeNull();
  });
});
