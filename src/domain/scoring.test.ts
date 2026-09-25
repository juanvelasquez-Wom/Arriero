import { describe, expect, it } from "vitest";
import { computeFinalScore, computeIce, DEFAULT_SCORING, parseScoringConfig, round1, scoreExperiment } from "./scoring";

describe("computeIce", () => {
  it("promedia y redondea a un decimal", () => {
    expect(computeIce(8, 7, 8)).toBe(7.7); // ejercicio 1 del ejemplo
    expect(computeIce(7, 6, 6)).toBe(6.3); // ejercicio 2
    expect(computeIce(7, 5, 9)).toBe(7.0); // ejercicio 3
    expect(computeIce(10, 10, 10)).toBe(10);
    expect(computeIce(1, 1, 2)).toBe(1.3);
    expect(computeIce(1, 2, 2)).toBe(1.7);
  });

  it("devuelve null si falta alguna calificación", () => {
    expect(computeIce(null, 7, 8)).toBeNull();
    expect(computeIce(8, undefined, 8)).toBeNull();
    expect(computeIce(8, 7, null)).toBeNull();
  });
});

describe("computeFinalScore", () => {
  it("suma el bono de calendario y resta la penalidad de control (valores por defecto)", () => {
    expect(computeFinalScore(7.7, true, "ours")).toBe(8.7);
    expect(computeFinalScore(6.3, true, "ours")).toBe(7.3);
    expect(computeFinalScore(7.0, true, "ours")).toBe(8.0);
    expect(computeFinalScore(7.0, false, "ours")).toBe(7.0);
    expect(computeFinalScore(7.0, false, "shared")).toBe(6.0);
    expect(computeFinalScore(7.0, false, "external")).toBe(4.0);
    expect(computeFinalScore(7.0, true, "external")).toBe(5.0);
  });

  it("usa la configuración del programa", () => {
    const config = { calendar_bonus: 2, shared_penalty: 0.5, external_penalty: 5 };
    expect(computeFinalScore(6.3, true, "shared", config)).toBe(7.8);
    expect(computeFinalScore(6.3, false, "external", config)).toBe(1.3);
  });

  it("es null si el ICE es null", () => {
    expect(computeFinalScore(null, true, "ours")).toBeNull();
  });
});

describe("scoreExperiment", () => {
  it("calcula ambos puntajes", () => {
    expect(scoreExperiment({ impact: 8, confidence: 7, ease: 8, fits_calendar: true, control: "ours" })).toEqual({
      ice: 7.7,
      final: 8.7,
    });
  });
});

describe("parseScoringConfig", () => {
  it("completa con valores por defecto", () => {
    expect(parseScoringConfig(null)).toEqual(DEFAULT_SCORING);
    expect(parseScoringConfig({ calendar_bonus: 2 })).toEqual({ ...DEFAULT_SCORING, calendar_bonus: 2 });
    expect(parseScoringConfig({ calendar_bonus: "x" })).toEqual(DEFAULT_SCORING);
  });
});

describe("round1", () => {
  it("redondea la mitad hacia arriba", () => {
    expect(round1(7.25)).toBe(7.3);
    expect(round1(7.65)).toBe(7.7);
    expect(round1(-1.25)).toBe(-1.3);
  });
});
