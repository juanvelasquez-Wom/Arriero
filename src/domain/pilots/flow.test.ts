import { describe, expect, it } from "vitest";
import {
  availableActions,
  canEditDesign,
  canLoadData,
  effectivePilotRole,
  hypothesisSentence,
  missingForReview,
  needsDesignJustification,
  nextPilotStep,
  parsePilotStep,
  type ReadinessInput,
} from "./flow";

const approver = { userId: "a", role: "approver" as const };
const creator = { userId: "c", role: "creator" as const };
const reader = { userId: "r", role: "reader" as const };

const complete: ReadinessInput = {
  problem: "CPA alto en CTWA",
  hypothesis_change: "video UGC",
  hypothesis_scope: "CTWA pospago",
  hypothesis_metric: "la tasa de venta",
  hypothesis_expected_pct: 10,
  hypothesis_reason: "genera confianza",
  variable: { recommended_test_type: "ab_creative", alternative_test_type: null },
  test_type: "ab_creative",
  design_justification: null,
  primary_metric_id: "m",
  guardrails: 1,
  has_power: true,
  has_rules: true,
  planned_start: "2026-10-05",
  planned_end: "2026-11-01",
  media: 1,
  arms: [
    { is_control: true, cities: [] },
    { is_control: false, cities: [] },
  ],
};

describe("roles y acciones", () => {
  it("el admin global cuenta como aprobador", () => {
    expect(effectivePilotRole(true, null)).toBe("approver");
    expect(effectivePilotRole(false, "reader")).toBe("reader");
  });

  it("el lector no tiene acciones", () => {
    expect(availableActions(reader, { status: "draft", created_by: "r" })).toEqual([]);
    expect(canEditDesign(reader, "draft")).toBe(false);
    expect(canLoadData(reader, "in_test")).toBe(false);
  });

  it("el creador envía su borrador, puede cancelarlo y borrarlo", () => {
    expect(availableActions(creator, { status: "draft", created_by: "c" })).toEqual(["submit", "cancel", "delete"]);
    expect(availableActions(creator, { status: "draft", created_by: "otro" })).toEqual(["submit"]);
  });

  it("solo el aprobador aprueba, devuelve y decide", () => {
    expect(availableActions(creator, { status: "in_review", created_by: "c" })).toEqual([]);
    expect(availableActions(approver, { status: "in_review", created_by: "c" })).toEqual(["approve", "return", "cancel", "delete"]);
    expect(availableActions(approver, { status: "in_reading", created_by: "c" })).toContain("decide");
    expect(availableActions(creator, { status: "in_reading", created_by: "c" })).not.toContain("decide");
  });

  it("el diseño solo se edita en borrador y los datos hasta decidir", () => {
    expect(canEditDesign(creator, "draft")).toBe(true);
    expect(canEditDesign(creator, "approved")).toBe(false);
    expect(canLoadData(creator, "in_reading")).toBe(true);
    expect(canLoadData(creator, "decided")).toBe(false);
  });
});

describe("qué falta para enviar a revisión", () => {
  it("un piloto completo no tiene faltantes", () => {
    expect(missingForReview(complete)).toEqual([]);
  });

  it("lista lo que falta en el orden de la base", () => {
    const m = missingForReview({ ...complete, problem: " ", guardrails: 0, has_rules: false, media: 0 });
    expect(m.map((x) => x.text)).toEqual(["la oportunidad de mejora", "al menos un guardrail", "las reglas de decisión", "al menos un medio"]);
    expect(m[0].step).toBe("problema");
  });

  it("pide justificación si se aparta del tipo recomendado", () => {
    const input = { ...complete, test_type: "ab_platform" as const };
    expect(needsDesignJustification(input)).toBe(true);
    expect(missingForReview(input).map((x) => x.text)).toContain("la justificación de por qué no usa el tipo de prueba recomendado");
    expect(missingForReview({ ...input, design_justification: "No se puede dividir el tráfico en CTWA" })).toEqual([]);
  });

  it("la alternativa de la matriz no pide justificación", () => {
    expect(
      needsDesignJustification({ variable: { recommended_test_type: "ab_platform", alternative_test_type: "geo" }, test_type: "geo" }),
    ).toBe(false);
  });

  it("geo exige ciudades y holdout dos grupos", () => {
    expect(missingForReview({ ...complete, test_type: "geo", variable: null }).map((x) => x.text)).toContain("las ciudades de cada grupo");
    const three = { ...complete, test_type: "holdout" as const, variable: null, arms: [...complete.arms, { is_control: false, cities: [] }] };
    expect(missingForReview(three).map((x) => x.text)).toContain("dos grupos: expuesto y holdout");
  });

  it("exige exactamente un control", () => {
    const m = missingForReview({ ...complete, arms: [{ is_control: false, cities: [] }, { is_control: false, cities: [] }] });
    expect(m.map((x) => x.text)).toContain("los grupos (un control y al menos una variante)");
  });
});

describe("pasos y textos", () => {
  it("pasos con valor por defecto", () => {
    expect(parsePilotStep("metricas")).toBe("metricas");
    expect(parsePilotStep("otro")).toBe("problema");
    expect(nextPilotStep("reglas")).toBe("medicion");
    expect(nextPilotStep("medicion")).toBeNull();
  });

  it("arma la hipótesis con los huecos marcados", () => {
    expect(hypothesisSentence({ change: "video UGC", scope: null, metric: "ventas", expectedPct: 12.5, reason: "confianza" })).toBe(
      "Si hacemos video UGC en [ámbito], esperamos mover ventas en 12,5 % porque confianza.",
    );
  });
});
