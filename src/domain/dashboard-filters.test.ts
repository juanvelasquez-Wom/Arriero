import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_OWNER,
  applyResultSlicers,
  buildQuery,
  filterExperiments,
  globalFiltersQuery,
  hasActiveFilters,
  overlapsRange,
  parseDashboardFilters,
  parseResultSlicers,
  type FilterableExperiment,
} from "./dashboard-filters";

const base: FilterableExperiment = {
  line_id: "l1",
  status: "idea",
  owner_id: null,
  planned_start: null,
  planned_end: null,
  actual_start: null,
  actual_end: null,
};

const exps = [
  { ...base, id: "a", line_id: "l1", status: "in_test" as const, owner_id: "u1", planned_start: "2026-10-01", planned_end: "2026-10-20" },
  { ...base, id: "b", line_id: "l2", status: "decided" as const, owner_id: "u2", actual_start: "2026-08-01", actual_end: "2026-08-30" },
  { ...base, id: "c", line_id: "l1", status: "idea" as const },
];

const horizons = [
  { id: "h1", start_date: "2026-08-01", end_date: "2026-09-30" },
  { id: "h2", start_date: "2026-10-01", end_date: "2027-01-24" },
];

describe("parseDashboardFilters", () => {
  it("lee los parámetros y descarta estados desconocidos", () => {
    expect(parseDashboardFilters({ linea: "l1", estado: "nope", responsable: ["u1", "u2"], horizonte: " " })).toEqual({
      linea: "l1",
      estado: null,
      responsable: "u1",
      horizonte: null,
    });
    expect(parseDashboardFilters({ estado: "in_test" }).estado).toBe("in_test");
  });

  it("detecta si hay filtros activos", () => {
    expect(hasActiveFilters(parseDashboardFilters({}))).toBe(false);
    expect(hasActiveFilters(parseDashboardFilters({ linea: "x" }))).toBe(true);
  });
});

describe("filterExperiments", () => {
  const f = (p: Record<string, string>) => parseDashboardFilters(p);
  const ids = (list: { id: string }[]) => list.map((e) => e.id);

  it("sin filtros devuelve todo", () => {
    expect(ids(filterExperiments(exps, f({}), horizons))).toEqual(["a", "b", "c"]);
  });

  it("filtra por línea, estado y responsable", () => {
    expect(ids(filterExperiments(exps, f({ linea: "l1" }), horizons))).toEqual(["a", "c"]);
    expect(ids(filterExperiments(exps, f({ estado: "decided" }), horizons))).toEqual(["b"]);
    expect(ids(filterExperiments(exps, f({ responsable: "u1" }), horizons))).toEqual(["a"]);
    expect(ids(filterExperiments(exps, f({ responsable: UNASSIGNED_OWNER }), horizons))).toEqual(["c"]);
  });

  it("horizonte: se cruza el rango planeado o el real; sin fechas queda fuera", () => {
    expect(ids(filterExperiments(exps, f({ horizonte: "h1" }), horizons))).toEqual(["b"]);
    expect(ids(filterExperiments(exps, f({ horizonte: "h2" }), horizons))).toEqual(["a"]);
  });

  it("un horizonte inexistente se ignora", () => {
    expect(ids(filterExperiments(exps, f({ horizonte: "zzz" }), horizons))).toEqual(["a", "b", "c"]);
  });
});

describe("overlapsRange", () => {
  it("usa el inicio si falta el fin", () => {
    expect(overlapsRange({ ...base, planned_start: "2026-09-30" }, "2026-09-30", "2026-10-10")).toBe(true);
    expect(overlapsRange({ ...base, planned_start: "2026-09-29" }, "2026-09-30", "2026-10-10")).toBe(false);
  });

  it("un ejercicio en curso sin fin real se extiende hasta hoy", () => {
    const running = { ...base, status: "in_test" as const, actual_start: "2026-09-01" };
    expect(overlapsRange(running, "2026-10-01", "2026-10-31", "2026-10-05")).toBe(true);
    expect(overlapsRange(running, "2026-10-01", "2026-10-31")).toBe(false);
  });
});

describe("applyResultSlicers", () => {
  const rows = [
    { id: "1", stage_name: "Activación", test_type: "ab" as const },
    { id: "2", stage_name: "Conversión", test_type: "geo" as const },
    { id: "3", stage_name: null, test_type: null },
  ];
  it("corta por etapa y tipo de prueba", () => {
    expect(applyResultSlicers(rows, parseResultSlicers({ etapa: "Activación" })).map((r) => r.id)).toEqual(["1"]);
    expect(applyResultSlicers(rows, parseResultSlicers({ tipo: "geo" })).map((r) => r.id)).toEqual(["2"]);
    expect(applyResultSlicers(rows, parseResultSlicers({ tipo: "otro" })).map((r) => r.id)).toEqual(["1", "2", "3"]);
  });
});

describe("buildQuery", () => {
  it("omite vacíos y respeta las claves pedidas", () => {
    expect(buildQuery({ a: "1", b: null, c: "" })).toBe("?a=1");
    expect(buildQuery({ a: "1", zoom: "mes" }, ["zoom"])).toBe("?zoom=mes");
    expect(buildQuery({})).toBe("");
  });

  it("los enlaces entre tableros conservan solo los filtros globales", () => {
    expect(globalFiltersQuery(parseDashboardFilters({ linea: "l1", estado: "in_test", zoom: "mes" }))).toBe(
      "?linea=l1&estado=in_test",
    );
  });
});
