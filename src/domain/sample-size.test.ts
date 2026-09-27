import { describe, expect, it } from "vitest";
import { normalQuantile, sampleSizePerVariant, suggestedDays } from "./sample-size";

describe("normalQuantile", () => {
  it("da los valores conocidos", () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.8)).toBeCloseTo(0.841621, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
    expect(normalQuantile(0.01)).toBeCloseTo(-2.326348, 5);
    expect(Number.isNaN(normalQuantile(0))).toBe(true);
  });
});

describe("sampleSizePerVariant", () => {
  it("5 % de base y 20 % de cambio relativo ≈ 8.150 por variante", () => {
    const n = sampleSizePerVariant(0.05, 0.2)!;
    expect(n).toBeGreaterThan(8100);
    expect(n).toBeLessThan(8200);
  });

  it("detectar cambios más chicos pide más muestra", () => {
    expect(sampleSizePerVariant(0.05, 0.1)!).toBeGreaterThan(sampleSizePerVariant(0.05, 0.2)!);
  });

  it("acepta cambios hacia abajo", () => {
    expect(sampleSizePerVariant(0.2, -0.1)).toBeGreaterThan(0);
  });

  it("más potencia, más muestra", () => {
    expect(sampleSizePerVariant(0.05, 0.2, { power: 0.9 })!).toBeGreaterThan(sampleSizePerVariant(0.05, 0.2)!);
  });

  it("devuelve null con datos sin sentido", () => {
    expect(sampleSizePerVariant(0, 0.1)).toBeNull();
    expect(sampleSizePerVariant(1, 0.1)).toBeNull();
    expect(sampleSizePerVariant(0.05, 0)).toBeNull();
    expect(sampleSizePerVariant(0.6, 1)).toBeNull();
    expect(sampleSizePerVariant(Number.NaN, 0.1)).toBeNull();
  });
});

describe("suggestedDays", () => {
  it("reparte la muestra total en el tráfico diario y redondea a semanas", () => {
    // 2 × 7.000 = 14.000 personas; 7.000 por semana = 1.000 al día → 14 días.
    expect(suggestedDays(7000, 2, 7000)).toBe(14);
    // 2 × 1.000 = 2.000; 1.400 por semana = 200 al día → 10 días → 14.
    expect(suggestedDays(1000, 2, 1400)).toBe(14);
  });

  it("mínimo una semana", () => {
    expect(suggestedDays(10, 2, 100000)).toBe(7);
  });

  it("sin tráfico o sin muestra no sugiere", () => {
    expect(suggestedDays(1000, 2, null)).toBeNull();
    expect(suggestedDays(1000, 2, 0)).toBeNull();
    expect(suggestedDays(null, 2, 1000)).toBeNull();
  });
});
