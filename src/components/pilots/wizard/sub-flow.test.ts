import { describe, expect, it } from "vitest";
import { PILOT_STEPS } from "@/domain/pilots/flow";
import { DEFAULT_DECISION_RULES } from "@/domain/pilots/types";
import { pilotReviewRows, type ReviewInput } from "./review-summary";
import { firstScreenWithError, overallProgress, PILOT_SUB_SCREENS, subScreenKeys, suggestPilotTitle } from "./sub-flow";

describe("pantallas de cada paso", () => {
  it("cada paso del asistente tiene al menos una pantalla y claves únicas", () => {
    for (const s of PILOT_STEPS) {
      const keys = subScreenKeys(s.key);
      expect(keys.length).toBeGreaterThan(0);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("ningún campo queda en dos pantallas del mismo paso", () => {
    for (const s of PILOT_STEPS) {
      const fields = PILOT_SUB_SCREENS[s.key].flatMap((x) => [...x.fields]);
      expect(new Set(fields).size).toBe(fields.length);
    }
  });

  it("cubre todos los campos del problema y del diseño", () => {
    const problem = PILOT_SUB_SCREENS.problema.flatMap((x) => [...x.fields]).sort();
    expect(problem).toEqual(
      ["hypothesis_change", "hypothesis_expected_pct", "hypothesis_metric", "hypothesis_reason", "hypothesis_scope", "problem", "problem_evidence", "title"].sort(),
    );
    const design = PILOT_SUB_SCREENS.prueba.flatMap((x) => [...x.fields]).sort();
    expect(design).toEqual(
      ["arms", "design_config", "design_justification", "media", "planned_budget_cop", "planned_end", "planned_start", "test_type", "variable_id"].sort(),
    );
  });
});

describe("firstScreenWithError", () => {
  it("lleva a la primera pantalla con error, en orden", () => {
    expect(firstScreenWithError("problema", ["title", "problem"])).toBe(0);
    expect(firstScreenWithError("problema", ["title"])).toBe(3);
    expect(firstScreenWithError("prueba", ["planned_end", "arms.1.name"])).toBe(2);
    expect(firstScreenWithError("prueba", ["design_config.pre_start"])).toBe(2);
  });

  it("devuelve null si el error no cae en ninguna pantalla", () => {
    expect(firstScreenWithError("reglas", [])).toBeNull();
    expect(firstScreenWithError("problema", ["expected_updated_at"])).toBeNull();
  });
});

describe("overallProgress", () => {
  it("reparte cada paso entre sus pantallas", () => {
    expect(overallProgress(0, 5, 0, 5)).toBe(0);
    expect(overallProgress(1, 5, 0, 5)).toBeCloseTo(0.2);
    expect(overallProgress(1, 5, 2, 4)).toBeCloseTo(0.3);
    expect(overallProgress(4, 5, 1, 2)).toBeCloseTo(0.9);
  });

  it("no se sale de 0–1", () => {
    expect(overallProgress(9, 5, 0, 1)).toBe(1);
    expect(overallProgress(0, 0, 0, 1)).toBe(0);
  });
});

describe("suggestPilotTitle", () => {
  it("arma el nombre con el cambio y el ámbito", () => {
    expect(suggestPilotTitle("videos UGC", "CTWA Pospago")).toBe("Videos UGC en CTWA Pospago");
    expect(suggestPilotTitle("videos UGC", " ")).toBe("Videos UGC");
    expect(suggestPilotTitle("", "CTWA")).toBe("");
    expect(suggestPilotTitle(null, null)).toBe("");
  });

  it("no pasa de 160 caracteres", () => {
    expect(suggestPilotTitle("x".repeat(200), "y").length).toBeLessThanOrEqual(160);
  });
});

describe("pilotReviewRows", () => {
  const base: ReviewInput = {
    pilot: {
      title: "Video UGC en CTWA",
      problem: "El CPA subió 35 %",
      hypothesis_change: "videos UGC",
      hypothesis_scope: "CTWA Pospago",
      hypothesis_metric: "la tasa de venta",
      hypothesis_expected_pct: 10,
      hypothesis_reason: "la gente confía más",
      variable_id: "v1",
      test_type: "ab_creative",
      planned_start: "2026-10-05",
      planned_end: "2026-10-31",
      planned_budget_cop: 12_000_000,
      primary_metric_id: "m1",
      decision_rules: null,
    },
    arms: [
      { name: "Control", is_control: true },
      { name: "UGC", is_control: false },
    ],
    media: [{ media_name: "Meta CTWA" }],
    guardrails: [{ metric_id: "m2" }],
    checklist: [],
  };
  const names = { variables: { v1: "Formato de la pieza" }, metrics: { m1: "Tasa de venta", m2: "Costo por conversación" } };

  it("resume lo guardado y marca lo que falta", () => {
    const rows = pilotReviewRows(base, names, DEFAULT_DECISION_RULES);
    const by = Object.fromEntries(rows.map((r) => [r.label, r]));
    expect(by["Hipótesis"].filled).toBe(true);
    expect(by["Qué se prueba"].value).toContain("Formato de la pieza");
    expect(by["Grupos"].value).toContain("control: Control");
    expect(by["Métricas"].value).toContain("Costo por conversación");
    expect(by["Reglas de decisión"].filled).toBe(false);
    expect(by["Eventos a verificar"]).toMatchObject({ filled: false, step: "medicion" });
  });

  it("con reglas guardadas las dice en palabras", () => {
    const rows = pilotReviewRows({ ...base, pilot: { ...base.pilot, decision_rules: DEFAULT_DECISION_RULES } }, names, DEFAULT_DECISION_RULES);
    expect(rows.find((r) => r.label === "Reglas de decisión")?.value).toMatch(/^Escalar si/);
  });
});
