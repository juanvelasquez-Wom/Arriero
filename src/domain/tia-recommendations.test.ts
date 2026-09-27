import { describe, expect, it } from "vitest";
import { readExperiment } from "./results";
import {
  applyDesignSuggestion,
  applyHypothesisOption,
  applyIceSuggestion,
  applyImprovedHypothesis,
  designDraftSchema,
  HYPOTHESES_TASK,
  matchLineIds,
  normalizeControl,
  parseDesign,
  parseHypotheses,
  parseIce,
  parseReading,
  parseReview,
  READING_TASK,
  readingForTia,
  toIceScore,
  toTestType,
} from "./tia-recommendations";

const base = {
  title: "",
  hypothesis_if: "",
  hypothesis_then: "",
  hypothesis_because: "",
  test_type: null,
  min_duration_days: null,
  decision_rule: "",
  impact: null as number | null,
  confidence: null as number | null,
  ease: null as number | null,
  variants: [
    { name: "Control", is_control: true, description: "" },
    { name: "Variante A", is_control: false, description: "" },
  ],
};

describe("parseHypotheses", () => {
  it("lee tres opciones y descarta las incompletas", () => {
    const reply = `Aquí van:\n\`\`\`json\n[
      {"title":"Recordatorio","si":"enviamos WhatsApp","entonces":"sube la recarga","porque":"se acuerdan","why":"barato","based_on":"evidencia"},
      {"title":"Sin SI","si":"","entonces":"x","porque":"y"},
      {"si":"a","entonces":"b","porque":"c"},
      {"si":"d","entonces":"e","porque":"f"},
      {"si":"g","entonces":"h","porque":"i"}
    ]\n\`\`\``;
    const r = parseHypotheses(reply)!;
    expect(r).toHaveLength(3);
    expect(r[0]).toMatchObject({ title: "Recordatorio", si: "enviamos WhatsApp", based_on: "evidencia" });
    expect(r[1]).toMatchObject({ title: "", why: "", based_on: "" });
  });
  it("acepta {options: [...]} y devuelve null si no hay nada útil", () => {
    expect(parseHypotheses('{"options":[{"si":"a","entonces":"b","porque":"c"}]}')).toHaveLength(1);
    expect(parseHypotheses("no sé")).toBeNull();
    expect(parseHypotheses('[{"title":"x"}]')).toBeNull();
  });
});

describe("parseReview", () => {
  it("normaliza el veredicto y exige la versión mejorada", () => {
    const r = parseReview('{"verdict":"Mejorable","issues":["falta segmento", 3, ""],"improved":{"si":"a","entonces":"b","porque":"c"}}');
    expect(r).toEqual({ verdict: "mejorable", issues: ["falta segmento"], improved: { si: "a", entonces: "b", porque: "c" } });
    expect(parseReview('{"verdict":"excelente","issues":[],"improved":{"si":"a","entonces":"b","porque":"c"}}')).toBeNull();
    expect(parseReview('{"verdict":"clara","issues":[]}')).toBeNull();
  });
});

describe("parseIce", () => {
  it("lleva los puntajes a enteros de 1 a 10", () => {
    const r = parseIce('{"impact": 12, "confidence": "4,6", "ease": 0, "why": {"impact": "brecha grande"}}')!;
    expect(r).toMatchObject({ impact: 10, confidence: 5, ease: 1 });
    expect(r.why.impact).toBe("brecha grande");
    expect(r.why.ease).toBe("");
    expect(parseIce('{"impact": "mucho", "confidence": 5, "ease": 5}')).toBeNull();
    expect(toIceScore(7.4)).toBe(7);
    expect(toIceScore(null)).toBeNull();
  });
});

describe("parseDesign", () => {
  it("normaliza tipo, duración y un solo control", () => {
    const d = parseDesign(
      '{"test_type":"A/B","min_duration_days":"21","decision_rule":"Gana si sube 10 %","variants":[{"name":"Actual","is_control":true},{"name":"Nuevo","description":"cuotas","is_control":true},{"name":""}],"risks":["Black Friday"]}',
    )!;
    expect(d.test_type).toBe("ab");
    expect(d.min_duration_days).toBe(21);
    expect(d.variants).toEqual([
      { name: "Actual", description: "", is_control: true },
      { name: "Nuevo", description: "cuotas", is_control: false },
    ]);
    expect(d.risks).toEqual(["Black Friday"]);
    expect(parseDesign('{"nada": true}')).toBeNull();
    expect(parseDesign('{"min_duration_days": 14}')).toMatchObject({ test_type: null, min_duration_days: 14, variants: [], risks: [] });
  });
  it("entiende los tipos de prueba en español", () => {
    expect(toTestType("before_after")).toBe("before_after");
    expect(toTestType("Antes y después")).toBe("before_after");
    expect(toTestType("Geográfica por ciudad")).toBe("geo");
    expect(toTestType("ab")).toBe("ab");
    expect(toTestType("otra cosa")).toBeNull();
    expect(toTestType(3)).toBeNull();
  });
  it("normalizeControl deja exactamente uno", () => {
    expect(normalizeControl([{ is_control: false }, { is_control: false }]).map((v) => v.is_control)).toEqual([true, false]);
  });
});

describe("parseReading", () => {
  it("exige el resumen y limpia listas", () => {
    const r = parseReading('{"summary":"Subió.","points":["a",""],"learning_draft":"Aprendimos…","applies_to":"Pospago"}')!;
    expect(r).toEqual({ summary: "Subió.", points: ["a"], learning_draft: "Aprendimos…", applies_to: ["Pospago"], suggested_hypothesis: "" });
    expect(parseReading('{"points":[]}')).toBeNull();
  });
});

describe("aplicar propuestas", () => {
  const option = { title: "Título Tía", si: "a", entonces: "b", porque: "c" };
  it("Usar esta: llena la hipótesis y el título solo si está vacío", () => {
    expect(applyHypothesisOption(base, option)).toMatchObject({ title: "Título Tía", hypothesis_if: "a", hypothesis_then: "b", hypothesis_because: "c" });
    expect(applyHypothesisOption({ ...base, title: "Mío" }, option).title).toBe("Mío");
    expect(applyImprovedHypothesis({ ...base, title: "Mío" }, { si: "x", entonces: "y", porque: "z" })).toMatchObject({
      title: "Mío",
      hypothesis_if: "x",
    });
  });
  it("ICE: pone los tres valores", () => {
    expect(applyIceSuggestion(base, { impact: 8, confidence: 4, ease: 6 })).toMatchObject({ impact: 8, confidence: 4, ease: 6 });
  });
  it("Diseño: solo llena lo vacío y las variantes por defecto", () => {
    const s = {
      test_type: "geo" as const,
      min_duration_days: 28,
      decision_rule: "Regla Tía",
      variants: [
        { name: "Bogotá", description: "sin cambio", is_control: true },
        { name: "Medellín", description: "con cuotas", is_control: false },
      ],
      risks: [],
    };
    const r = applyDesignSuggestion({ ...base, variants: base.variants.map((v, i) => ({ ...v, id: `v${i}` })) }, s);
    expect(r.filled).toEqual(["test_type", "min_duration_days", "decision_rule", "variants"]);
    expect(r.values.variants[0]).toEqual({ id: "v0", name: "Bogotá", description: "sin cambio", is_control: true });

    const mine = { ...base, test_type: "ab" as const, decision_rule: "Mía", variants: [{ name: "Actual", is_control: true, description: "x" }] };
    const r2 = applyDesignSuggestion(mine, s);
    expect(r2.filled).toEqual(["min_duration_days"]);
    expect(r2.values.test_type).toBe("ab");
    expect(r2.values.decision_rule).toBe("Mía");
    expect(r2.values.variants).toBe(mine.variants);
  });
  it("matchLineIds: nombres a ids sin la línea propia", () => {
    const lines = [
      { id: "1", name: "Pospago" },
      { id: "2", name: "Recargas y paquetes" },
    ];
    expect(matchLineIds(["recargas  y PAQUETES", "Pospago", "Inventada"], lines, "1")).toEqual(["2"]);
  });
});

describe("borradores y tareas", () => {
  it("valida el borrador del diseño con valores por defecto", () => {
    const d = designDraftSchema.parse({
      problem_id: "00000000-0000-4000-8000-000000000001",
      metric_id: "00000000-0000-4000-8000-000000000002",
    });
    expect(d).toMatchObject({ control: "ours", test_type: null, variants: [], control_metrics: [] });
    expect(designDraftSchema.safeParse({ problem_id: "x", metric_id: "y" }).success).toBe(false);
  });
  it("las tareas piden JSON y no decidir por el equipo", () => {
    expect(HYPOTHESES_TASK).toMatch(/SOLO con JSON/);
    expect(READING_TASK).toMatch(/NO diga cuál veredicto/);
  });
  it("readingForTia resume la lectura en porcentajes", () => {
    const reading = readExperiment({
      variants: [
        { id: "c", name: "Control", is_control: true, sample: 1000, conversions: 50, metric_value: null, description: "", notes: null },
        { id: "a", name: "Cuotas", is_control: false, sample: 1000, conversions: 65, metric_value: null, description: "", notes: null },
      ],
      testType: "ab",
      metric: null,
    });
    const r = readingForTia(reading);
    expect(r.variante_resumen).toBe("Cuotas");
    expect(r.variantes[1]).toMatchObject({ tasa_pct: 6.5, diferencia_vs_control_pct: 30 });
    expect(r.variantes[1].probabilidad_de_ganar_pct).toBeGreaterThan(80);
    expect(r.variantes[1].falta_para_valor).toMatch(/volumen/);
    expect(r.variantes[0].falta_para_valor).toBeNull();
  });
});
