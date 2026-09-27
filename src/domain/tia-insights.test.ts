import { describe, expect, it } from "vitest";
import {
  cleanGossip,
  committeeContext,
  COMMITTEE_BRIEF_MAX,
  gossipDedupeKey,
  gossipFacts,
  GOSSIP_MAX_CHARS,
  GOSSIP_PREFIX,
  hasGossipMaterial,
  isoWeekKey,
  matchByName,
  metricExplainData,
  parseOpportunities,
  parseProblemPrefill,
  problemDraftHref,
  PROBLEM_PREFILL_LIMITS,
  type OpportunityRefs,
} from "./tia-insights";

const L1 = "11111111-1111-4111-8111-111111111111";
const L2 = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const S2 = "44444444-4444-4444-8444-444444444444";
const M1 = "55555555-5555-4555-8555-555555555555";

const refs: OpportunityRefs = {
  lines: [
    { id: L1, name: "Pospago" },
    { id: L2, name: "Recargas y paquetes" },
  ],
  stages: [
    { id: S1, name: "Conversión", line_id: L1 },
    { id: S2, name: "Conversión", line_id: L2 },
  ],
  metrics: [{ id: M1, name: "Altas digitales", line_id: L1 }],
};

describe("matchByName", () => {
  it("calza sin tildes ni mayúsculas y evita ambigüedades", () => {
    expect(matchByName(refs.lines, "POSPAGO")?.id).toBe(L1);
    expect(matchByName(refs.lines, "recargas")?.id).toBe(L2);
    expect(matchByName(refs.stages, "conversion")).toBeNull(); // dos etapas iguales
    expect(matchByName(refs.lines, "Hogar")).toBeNull();
    expect(matchByName(refs.lines, 42)).toBeNull();
  });
});

describe("parseOpportunities", () => {
  it("lee el JSON, traduce nombres a ids del programa y limita a 3", () => {
    const text = `Mire:\n\`\`\`json\n${JSON.stringify([
      { title: "Checkout pierde gente", why: "Porque sí", evidence: "Semana 14-sep: 120 vs 150", line: "Pospago", stage: "conversion", metric: "altas digitales", impact: "alto", id: "inventado" },
      { title: "Recargas", why: "", evidence: "", line: "Recargas y paquetes", stage: "Conversión", impact: "low" },
      { title: "Sin línea", why: "x", evidence: "y", line: "Hogar", stage: "Adquisición" },
      { title: "Cuarta", line: "Pospago" },
    ])}\n\`\`\``;
    const out = parseOpportunities(text, refs)!;
    expect(out).toHaveLength(3);
    expect(out[0]).toMatchObject({ lineId: L1, stageId: S1, metricId: M1, impact: "high" });
    expect(out[1]).toMatchObject({ lineId: L2, stageId: S2, metricId: null, impact: "low" });
    expect(out[2]).toMatchObject({ lineId: null, stageId: null, impact: "medium" });
  });

  it("deduce la línea desde la métrica y acepta el objeto envoltorio", () => {
    const out = parseOpportunities(JSON.stringify({ oportunidades: [{ title: "Altas flojas", metric: "Altas digitales" }] }), refs)!;
    expect(out[0]).toMatchObject({ lineId: L1, metricId: M1 });
  });

  it("devuelve null si no hay JSON y descarta ítems sin título", () => {
    expect(parseOpportunities("No vi nada, mijo", refs)).toBeNull();
    expect(parseOpportunities('[{"why":"x"}, 3, null]', refs)).toEqual([]);
  });
});

describe("borrador de problema desde la URL", () => {
  it("arma el enlace y lo lee de vuelta con topes", () => {
    const href = problemDraftHref("p1", {
      title: "Checkout pierde gente",
      why: "Vale la pena",
      evidence: "x".repeat(3000),
      impact: "high",
      lineId: L1,
      lineName: "Pospago",
      stageId: S1,
      stageName: "Conversión",
      metricId: M1,
      metricName: "Altas",
    });
    expect(href.startsWith("/programas/p1/problemas/nuevo?")).toBe(true);
    const sp = Object.fromEntries(new URLSearchParams(href.split("?")[1]));
    expect(sp.metrica).toBe(M1);
    const pre = parseProblemPrefill(sp, refs);
    expect(pre).toMatchObject({ title: "Checkout pierde gente", lineId: L1, stageId: S1 });
    expect(pre.evidence!.length).toBeLessThanOrEqual(PROBLEM_PREFILL_LIMITS.evidence);
  });

  it("descarta ids ajenos y etapas de otra línea", () => {
    expect(parseProblemPrefill({ linea: "otro", etapa: "otra" }, refs)).toEqual({ title: null, evidence: null, lineId: null, stageId: null });
    expect(parseProblemPrefill({ linea: L2, etapa: S1 }, refs)).toMatchObject({ lineId: L2, stageId: null });
    expect(parseProblemPrefill({ etapa: S2 }, refs)).toMatchObject({ lineId: L2, stageId: S2 });
    expect(parseProblemPrefill({ titulo: ["  a\u0000b  ", "c"] }, refs).title).toBe("ab");
  });
});

describe("metricExplainData", () => {
  it("compara las últimas semanas con el camino esperado y filtra ejercicios y calendario del periodo", () => {
    const values = Array.from({ length: 10 }, (_, i) => ({
      week_start: `2026-${i < 5 ? "07" : "08"}-${String(6 + (i % 5) * 7).padStart(2, "0")}`,
      value: 100 + i,
    }));
    const data = metricExplainData({
      today: "2026-09-10",
      programStart: "2026-07-01",
      metricId: M1,
      metric: { name: "Altas", type: "north_star", unit: "altas", direction: "up", baseline: 100, line_name: "Pospago", targets: [{ horizon_id: "h1", target: 200 }] },
      horizons: [{ id: "h1", name: "H1", start_date: "2026-07-01", end_date: "2026-12-31" }],
      values,
      experiments: [
        { title: "Viejo", status: "decided", metric_id: M1, metric_name: "Altas", planned_start: null, planned_end: null, actual_start: "2026-01-01", actual_end: "2026-02-01", decided_at: null, verdict: "loser", decision: "kill" },
        { title: "Corriendo", status: "in_test", metric_id: M1, metric_name: "Altas", planned_start: null, planned_end: null, actual_start: "2026-08-20", actual_end: null, decided_at: null, verdict: null, decision: null },
        { title: "Idea", status: "idea", metric_id: M1, metric_name: "Altas", planned_start: null, planned_end: null, actual_start: null, actual_end: null, decided_at: null, verdict: null, decision: null },
      ],
      calendar: [
        { type: "peak", name: "Día sin IVA", start_date: "2026-08-15", end_date: "2026-08-15" },
        { type: "freeze", name: "Diciembre", start_date: "2026-12-01", end_date: "2026-12-31" },
      ],
    });
    expect(data.semanas).toHaveLength(8);
    expect(data.semanas[0].esperado).not.toBeNull();
    expect(data.frente_a_la_meta.meta).toBe(200);
    expect(data.ejercicios_de_la_linea_en_el_periodo.map((e) => e.titulo)).toEqual(["Corriendo"]);
    expect(data.calendario_del_periodo.map((c) => c.nombre)).toEqual(["Día sin IVA"]);
  });
});

describe("comité", () => {
  it("recorta el resumen", () => {
    expect(committeeContext("a".repeat(COMMITTEE_BRIEF_MAX + 50)).resumen_ejecutivo.length).toBe(COMMITTEE_BRIEF_MAX);
  });
});

describe("chismecito", () => {
  it("calcula la semana ISO y la clave de deduplicación", () => {
    expect(isoWeekKey("2026-09-28")).toBe("2026-W40");
    expect(isoWeekKey("2027-01-01")).toBe("2026-W53");
    expect(isoWeekKey("2026-01-01")).toBe("2026-W01");
    expect(gossipDedupeKey("p1", "2026-09-28")).toBe("gossip:p1:2026-W40");
  });

  it("limpia el texto, le pone el saludo y respeta el tope", () => {
    expect(cleanGossip('"**Le tengo un chismecito:** las altas subieron."')).toBe("Le tengo un chismecito: las altas subieron.");
    expect(cleanGossip("Las altas bajaron 12 %.")).toBe(`${GOSSIP_PREFIX} las altas bajaron 12 %.`);
    const long = cleanGossip(`Le tengo un chismecito: ${"palabra ".repeat(80)}`)!;
    expect(long.length).toBeLessThanOrEqual(GOSSIP_MAX_CHARS);
    expect(long.endsWith("…")).toBe(true);
    expect(cleanGossip("   ")).toBeNull();
  });

  it("arma el resumen semanal y detecta si hay qué contar", () => {
    const facts = gossipFacts({
      today: "2026-09-28",
      program: { name: "Demo", start_date: "2026-08-01" },
      horizons: [],
      northStars: [],
      experiments: [
        { title: "Nuevo", line_name: "Pospago", status: "in_test", status_changed_at: "2026-09-25T10:00:00Z" },
        { title: "Quieta", line_name: "Pospago", status: "idea", status_changed_at: "2026-07-01T10:00:00Z" },
      ],
      calendar: [{ type: "freeze", name: "Black Friday", start_date: "2026-10-10", end_date: "2026-10-20" }],
    });
    expect(facts.ejercicios_que_cambiaron_de_estado_esta_semana.map((e) => e.titulo)).toEqual(["Nuevo"]);
    expect(facts.ideas_quietas.cuantas).toBe(1);
    expect(facts.congelamientos_que_se_vienen).toHaveLength(1);
    expect(hasGossipMaterial(facts)).toBe(true);
    const empty = gossipFacts({ today: "2026-09-28", program: { name: "X", start_date: null }, horizons: [], northStars: [], experiments: [], calendar: [] });
    expect(hasGossipMaterial(empty)).toBe(false);
  });
});
