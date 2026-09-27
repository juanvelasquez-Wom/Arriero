import { describe, expect, it } from "vitest";
import { actualSpan, crossingsByPilot, parseCalendarScale, pilotCrossings, scheduleRange, spanText, type ScheduleDates } from "./schedule";
import type { PilotSummary } from "./types";

const summary = (over: Partial<PilotSummary>): PilotSummary => ({
  id: "a",
  title: "A",
  status: "in_test",
  test_type: "ab_platform",
  start: "2026-10-05",
  end: "2026-11-01",
  media: [
    { media_id: "meta", media_name: "Meta Ads", account: null, campaign: "CTWA Pospago", audience: null, destination: null, cities: [] },
  ],
  arm_cities: [],
  ...over,
});

const dates = (over: Partial<ScheduleDates>): ScheduleDates => ({
  status: "in_test",
  planned_start: "2026-10-01",
  planned_end: "2026-10-31",
  actual_start: null,
  actual_end: null,
  ...over,
});

describe("cruces del calendario", () => {
  it("devuelve cada par una sola vez, con la frase del cruce", () => {
    const list = [
      summary({ id: "a", title: "A" }),
      summary({ id: "b", title: "B", start: "2026-10-12", end: "2026-10-30" }),
      summary({ id: "c", title: "C", media: [] }),
    ];
    const crossings = pilotCrossings(list);
    expect(crossings).toHaveLength(1);
    expect(crossings[0]).toMatchObject({ aId: "a", bId: "b", from: "2026-10-12", to: "2026-10-30", text: "Comparten campaña (CTWA Pospago)" });
    const byPilot = crossingsByPilot(crossings);
    expect(byPilot.get("a")?.[0].otherTitle).toBe("B");
    expect(byPilot.get("b")?.[0].otherTitle).toBe("A");
    expect(byPilot.has("c")).toBe(false);
  });

  it("los pilotos cerrados no se cruzan", () => {
    expect(pilotCrossings([summary({ id: "a", status: "decided" }), summary({ id: "b" })])).toEqual([]);
  });
});

describe("barras del calendario", () => {
  it("un piloto en prueba sin fin real llega hasta hoy", () => {
    expect(actualSpan(dates({ actual_start: "2026-10-03" }), "2026-10-20")).toEqual({ start: "2026-10-03", end: "2026-10-20", ongoing: true });
    expect(actualSpan(dates({ actual_start: "2026-10-03", actual_end: "2026-10-10" }), "2026-10-20")).toEqual({
      start: "2026-10-03",
      end: "2026-10-10",
      ongoing: false,
    });
    expect(actualSpan(dates({}), "2026-10-20")).toBeNull();
  });

  it("el rango incluye hoy y deja margen", () => {
    const r = scheduleRange([dates({})], "2026-09-27");
    expect(r.start).toBe("2026-09-20");
    expect(r.end >= "2026-11-07").toBe(true);
    expect(scheduleRange([], "2026-09-27").start).toBe("2026-09-20");
  });

  it("lee la escala y arma el texto del rango", () => {
    expect(parseCalendarScale("mes")).toBe("mes");
    expect(parseCalendarScale(undefined)).toBe("semana");
    expect(spanText("2026-10-12", "2026-10-30", (d) => d.slice(8))).toBe("del 12 al 30");
    expect(spanText("2026-10-12", "2026-10-12", (d) => d.slice(8))).toBe("el 12");
  });
});
