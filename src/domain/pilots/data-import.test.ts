import { describe, expect, it } from "vitest";
import { allowedRange, baseMetricsFor, buildTemplate, coherenceIssues, parseCsv, readImport, type ImportContext } from "./data-import";
import type { PilotMetricDef } from "./types";

const m = (id: string, name: string, over: Partial<PilotMetricDef> = {}): PilotMetricDef => ({
  id,
  name,
  unit: "count",
  direction: "up",
  scope: "business",
  calc: "sum",
  numerator_id: null,
  denominator_id: null,
  is_spend: false,
  ...over,
});

const spend = m("spend", "Inversión", { unit: "cop", is_spend: true, direction: "down" });
const sales = m("sales", "Ventas");
const convs = m("convs", "Conversaciones iniciadas", { scope: "platform" });
const rate = m("rate", "Tasa de venta por conversación", { calc: "rate", numerator_id: "sales", denominator_id: "convs", unit: "percent" });
const cpa = m("cpa", "Costo por venta (CPA)", { calc: "cost_per", numerator_id: "spend", denominator_id: "sales", unit: "cop", direction: "down" });
const catalog = [spend, sales, convs, rate, cpa];

const ctx: ImportContext = {
  arms: [
    { id: "c", name: "Estático", is_control: true, split_pct: 50, cities: [] },
    { id: "v", name: "Video UGC", is_control: false, split_pct: 50, cities: [] },
  ],
  metrics: [sales, convs, spend],
  byCity: false,
  granularity: "day",
  minDate: "2026-10-05",
  maxDate: "2026-11-01",
};

describe("métricas que se cargan", () => {
  it("descompone tasas y costos en sus métricas de suma, y siempre pide inversión", () => {
    expect(baseMetricsFor(["rate", "cpa"], catalog).map((x) => x.id)).toEqual(["sales", "convs", "spend"]);
    expect(baseMetricsFor(["sales"], catalog).map((x) => x.id)).toEqual(["sales", "spend"]);
  });
});

describe("CSV", () => {
  it("parte celdas con comillas y punto y coma", () => {
    expect(parseCsv('a;"b;c";"d ""e"""\r\n1;2;3\n\n')).toEqual([
      ["a", "b;c", 'd "e"'],
      ["1", "2", "3"],
    ]);
    expect(parseCsv("x,y\n1,2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });

  it("la plantilla trae una fila por grupo y una columna por métrica", () => {
    const csv = buildTemplate(ctx);
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual(["Fecha", "Grupo", "Ventas", "Conversaciones iniciadas", "Inversión"]);
    expect(rows.slice(1).map((r) => r[1])).toEqual(["Estático", "Video UGC"]);
  });

  it("la plantilla geo va por ciudad", () => {
    const geo = { ...ctx, byCity: true, arms: [{ id: "t", name: "Prueba", is_control: false, split_pct: null, cities: ["Cali", "Pereira"] }] };
    const rows = parseCsv(buildTemplate(geo));
    expect(rows[0]).toContain("Ciudad");
    expect(rows.slice(1).map((r) => r[2])).toEqual(["Cali", "Pereira"]);
  });

  it("lee valores con formato colombiano y reporta errores por línea", () => {
    const text = [
      "Fecha;Grupo;Ventas;Conversaciones iniciadas;Inversión;Notas",
      "05/10/2026;estático;80;1.000;1.250.000,5;x",
      "2026-10-05;Video UGC;100;1000;;",
      "2026-10-04;Video UGC;1;1;1;",
      "2026-10-06;Otro;1;1;1;",
      "2026-10-06;Video UGC;-3;abc;1;",
      "2026-10-05;Video UGC;7;;;",
    ].join("\n");
    const r = readImport(text, ctx);
    expect(r.ignoredColumns).toEqual(["Notas"]);
    expect(r.values.filter((v) => v.arm_id === "c")).toEqual([
      { arm_id: "c", metric_id: "sales", unit_label: "", period_start: "2026-10-05", value: 80 },
      { arm_id: "c", metric_id: "convs", unit_label: "", period_start: "2026-10-05", value: 1000 },
      { arm_id: "c", metric_id: "spend", unit_label: "", period_start: "2026-10-05", value: 1250000.5 },
    ]);
    expect(r.issues.map((i) => i.line)).toEqual([4, 5, 6, 6, 7]);
    expect(r.issues[0].message).toMatch(/fuera del piloto/);
    expect(r.issues[1].message).toMatch(/no existe/);
    expect(r.issues[4].message).toMatch(/repetido/);
  });

  it("pide las columnas mínimas", () => {
    expect(readImport("Ventas\n1", ctx).issues.map((i) => i.message)).toEqual(["Falta la columna Fecha.", "Falta la columna Grupo."]);
    expect(readImport("", ctx).issues[0].message).toMatch(/vacío/);
  });

  it("semanas en lunes y ciudades del grupo", () => {
    const geo: ImportContext = {
      ...ctx,
      byCity: true,
      granularity: "week",
      arms: [{ id: "t", name: "Prueba", is_control: false, split_pct: null, cities: ["Cali"] }],
    };
    const r = readImport("Semana;Grupo;Ciudad;Ventas\n2026-10-05;Prueba;cali;5\n2026-10-07;Prueba;Cali;5\n2026-10-12;Prueba;Bogotá;5", geo);
    expect(r.values).toEqual([{ arm_id: "t", metric_id: "sales", unit_label: "Cali", period_start: "2026-10-05", value: 5 }]);
    expect(r.issues.map((i) => i.message)).toEqual(["La semana 2026-10-07 no empieza en lunes.", "La ciudad «Bogotá» no está en el grupo Prueba."]);
  });

  it("avisa si el numerador de una tasa supera la base", () => {
    const issues = coherenceIssues(
      [
        { arm_id: "c", metric_id: "sales", unit_label: "", period_start: "2026-10-05", value: 50 },
        { arm_id: "c", metric_id: "convs", unit_label: "", period_start: "2026-10-05", value: 10 },
      ],
      [rate],
      catalog,
    );
    expect(issues[0]).toMatch(/Ventas supera a Conversaciones iniciadas/);
  });
});

describe("rango de carga", () => {
  it("usa las fechas reales y un periodo previo cuando la prueba lo pide", () => {
    const base = { plannedStart: "2026-10-05", plannedEnd: "2026-11-01", actualStart: null, actualEnd: null, preStart: null, needsPre: false };
    expect(allowedRange(base)).toEqual({ min: "2026-10-05", max: "2026-11-01" });
    expect(allowedRange({ ...base, needsPre: true })).toEqual({ min: "2026-09-07", max: "2026-11-01" });
    expect(allowedRange({ ...base, needsPre: true, preStart: "2026-08-01", actualStart: "2026-10-07" })).toEqual({ min: "2026-08-01", max: "2026-11-01" });
    expect(allowedRange({ ...base, plannedEnd: null })).toBeNull();
  });
});
