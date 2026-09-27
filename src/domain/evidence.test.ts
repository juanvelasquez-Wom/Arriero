import { describe, expect, it } from "vitest";
import { addDays } from "./dates";
import { draftProblemFromMetric, expectedValue, pickHorizon, relativeGap, type MetricEvidenceInput } from "./evidence";

const H1 = { name: "H1", start_date: "2026-08-03", end_date: "2027-01-24", target: 520 };
const weeks = (from: string, values: number[]) => values.map((value, i) => ({ week_start: addDays(from, i * 7), value }));

const base: MetricEvidenceInput = {
  name: "Altas digitales semanales",
  unit: "altas",
  direction: "up",
  baseline: 420,
  values: [],
  horizon: H1,
};

describe("pickHorizon", () => {
  const hs = [
    { name: "H2", start_date: "2027-01-25", end_date: "2027-04-30" },
    { name: "H1", start_date: "2026-08-01", end_date: "2027-01-24" },
  ];
  it("el que contiene hoy, si no el próximo, si no el último", () => {
    expect(pickHorizon(hs, "2026-10-01")?.name).toBe("H1");
    expect(pickHorizon(hs, "2026-07-01")?.name).toBe("H1");
    expect(pickHorizon(hs, "2027-06-01")?.name).toBe("H2");
    expect(pickHorizon([], "2026-10-01")).toBeNull();
  });
});

describe("expectedValue", () => {
  it("interpola en línea recta de la línea base a la meta", () => {
    expect(expectedValue(420, H1, H1.start_date)).toBe(420);
    expect(expectedValue(420, H1, H1.end_date)).toBe(520);
    expect(expectedValue(420, H1, "2027-06-01")).toBe(520);
    expect(expectedValue(420, H1, addDays(H1.start_date, 87))).toBeCloseTo(470, 5);
  });
  it("sin meta se espera mantener la línea base; sin línea base, la meta", () => {
    expect(expectedValue(420, null, "2026-10-01")).toBe(420);
    expect(expectedValue(null, H1, "2026-10-01")).toBe(520);
    expect(expectedValue(null, null, "2026-10-01")).toBeNull();
  });
});

describe("relativeGap", () => {
  it("positivo = peor, según la dirección", () => {
    expect(relativeGap(80, 100, "up")).toBeCloseTo(0.2);
    expect(relativeGap(120, 100, "down")).toBeCloseTo(0.2);
    expect(relativeGap(120, 100, "up")).toBeCloseTo(-0.2);
    expect(relativeGap(10, 0, "up")).toBeNull();
    expect(relativeGap(10, null, "up")).toBeNull();
  });
});

describe("draftProblemFromMetric", () => {
  it("métrica que debe subir y va por debajo del camino esperado", () => {
    // Última semana: 28 sep 2026, 56 días de 174 → esperado 420 + 100·56/174 ≈ 452,2.
    const d = draftProblemFromMetric({ ...base, values: weeks("2026-08-24", [410, 398, 385, 372, 360, 351, 356]).slice(0, 6) });
    expect(d.title).toBe("Altas digitales semanales va 22,4 % por debajo de lo esperado");
    expect(d.evidence).toContain("Últimas 6 semanas: 410, 398, 385, 372, 360, 351 altas.");
    expect(d.evidence).toContain("Línea base: 420 altas.");
    expect(d.evidence).toContain("Meta H1: 520 altas.");
    expect(d.evidence).toContain("Va 22,4 % por debajo del camino esperado");
    expect(d.evidence).toContain("Cambio en el periodo: −14,4 %.");
    expect(d.gap).toBeCloseTo(0.2238, 3);
  });

  it("métrica que debe bajar y va por encima; usa ; con decimales y cita máximo 8 semanas", () => {
    const d = draftProblemFromMetric({
      name: "Costo por conversación",
      unit: "COP",
      direction: "down",
      baseline: 9800,
      horizon: null,
      values: weeks("2026-07-06", [9000, 9100, 9800, 10200, 10700, 11300, 11900, 12600, 13200, 13300.5]),
    });
    expect(d.title).toBe("Costo por conversación va 35,7 % por encima de lo esperado");
    expect(d.evidence).toMatch(/^Últimas 8 semanas: 9\.800; 10\.200; .*13\.300,5 \(COP\)\./);
    expect(d.evidence).toContain("de la línea base");
  });

  it("si va bien, no inventa un problema: título neutro", () => {
    const d = draftProblemFromMetric({ ...base, values: weeks("2026-08-03", [430, 440, 450, 460]) });
    expect(d.gap).toBeLessThan(0);
    expect(d.title).toBe("Altas digitales semanales: revisar dónde se está perdiendo valor");
    expect(d.evidence).toContain("va en línea o mejor");
  });

  it("sin valores cargados pide completar la evidencia", () => {
    const d = draftProblemFromMetric({ ...base, baseline: null, horizon: null });
    expect(d.gap).toBeNull();
    expect(d.evidence).toContain("Todavía no hay valores semanales");
    expect(d.evidence.length).toBeGreaterThanOrEqual(10);
  });
});
