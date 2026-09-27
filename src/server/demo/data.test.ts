import { describe, expect, it } from "vitest";
import { daysBetween, isMonday } from "@/domain/dates";
import { buildDemoPlan, DEMO_EXPERIMENTS, DEMO_METRICS, DEMO_WEEKS } from "./data";

const day = (ts: string) => ts.slice(0, 10);

describe.each(["2026-09-26", "2027-03-01", "2026-12-31"])("buildDemoPlan(%s)", (today) => {
  const plan = buildDemoPlan(today);
  const freezes = plan.calendar.filter((c) => c.type === "freeze");

  it("el programa ya arrancó, termina en el futuro y los horizontes lo cubren sin huecos", () => {
    expect(isMonday(plan.program.start_date)).toBe(true);
    expect(plan.program.start_date < today).toBe(true);
    expect(plan.program.end_date > today).toBe(true);
    const [h1, h2] = plan.program.horizons;
    expect(h1.start_date).toBe(plan.program.start_date);
    expect(daysBetween(h1.end_date, h2.start_date)).toBe(1);
    expect(h2.end_date).toBe(plan.program.end_date);
  });

  it("los valores semanales terminan en la última semana completa", () => {
    expect(plan.weeksFrom).toBe(plan.program.start_date);
    const lastWeek = daysBetween(plan.weeksFrom, today) - (DEMO_WEEKS - 1) * 7;
    expect(lastWeek).toBeGreaterThanOrEqual(7);
    expect(lastWeek).toBeLessThan(14);
    for (const m of DEMO_METRICS) expect(m.weekly).toHaveLength(DEMO_WEEKS);
  });

  it("calendario: picos, congelamientos y punto de decisión en el futuro", () => {
    for (const ev of plan.calendar) {
      expect(ev.start_date > today).toBe(true);
      expect(ev.end_date >= ev.start_date).toBe(true);
      expect(ev.end_date <= plan.program.end_date).toBe(true);
    }
    const decision = plan.calendar.find((c) => c.type === "decision")!;
    expect(freezes.every((f) => f.end_date < decision.start_date)).toBe(true);
  });

  it("decididos en el pasado reciente; el que está en prueba empezó hace 10 días y termina antes del congelamiento", () => {
    const { e1, e2, e3 } = plan.experimentDates;
    for (const e of [e1, e3]) {
      const decidedAgo = daysBetween(day(e.timestamps.decided_at!), today);
      expect(decidedAgo).toBeGreaterThanOrEqual(7);
      expect(decidedAgo).toBeLessThanOrEqual(21);
      expect(e.actual_end! < day(e.timestamps.decided_at!)).toBe(true);
      expect(e.actual_start >= plan.program.start_date).toBe(true);
    }
    const byKey = Object.fromEntries(DEMO_EXPERIMENTS.map((e) => [e.key, e]));
    expect(daysBetween(e1.actual_start, e1.actual_end!)).toBeGreaterThanOrEqual(byKey.e1.min_duration_days);
    expect(daysBetween(e3.actual_start, e3.actual_end!)).toBeGreaterThanOrEqual(byKey.e3.min_duration_days);

    expect(daysBetween(e2.actual_start, today)).toBe(10);
    expect(e2.actual_end).toBeNull();
    expect(daysBetween(e2.planned_start, e2.planned_end)).toBeGreaterThanOrEqual(byKey.e2.min_duration_days);
    expect(freezes.every((f) => e2.planned_end < f.start_date)).toBe(true);
    // Ningún inicio real cae dentro de un congelamiento (la transición a En prueba lo bloquearía).
    for (const e of [e1, e2, e3]) expect(freezes.some((f) => e.actual_start >= f.start_date && e.actual_start <= f.end_date)).toBe(false);
  });
});

describe("ejercicios del ejemplo", () => {
  it("todos tienen hipótesis completa (la base la exige desde En diseño)", () => {
    for (const e of DEMO_EXPERIMENTS) {
      expect(e.hypothesis_if.trim()).not.toBe("");
      expect(e.hypothesis_then.trim()).not.toBe("");
      expect(e.hypothesis_because.trim()).not.toBe("");
    }
  });
});
