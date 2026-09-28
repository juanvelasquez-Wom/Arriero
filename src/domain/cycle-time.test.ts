import { describe, expect, it } from "vitest";
import {
  bottleneckText,
  cycleTimeByOwner,
  daysInStages,
  daysToLearning,
  formatDays,
  median,
  summarizeCycleTime,
  toTransition,
  type CycleEvent,
  type CycleExperiment,
} from "./cycle-time";

const day = (d: number) => new Date(Date.UTC(2026, 8, 1 + d)).toISOString();
const move = (id: string, d: number, from: string, to: string): CycleEvent => ({
  entity_id: id,
  created_at: day(d),
  action: "status_changed",
  payload: { from, to },
});
const verdict = (id: string, d: number): CycleEvent => ({ entity_id: id, created_at: day(d), action: "verdict", payload: {} });

const expA: CycleExperiment = { id: "a", owner_id: "u1", created_at: day(0), status: "decided", decided_at: day(30) };
const eventsA = [
  move("a", 2, "idea", "prioritized"),
  move("a", 5, "prioritized", "in_design"),
  move("a", 10, "in_design", "in_test"),
  move("a", 24, "in_test", "in_reading"),
  verdict("a", 30),
];

describe("median", () => {
  it("impar, par y vacío", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe("toTransition", () => {
  it("lee status_changed y verdict; ignora lo demás", () => {
    expect(toTransition(move("a", 1, "idea", "prioritized"))).toMatchObject({ from: "idea", to: "prioritized" });
    expect(toTransition(verdict("a", 1))).toMatchObject({ from: "in_reading", to: "decided" });
    expect(toTransition({ entity_id: "a", created_at: day(1), action: "comment", payload: {} })).toBeNull();
    expect(toTransition({ entity_id: "a", created_at: day(1), action: "status_changed", payload: null })).toBeNull();
  });
});

describe("daysInStages", () => {
  it("días por estado en el camino normal", () => {
    expect(daysInStages(expA, eventsA)).toEqual({ idea: 2, prioritized: 3, in_design: 5, in_test: 14, in_reading: 6 });
  });
  it("si vuelve atrás, suma el tiempo del estado", () => {
    const exp: CycleExperiment = { id: "b", owner_id: null, created_at: day(0), status: "in_design", decided_at: null };
    const evs = [move("b", 2, "idea", "prioritized"), move("b", 4, "prioritized", "idea"), move("b", 7, "idea", "prioritized"), move("b", 8, "prioritized", "in_design")];
    // Idea: 2 + 3 = 5; Priorizado: 2 + 1 = 3; En diseño no ha salido.
    expect(daysInStages(exp, evs)).toEqual({ idea: 5, prioritized: 3 });
  });
  it("descartar no cuenta como avance", () => {
    const exp: CycleExperiment = { id: "c", owner_id: null, created_at: day(0), status: "discarded", decided_at: null };
    expect(daysInStages(exp, [move("c", 4, "idea", "discarded")])).toEqual({});
  });
});

describe("daysToLearning", () => {
  it("usa decided_at y, si falta, la bitácora", () => {
    expect(daysToLearning(expA, eventsA)).toBe(30);
    expect(daysToLearning({ ...expA, decided_at: null }, eventsA)).toBe(30);
    expect(daysToLearning({ ...expA, decided_at: null }, [])).toBeNull();
  });
});

describe("summarizeCycleTime", () => {
  it("medianas, tiempo hasta el aprendizaje y cuello de botella", () => {
    const expB: CycleExperiment = { id: "b", owner_id: "u2", created_at: day(0), status: "in_reading", decided_at: null };
    const eventsB = [move("b", 4, "idea", "prioritized"), move("b", 5, "prioritized", "in_design"), move("b", 7, "in_design", "in_test"), move("b", 17, "in_test", "in_reading")];
    const s = summarizeCycleTime([expA, expB], [...eventsA, ...eventsB]);
    const idea = s.stages.find((x) => x.stage === "idea")!;
    expect(idea.medianDays).toBe(3);
    expect(idea.count).toBe(2);
    expect(s.stages.find((x) => x.stage === "in_test")!.medianDays).toBe(12);
    expect(s.timeToLearning).toEqual({ medianDays: 30, count: 1 });
    expect(s.bottleneck?.stage).toBe("in_test");
    expect(bottleneckText(s)).toBe("El cuello de botella está en En prueba: 12 días en mediana");

    const byOwner = cycleTimeByOwner([expA, expB], [...eventsA, ...eventsB]);
    expect(byOwner.get("u2")?.bottleneck?.medianDays).toBe(10);
    expect(byOwner.get("u1")?.timeToLearning.count).toBe(1);
  });
  it("tramos de menos de un día no son cuello de botella", () => {
    const exp: CycleExperiment = { id: "z", owner_id: null, created_at: day(0), status: "prioritized", decided_at: null };
    const quick = [{ entity_id: "z", created_at: new Date(Date.UTC(2026, 8, 1, 2)).toISOString(), action: "status_changed", payload: { from: "idea", to: "prioritized" } }];
    expect(summarizeCycleTime([exp], quick).bottleneck).toBeNull();
  });
  it("sin datos no hay cuello de botella", () => {
    const s = summarizeCycleTime([], []);
    expect(s.bottleneck).toBeNull();
    expect(bottleneckText(s)).toBeNull();
  });
});

describe("formatDays", () => {
  it("formato es-CO", () => {
    expect(formatDays(1)).toBe("1 día");
    expect(formatDays(12)).toBe("12 días");
    expect(formatDays(0.5)).toBe("0,5 días");
    expect(formatDays(null)).toBe("—");
  });
});
