import { describe, expect, it } from "vitest";
import { GENERIC_TEMPLATE, horizonProblems, TELCO_TEMPLATES } from "./growth-templates";
import {
  addMonths,
  blackFriday,
  CUSTOM_LINE_KEY,
  planQuickStart,
  quickDecisionDate,
  quickFunnel,
  quickProgramEnd,
  quickTreeMetrics,
  typicalTelcoCalendar,
  type QuickStartInput,
} from "./quick-start";

const base: QuickStartInput = {
  name: "Plan digital",
  templateKey: "pospago",
  startDate: "2026-10-01",
  months: 6,
  useTelcoCalendar: true,
};

describe("fechas", () => {
  it("addMonths recorta al último día del mes", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(addMonths("2026-10-01", 6)).toBe("2027-04-01");
    expect(addMonths("2026-12-15", 12)).toBe("2027-12-15");
  });
  it("el programa termina el día anterior a cumplir los meses", () => {
    expect(quickProgramEnd("2026-10-01", 6)).toBe("2027-03-31");
    expect(quickProgramEnd("2026-09-26", 3)).toBe("2026-12-25");
  });
  it("Black Friday es el viernes después del cuarto jueves de noviembre", () => {
    expect(blackFriday(2026)).toBe("2026-11-27");
    expect(blackFriday(2027)).toBe("2027-11-26");
    expect(blackFriday(2024)).toBe("2024-11-29");
  });
});

describe("typicalTelcoCalendar", () => {
  it("incluye picos, congelamientos sugeridos y un punto de decisión en enero", () => {
    const events = typicalTelcoCalendar("2026-10-01", "2027-03-31");
    expect(events).toContainEqual({ type: "peak", name: "Black Friday–Cyber 2026", start_date: "2026-11-27", end_date: "2026-11-30" });
    expect(events).toContainEqual({ type: "freeze", name: "Congelamiento Black Friday–Cyber 2026", start_date: "2026-11-23", end_date: "2026-12-06" });
    expect(events).toContainEqual({ type: "peak", name: "Temporada decembrina 2026", start_date: "2026-12-14", end_date: "2026-12-31" });
    expect(events).toContainEqual({ type: "freeze", name: "Congelamiento Temporada decembrina 2026", start_date: "2026-12-10", end_date: "2027-01-06" });
    expect(events.filter((e) => e.type === "decision")).toEqual([
      { type: "decision", name: "Punto de decisión", start_date: "2027-01-18", end_date: "2027-01-18" },
    ]);
  });
  it("deja todo dentro del programa y recorta lo que se sale", () => {
    const start = "2026-12-01";
    const end = "2027-02-28";
    const events = typicalTelcoCalendar(start, end);
    for (const e of events) {
      expect(e.start_date >= start && e.end_date <= end).toBe(true);
      expect(e.end_date >= e.start_date).toBe(true);
    }
    expect(events.find((e) => e.name === "Congelamiento Black Friday–Cyber 2026")).toMatchObject({ start_date: "2026-12-01", end_date: "2026-12-06" });
    expect(events.some((e) => e.name === "Black Friday–Cyber 2026")).toBe(false);
  });
  it("un programa de 12 meses trae los picos de cada año que toca", () => {
    const events = typicalTelcoCalendar("2026-09-26", quickProgramEnd("2026-09-26", 12));
    expect(events.filter((e) => e.type === "peak").map((e) => e.name)).toEqual(["Black Friday–Cyber 2026", "Temporada decembrina 2026"]);
    const long = typicalTelcoCalendar("2027-02-01", "2028-01-31");
    expect(long.filter((e) => e.type === "peak").map((e) => e.name)).toEqual(["Black Friday–Cyber 2027", "Temporada decembrina 2027"]);
    expect(long.filter((e) => e.type === "decision")).toHaveLength(1);
  });
  it("un periodo sin picos solo trae el punto de decisión", () => {
    const events = typicalTelcoCalendar("2027-02-01", "2027-07-31");
    expect(events.map((e) => e.type)).toEqual(["decision"]);
  });
});

describe("quickDecisionDate", () => {
  it("usa el 18 de enero si queda con margen", () => {
    expect(quickDecisionDate("2026-10-01", "2027-03-31")).toBe("2027-01-18");
  });
  it("si enero queda muy al borde o fuera, usa la mitad del programa", () => {
    expect(quickDecisionDate("2026-10-01", "2026-12-31")).toBe("2026-11-15");
    expect(quickDecisionDate("2027-01-01", "2027-06-30")).toBe("2027-04-01");
    expect(quickDecisionDate("2027-02-01", "2028-01-31")).toBe("2027-08-02");
  });
  it("programas muy cortos no llevan punto de decisión", () => {
    expect(quickDecisionDate("2026-10-01", "2026-11-10")).toBeNull();
  });
});

describe("métricas y embudo", () => {
  it("crea la primera de cada rama y las que mide el embudo", () => {
    const pospago = TELCO_TEMPLATES.find((t) => t.key === "pospago")!;
    const tree = quickTreeMetrics(pospago);
    expect(tree.map((m) => m.name)).toEqual([
      "Conversaciones iniciadas en WhatsApp",
      "Visitas a la página de planes",
      "Tasa de conversación a venta",
      "Costo por lead",
      "Checkouts abandonados recuperados",
    ]);
    expect(tree.map((m) => m.sort_order)).toEqual([0, 1, 2, 3, 4]);
    expect(new Set(tree.map((m) => m.branch)).size).toBe(4);
  });
  it("cada etapa de las plantillas telco queda con una métrica creada", () => {
    for (const t of TELCO_TEMPLATES) {
      const tree = quickTreeMetrics(t);
      const funnel = quickFunnel(t, tree);
      expect(funnel).toHaveLength(4);
      for (const s of funnel) {
        expect(s.description.length).toBeGreaterThan(0);
        expect(tree.some((m) => m.name === s.metricName)).toBe(true);
      }
    }
  });
  it("la plantilla genérica deja las etapas sin métrica", () => {
    const tree = quickTreeMetrics(GENERIC_TEMPLATE);
    expect(tree).toHaveLength(4);
    expect(quickFunnel(GENERIC_TEMPLATE, tree).every((s) => s.metricName === null)).toBe(true);
  });
});

describe("planQuickStart", () => {
  it("arma un plan coherente con plantilla telco", () => {
    const r = planQuickStart(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { plan } = r;
    expect(plan.program).toEqual({ name: "Plan digital", start_date: "2026-10-01", end_date: "2027-03-31" });
    expect(plan.line).toEqual({ name: "Pospago", templateKey: "pospago" });
    expect(plan.northStar.name).toBe("Altas digitales semanales");
    expect(plan.efficiency.name).toBe("Costo por alta");
    expect(plan.horizons).toEqual([
      { name: "H1", start_date: "2026-10-01", end_date: "2027-01-18" },
      { name: "H2", start_date: "2027-01-19", end_date: "2027-03-31" },
    ]);
    expect(horizonProblems({ start: plan.program.start_date, end: plan.program.end_date }, plan.horizons)).toEqual([]);
  });
  it("sin calendario típico: sin eventos y un solo horizonte", () => {
    const r = planQuickStart({ ...base, useTelcoCalendar: false });
    expect(r.ok && r.plan.events).toEqual([]);
    expect(r.ok && r.plan.horizons).toEqual([{ name: "H1", start_date: "2026-10-01", end_date: "2027-03-31" }]);
  });
  it("otra línea exige nombre propio", () => {
    expect(planQuickStart({ ...base, templateKey: CUSTOM_LINE_KEY, lineName: " " }).ok).toBe(false);
    const r = planQuickStart({ ...base, templateKey: CUSTOM_LINE_KEY, lineName: "  Hogar fibra " });
    expect(r.ok && r.plan.line).toEqual({ name: "Hogar fibra", templateKey: CUSTOM_LINE_KEY });
  });
  it("rechaza plantillas y duraciones desconocidas", () => {
    expect(planQuickStart({ ...base, templateKey: "satelital" }).ok).toBe(false);
    expect(planQuickStart({ ...base, months: 9 as never }).ok).toBe(false);
  });
  it("los horizontes siempre caben en el programa", () => {
    for (const months of [3, 6, 12] as const) {
      for (const startDate of ["2026-01-15", "2026-06-01", "2026-09-26", "2026-11-30", "2026-12-31"]) {
        const r = planQuickStart({ ...base, months, startDate });
        expect(r.ok).toBe(true);
        if (!r.ok) continue;
        expect(horizonProblems({ start: r.plan.program.start_date, end: r.plan.program.end_date }, r.plan.horizons)).toEqual([]);
        expect(r.plan.events.filter((e) => e.type === "decision").length).toBeLessThanOrEqual(1);
      }
    }
  });
});
