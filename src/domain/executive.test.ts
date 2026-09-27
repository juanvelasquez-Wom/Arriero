import { describe, expect, it } from "vitest";
import { buildExecutiveBrief, executiveBriefToText, periodChange, type ExecutiveProgramInput } from "./executive";
import type { Report } from "./report";
import { reportPeriod } from "./report";
import type { NorthStarStatus, ProgramRollup } from "./rollup";

const today = "2026-09-26";
const period = reportPeriod("mes", today);

function ns(over: Partial<NorthStarStatus> & { status: NorthStarStatus["evaluation"]["status"] }): NorthStarStatus {
  return {
    line_id: "l1",
    line_name: "Pospago",
    metric_id: "m1",
    metric_name: "Altas digitales",
    unit: "altas",
    direction: "up",
    values: [
      { week_start: "2026-08-10", value: 400 },
      { week_start: "2026-09-21", value: 440 },
    ],
    ...over,
    evaluation: {
      status: over.status,
      latest: 440,
      latestWeek: "2026-09-21",
      expected: 430,
      gap: 0.02,
      target: 520,
      horizonName: "H1",
      ...(over.evaluation ?? {}),
    } as NorthStarStatus["evaluation"],
  };
}

function program(id: string, isDemo: boolean, northStars: NorthStarStatus[], extra: Partial<ProgramRollup> = {}): ProgramRollup {
  return {
    id,
    name: isDemo ? "Demo" : `Programa ${id}`,
    is_demo: isDemo,
    northStars,
    statusCounts: { on_track: 0, behind: 0, off_track: 0, no_data: 0 },
    health: "no_data",
    running: 0,
    closedThisMonth: 0,
    winnersThisMonth: 0,
    closedTotal: 0,
    winnersTotal: 0,
    hitRate: null,
    value: null,
    pendingDecisions: [],
    ...extra,
  } as ProgramRollup;
}

const emptyReport = (over: Partial<Report> = {}): Report => ({
  period,
  moved: [],
  launched: [],
  closed: [],
  winners: 0,
  value: null,
  nextUp: [],
  risks: [],
  ...over,
});

describe("periodChange", () => {
  it("mide el cambio a favor según la dirección de la métrica", () => {
    expect(periodChange(ns({ status: "on_track" }), period.start).change).toBeCloseTo(0.1);
    expect(periodChange(ns({ status: "on_track", direction: "down" }), period.start).change).toBeCloseTo(-0.1);
  });
});

describe("buildExecutiveBrief", () => {
  const input = (): ExecutiveProgramInput[] => [
    {
      rollup: program("a", false, [
        ns({ status: "on_track" }),
        ns({ status: "off_track", metric_id: "m2", metric_name: "Costo por alta", direction: "down" }),
      ], {
        pendingDecisions: [{ id: "e9", title: "Precio en cuotas", line_name: "Equipos", since: "2026-09-20T10:00:00Z" }],
      }),
      report: emptyReport({
        closed: [
          { id: "e1", title: "Recordatorio WhatsApp", line_name: "Recargas", verdict: "winner", decision: "scale", decided: "2026-09-14", diff: 0.278, monthlyValue: 12_000_000, learning: "El momento importa más que el descuento.", rationale: null },
        ],
        value: { monthly: 12_000_000, counted: 1, missingUnitValue: 0 },
        nextUp: [{ id: "e5", title: "Video testimonial", line_name: "Pospago", status: "prioritized", final_score: 7.3 }],
        risks: [{ kind: "freeze", title: "Se viene un congelamiento: Black Friday", detail: "Del 23 nov…" }],
      }),
      running: [{ id: "e3", title: "Creativos verticales", line_name: "Pospago", status: "in_test", actual_start: "2026-09-16" }],
    },
    { rollup: program("demo", true, [ns({ status: "on_track" })]), report: emptyReport(), running: [] },
  ];

  it("excluye el ejemplo cuando hay programas reales y responde cada pregunta", () => {
    const b = buildExecutiveBrief(input(), period, today);
    expect(b.includesDemo).toBe(false);
    expect(b.programs.map((p) => p.id)).toEqual(["a"]);
    const by = Object.fromEntries(b.sections.map((s) => [s.key, s.items]));
    expect(by.growing).toHaveLength(1);
    expect(by.falling[0].href).toBe("/programas/a/problemas/nuevo?metrica=m2");
    expect(by.running[0].detail).toBe("En prueba hace 10 días.");
    expect(by.results[0].text).toMatch(/^Ganador: Recordatorio WhatsApp/);
    expect(by.learned[0].text).toMatch(/momento importa/);
    expect(by.value[0].text).toMatch(/al mes/);
    expect(by.decide[0].action).toBe("Decidir");
    expect(by.next[0].text).toMatch(/Video testimonial/);
    expect(by.risks[0].text).toMatch(/congelamiento/);
  });

  it("si los programas reales aún no tienen datos, cuenta con el ejemplo", () => {
    const empty: ExecutiveProgramInput = { rollup: program("b", false, []), report: emptyReport(), running: [] };
    const b = buildExecutiveBrief([empty, input()[1]], period, today);
    expect(b.programs.map((p) => p.id)).toEqual(["demo"]);
    expect(b.includesDemo).toBe(true);
  });

  it("usa el ejemplo si no hay programas reales y arma el texto para el comité", () => {
    const b = buildExecutiveBrief([input()[1]], period, today);
    expect(b.includesDemo).toBe(true);
    const text = executiveBriefToText(b, { title: "Vamos bien", text: "Todo en la meta." });
    expect(text).toMatch(/^Resumen ejecutivo de growth/);
    expect(text).toMatch(/¿Qué está creciendo\?\n- Altas digitales/);
    expect(text).toMatch(/¿Qué hay que decidir\?\n- Nada esperando decisión\./);
  });
});
