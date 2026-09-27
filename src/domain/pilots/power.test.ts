import { describe, expect, it } from "vitest";
import { sampleSizePerVariant } from "../sample-size";
import { computePower, mdeForContinuous, mdeForRate } from "./power";

describe("mdeForRate", () => {
  it("es la inversa de sampleSizePerVariant", () => {
    const n = sampleSizePerVariant(0.05, 0.1)!;
    const mde = mdeForRate(0.05, n)!;
    expect(mde).toBeCloseTo(0.1, 3);
    expect(sampleSizePerVariant(0.05, mde)!).toBeLessThanOrEqual(n);
  });

  it("baja con más muestra", () => {
    expect(mdeForRate(0.1, 20000)!).toBeLessThan(mdeForRate(0.1, 2000)!);
  });

  it("null si es imposible o los datos no sirven", () => {
    expect(mdeForRate(0.001, 3)).toBeNull();
    expect(mdeForRate(0, 1000)).toBeNull();
    expect(mdeForRate(0.1, 0)).toBeNull();
  });
});

describe("mdeForContinuous", () => {
  it("coincide con la fórmula cerrada", () => {
    // (1,959964 + 0,841621) · √2 · 0,3 / √28 ≈ 0,2246
    expect(mdeForContinuous(0.3, 28)!).toBeCloseTo(0.2246, 3);
    expect(mdeForContinuous(0, 28)).toBeNull();
  });
});

describe("computePower", () => {
  it("rate: MDE, días necesarios y sin advertencias cuando alcanza", () => {
    const n = sampleSizePerVariant(0.05, 0.1)!; // ≈ 31 234 por grupo
    const r = computePower("rate", { baseline: 0.05, daily_volume_per_arm: 1200, planned_days: 28 }, 10, 2);
    expect(r.days_needed).toBe(Math.ceil(n / 1200));
    expect(r.mde_pct).not.toBeNull();
    expect(r.mde_pct!).toBeLessThan(10);
    expect(r.warnings).toEqual([]);
  });

  it("rate: advierte cuando el MDE supera el efecto esperado y faltan días", () => {
    const r = computePower("rate", { baseline: 0.05, daily_volume_per_arm: 200, planned_days: 14 }, 10, 2);
    expect(r.mde_pct!).toBeGreaterThan(10);
    expect(r.warnings.some((w) => w.startsWith("La prueba no alcanza a ver el efecto que espera"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("necesita"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("más de 8 semanas"))).toBe(true);
  });

  it("target_mde_pct manda sobre el esperado", () => {
    const a = computePower("rate", { baseline: 0.05, daily_volume_per_arm: 1000, planned_days: 28, target_mde_pct: 20 }, 10, 2);
    const n = sampleSizePerVariant(0.05, 0.2)!;
    expect(a.days_needed).toBe(Math.ceil(n / 1000));
  });

  it("con tres grupos corrige alfa y necesita más días", () => {
    const base = { baseline: 0.05, daily_volume_per_arm: 1000, planned_days: 28 };
    expect(computePower("rate", base, 10, 3).days_needed!).toBeGreaterThan(computePower("rate", base, 10, 2).days_needed!);
  });

  it("sum: asume cv de 30 % y lo avisa", () => {
    const r = computePower("sum", { baseline: 500, planned_days: 28 }, 10, 2);
    expect(r.mde_pct).toBe(22.5);
    expect(r.days_needed).toBe(142);
    expect(r.warnings.some((w) => w.startsWith("Se asumió una variación diaria de 30 %"))).toBe(true);
    expect(r.warnings.some((w) => w.includes("MDE es 22,5 % y la hipótesis espera 10 %"))).toBe(true);
  });

  it("cost_per con cv dado", () => {
    const r = computePower("cost_per", { baseline: 20000, daily_cv: 0.1, planned_days: 21 }, 15, 2);
    expect(r.mde_pct).toBe(8.6);
    expect(r.days_needed).toBe(7);
    expect(r.warnings).toEqual([]);
  });

  it("presupuesto: días que alcanza y advertencia", () => {
    const r = computePower("sum", { baseline: 100, daily_cv: 0.2, planned_days: 28, daily_spend_cop: 1_000_000 }, 20, 2, 20_000_000);
    expect(r.budget_days).toBe(20);
    expect(r.warnings.some((w) => w.startsWith("El presupuesto no alcanza"))).toBe(true);
  });

  it("datos inválidos: nulls y advertencias", () => {
    const r = computePower("rate", { baseline: 1.5, planned_days: 0 }, 10, 2);
    expect(r.mde_pct).toBeNull();
    expect(r.days_needed).toBeNull();
    expect(r.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
