import { describe, expect, it } from "vitest";
import { evaluateGuardrail, suggestDecision } from "./decision-rules";
import { DEFAULT_DECISION_RULES as rules } from "./types";

describe("suggestDecision", () => {
  it("escala con probabilidad y mejora suficientes", () => {
    const r = suggestDecision({ probability: 0.96, liftPct: 12, guardrailsBroken: false, rules });
    expect(r.decision).toBe("scale");
    expect(r.reasons[0]).toContain("96 %");
  });

  it("un guardrail roto que bloquea convierte escalar en ajustar", () => {
    const r = suggestDecision({ probability: 0.96, liftPct: 12, guardrailsBroken: true, rules });
    expect(r.decision).toBe("adjust");
    expect(r.reasons.some((x) => x.includes("guardrail"))).toBe(true);
  });

  it("si la regla no bloquea, escala pero lo advierte", () => {
    const r = suggestDecision({ probability: 0.96, liftPct: 12, guardrailsBroken: true, rules: { ...rules, guardrails_block_scale: false } });
    expect(r.decision).toBe("scale");
    expect(r.reasons.some((x) => x.includes("revíselo"))).toBe(true);
  });

  it("apaga con probabilidad baja", () => {
    expect(suggestDecision({ probability: 0.1, liftPct: -5, guardrailsBroken: false, rules }).decision).toBe("kill");
    expect(suggestDecision({ probability: 0.2, liftPct: -5, guardrailsBroken: false, rules }).decision).toBe("kill");
  });

  it("ajusta en la zona intermedia o si la mejora no alcanza", () => {
    expect(suggestDecision({ probability: 0.6, liftPct: 3, guardrailsBroken: false, rules }).decision).toBe("adjust");
    const r = suggestDecision({ probability: 0.95, liftPct: 2, guardrailsBroken: false, rules: { ...rules, scale_min_lift_pct: 5 } });
    expect(r.decision).toBe("adjust");
    expect(r.reasons[0]).toContain("la regla pide al menos 5 %");
  });

  it("null sin probabilidad", () => {
    expect(suggestDecision({ probability: null, liftPct: null, guardrailsBroken: false, rules }).decision).toBeNull();
  });
});

describe("evaluateGuardrail", () => {
  it("up: se rompe si cae más del límite", () => {
    expect(evaluateGuardrail({ changePct: -16, limitPct: 15, direction: "up" })).toBe(true);
    expect(evaluateGuardrail({ changePct: -15, limitPct: 15, direction: "up" })).toBe(false);
    expect(evaluateGuardrail({ changePct: 30, limitPct: 15, direction: "up" })).toBe(false);
  });

  it("down: se rompe si sube más del límite", () => {
    expect(evaluateGuardrail({ changePct: 16, limitPct: 15, direction: "down" })).toBe(true);
    expect(evaluateGuardrail({ changePct: -40, limitPct: 15, direction: "down" })).toBe(false);
  });

  it("null sin cambio", () => {
    expect(evaluateGuardrail({ changePct: null, limitPct: 15, direction: "up" })).toBeNull();
  });
});
