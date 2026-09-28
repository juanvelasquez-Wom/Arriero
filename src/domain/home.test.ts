import { describe, expect, it } from "vitest";
import {
  bulkSummary,
  daysRunning,
  describeScoreFilters,
  homeItems,
  isReadyToRead,
  matchesBacklogView,
  parseBacklogView,
  suggestsProblem,
  type HomeExperiment,
} from "./home";

const TODAY = "2026-09-26";

function exp(over: Partial<HomeExperiment> = {}): HomeExperiment {
  return {
    id: "e1",
    title: "Checkout en un paso",
    line_name: "Pospago",
    owner_id: null,
    status: "idea",
    actual_start: null,
    min_duration_days: null,
    status_changed_at: "2026-09-20T10:00:00Z",
    ...over,
  };
}

describe("daysRunning e isReadyToRead", () => {
  it("cuenta desde el inicio real y un inicio futuro vale 0", () => {
    expect(daysRunning("2026-09-12", TODAY)).toBe(14);
    expect(daysRunning("2026-10-01", TODAY)).toBe(0);
    expect(daysRunning(null, TODAY)).toBeNull();
  });
  it("listo cuando en prueba cumple la duración mínima", () => {
    expect(isReadyToRead({ status: "in_test", actual_start: "2026-09-12", min_duration_days: 14 }, TODAY)).toBe(true);
    expect(isReadyToRead({ status: "in_test", actual_start: "2026-09-13", min_duration_days: 14 }, TODAY)).toBe(false);
    expect(isReadyToRead({ status: "in_test", actual_start: "2026-10-12", min_duration_days: 0 }, TODAY)).toBe(true);
    expect(isReadyToRead({ status: "in_reading", actual_start: "2026-09-01", min_duration_days: 14 }, TODAY)).toBe(false);
    expect(isReadyToRead({ status: "in_test", actual_start: "2026-09-01", min_duration_days: null }, TODAY)).toBe(false);
  });
});

describe("homeItems", () => {
  const base = { today: TODAY, userId: "u1", northStars: [], experiments: [], calendar: [] };

  it("vacío si no hay nada", () => {
    expect(homeItems(base)).toEqual([]);
  });

  it("ordena por urgencia y corta en 5", () => {
    const items = homeItems({
      ...base,
      northStars: [
        { metricId: "m1", lineId: "l1", lineName: "Pospago", metricName: "Altas", status: "off_track", gap: -0.22 },
        { metricId: "m2", lineId: "l2", lineName: "Recargas", metricName: "Recargas", status: "behind", gap: -0.1 },
      ],
      experiments: [
        exp({ id: "r", status: "in_test", actual_start: "2026-09-01", min_duration_days: 14, owner_id: "u1" }),
        exp({ id: "m", status: "in_design", owner_id: "u1" }),
        exp({ id: "o", status: "in_design", owner_id: "u2" }),
        exp({ id: "s1", status: "idea", status_changed_at: "2026-08-01T00:00:00Z" }),
        exp({ id: "s2", status: "idea", status_changed_at: "2026-08-20T00:00:00Z" }),
      ],
      calendar: [
        { id: "c1", type: "freeze", name: "Black Friday", start_date: "2026-10-05", end_date: "2026-10-10" },
        { id: "c2", type: "peak", name: "Lejos", start_date: "2026-12-01", end_date: "2026-12-10" },
        { id: "c3", type: "decision", name: "Decisión", start_date: "2026-09-28", end_date: "2026-09-28" },
      ],
    });
    expect(items.map((i) => i.kind)).toEqual(["north_star_off_track", "ready_to_read", "calendar_soon", "assigned", "stale_ideas"]);
    expect(items[0].detail).toContain("22 %");
    expect(items[0].path).toBe("/lineas/l1?tab=norte");
    expect(items[0].secondary).toEqual({ label: "Convertir en oportunidad de mejora", path: "/problemas/nuevo?metrica=m1" });
    expect(items[1].path).toBe("/ejercicios/r");
    expect(items[2].title).toContain("en 9 días");
    // El listo para leer no se repite como asignado.
    expect(items.filter((i) => i.key === "mine-r")).toHaveLength(0);
    expect(items[4].title).toBe("2 ideas llevan más de 30 días quietas");

    const limited = homeItems({ ...base, limit: 2, northStars: [
      { metricId: "ma", lineId: "a", lineName: "A", metricName: "x", status: "off_track", gap: null },
      { metricId: "mb", lineId: "b", lineName: "B", metricName: "y", status: "off_track", gap: null },
      { metricId: "mc", lineId: "c", lineName: "C", metricName: "z", status: "off_track", gap: null },
    ] });
    expect(limited.map((i) => i.key)).toEqual(["ns-a", "ns-b"]);
  });

  it("evento que empieza hoy", () => {
    const items = homeItems({ ...base, calendar: [{ id: "c", type: "peak", name: "Día sin IVA", start_date: TODAY, end_date: TODAY }] });
    expect(items[0].title).toBe("Pico: Día sin IVA empieza hoy");
  });
});

describe("vistas del backlog", () => {
  const e = (over: Partial<Parameters<typeof matchesBacklogView>[0]>) => ({
    status: "idea" as const,
    actual_start: null,
    min_duration_days: null,
    impact: null,
    planned_start: null,
    ...over,
  });

  it("parsea solo vistas conocidas", () => {
    expect(parseBacklogView("semana")).toBe("semana");
    expect(parseBacklogView(["corriendo"])).toBe("corriendo");
    expect(parseBacklogView("otra")).toBeNull();
    expect(parseBacklogView(undefined)).toBeNull();
  });

  it("sin vista: solo abiertos; todos: todo", () => {
    expect(matchesBacklogView(e({ status: "decided" }), null, TODAY)).toBe(false);
    expect(matchesBacklogView(e({ status: "idea" }), null, TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "discarded" }), "todos", TODAY)).toBe(true);
  });

  it("esta semana: listos para leer, en lectura y lanzamientos próximos", () => {
    expect(matchesBacklogView(e({ status: "in_test", actual_start: "2026-09-01", min_duration_days: 7 }), "semana", TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "in_test", actual_start: "2026-09-25", min_duration_days: 7 }), "semana", TODAY)).toBe(false);
    expect(matchesBacklogView(e({ status: "in_reading" }), "semana", TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "in_design", planned_start: "2026-10-03" }), "semana", TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "prioritized", planned_start: "2026-10-04" }), "semana", TODAY)).toBe(false);
  });

  it("diseñar, alto impacto y corriendo", () => {
    expect(matchesBacklogView(e({ status: "prioritized" }), "disenar", TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "in_design" }), "disenar", TODAY)).toBe(false);
    expect(matchesBacklogView(e({ status: "idea", impact: 8 }), "alto-impacto", TODAY)).toBe(true);
    expect(matchesBacklogView(e({ status: "idea", impact: 6 }), "alto-impacto", TODAY)).toBe(false);
    expect(matchesBacklogView(e({ status: "in_test", impact: 9 }), "alto-impacto", TODAY)).toBe(false);
    expect(matchesBacklogView(e({ status: "in_reading" }), "corriendo", TODAY)).toBe(true);
  });
});

describe("describeScoreFilters", () => {
  it("en palabras simples", () => {
    expect(describeScoreFilters({ fits_calendar: true, control: "shared" })).toBe("+1 calendario · −1 control");
    expect(describeScoreFilters({ fits_calendar: false, control: "external" })).toBe("−3 control");
    expect(describeScoreFilters({ fits_calendar: false, control: "ours" })).toBe("Sin ajustes");
    expect(
      describeScoreFilters({ fits_calendar: true, control: "ours" }, { calendar_bonus: 2, shared_penalty: 1, external_penalty: 3 }),
    ).toBe("+2 calendario");
  });
});

describe("aprendizajes por probar", () => {
  const lines = [
    { id: "pos", name: "Pospago" },
    { id: "rec", name: "Recargas" },
    { id: "eq", name: "Equipos" },
  ];
  it("sugiere probar en otras líneas lo que aún no tiene ejercicio derivado", () => {
    const items = homeItems({
      today: TODAY,
      userId: "u1",
      northStars: [],
      calendar: [],
      lines,
      learnings: [{ id: "L1", lineId: "rec", lineName: "Recargas", appliesToLineIds: ["rec", "pos", "eq", "borrada"] }],
      experiments: [exp({ id: "d", line_id: "eq", derived_from_learning_id: "L1" })],
    });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: "learning_to_try",
      title: "Recargas aprendió algo que aplica a Pospago. ¿Lo prueba?",
      path: "/ejercicios/nuevo?aprendizaje=L1&linea=pos",
    });
  });
});

describe("suggestsProblem", () => {
  it("solo atrás o muy atrás", () => {
    expect(suggestsProblem("off_track")).toBe(true);
    expect(suggestsProblem("behind")).toBe(true);
    expect(suggestsProblem("on_track")).toBe(false);
    expect(suggestsProblem("no_data")).toBe(false);
  });
});

describe("bulkSummary", () => {
  it("todo bien, mixto y todo mal", () => {
    expect(bulkSummary("prioritized", [{ id: "a", ok: true }, { id: "b", ok: true }])).toEqual({ tone: "success", text: "¡Eso! 2 priorizados" });
    expect(
      bulkSummary("prioritized", [
        { id: "a", ok: true },
        { id: "b", ok: true },
        { id: "c", ok: true },
        { id: "d", ok: true },
        { id: "e", ok: false, error: "Falta ICE." },
      ]),
    ).toEqual({ tone: "mixed", text: "¡Eso! 4 priorizados · 1 no se pudo: falta ICE" });
    expect(bulkSummary("discarded", [{ id: "a", ok: false, error: "No." }, { id: "b", ok: false, error: "No." }]).tone).toBe("error");
    expect(bulkSummary("assigned", [{ id: "a", ok: true }]).text).toBe("¡Eso! 1 asignado");
  });
});
