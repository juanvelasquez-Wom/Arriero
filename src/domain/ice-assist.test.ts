import { describe, expect, it } from "vitest";
import { expectedMonthlyValue, iceSuggestionLabel, impactFromPeers, impactFromValue, suggestIce } from "./ice-assist";
import { WEEKS_PER_MONTH } from "./value";

const metric = { unit: "altas", direction: "up" as const, baseline: 1000, latest_value: null, unit_value: 100_000 };
const problem = { status: "to_validate", evidence: "Corta", attachments: 0, impact: "medium" as const };

describe("expectedMonthlyValue", () => {
  it("volumen × efecto × valor por unidad, a favor de la métrica", () => {
    expect(expectedMonthlyValue(10, metric)).toBeCloseTo(0.1 * 1000 * 100_000 * WEEKS_PER_MONTH, 2);
    expect(expectedMonthlyValue(10, { ...metric, direction: "down" })).toBeCloseTo(0.1 * 1000 * 100_000 * WEEKS_PER_MONTH, 2);
    expect(expectedMonthlyValue(null, metric)).toBeNull();
    expect(expectedMonthlyValue(10, { ...metric, unit: "%" })).toBeNull();
  });
});

describe("impacto", () => {
  it("escala logarítmica", () => {
    expect(impactFromValue(100_000)).toBe(1);
    expect(impactFromValue(1_000_000)).toBe(3);
    expect(impactFromValue(10_000_000)).toBe(5);
    expect(impactFromValue(100_000_000)).toBe(7);
    expect(impactFromValue(1e12)).toBe(10);
    expect(impactFromValue(10)).toBe(1);
  });
  it("frente a los demás, por percentil", () => {
    expect(impactFromPeers(100, [1, 2, 3])).toBe(10);
    expect(impactFromPeers(0.5, [1, 2, 3])).toBe(1);
    expect(impactFromPeers(2, [1, 2, 3])).toBe(6);
  });
  it("sin valor usa el impacto del problema", () => {
    const s = suggestIce({ expectedEffectPct: null, metric, problem, draftText: "" });
    expect(s.impact).toBe(5);
    expect(s.why.impact).toMatch(/impacto medio del problema/);
  });
  it("con pocos pares usa la escala; con 3 o más, la posición", () => {
    const alone = suggestIce({ expectedEffectPct: 10, metric, problem, draftText: "" });
    expect(alone.impact).toBe(impactFromValue(alone.monthlyValue!));
    const ranked = suggestIce({ expectedEffectPct: 10, metric, problem, draftText: "", peerMonthlyValues: [1, 2, 3] });
    expect(ranked.impact).toBe(10);
  });
  it("sin nada no sugiere impacto", () => {
    expect(suggestIce({ expectedEffectPct: null, metric: null, problem: null, draftText: "" }).impact).toBeNull();
  });
});

describe("confianza", () => {
  const draft = "recordatorio whatsapp recarga paquete sugerido clientes prepago";
  it("parte de 4 y suma por problema validado, evidencia y adjuntos", () => {
    expect(suggestIce({ expectedEffectPct: null, metric, problem, draftText: draft }).confidence).toBe(4);
    const s = suggestIce({
      expectedEffectPct: null,
      metric,
      problem: { ...problem, status: "validated", evidence: "x".repeat(200), attachments: 2 },
      draftText: draft,
    });
    expect(s.confidence).toBe(8);
    expect(s.why.confidence.join(" ")).toMatch(/validado \(\+2\).*evidencia.*2 adjuntos/);
  });
  it("aprendizajes parecidos que ganaron suben y los que perdieron bajan", () => {
    const learnings = [
      { text: "El recordatorio por WhatsApp de recarga con paquete sugerido subió la recarga en prepago", verdict: "winner" as const },
      { text: "Recordatorio WhatsApp recarga paquete sugerido para clientes prepago funcionó", verdict: "winner" as const },
      { text: "Algo que no tiene nada que ver con televisión", verdict: "loser" as const },
    ];
    const up = suggestIce({ expectedEffectPct: null, metric, problem, draftText: draft, learnings });
    expect(up.confidence).toBe(6);
    const down = suggestIce({
      expectedEffectPct: null,
      metric,
      problem,
      draftText: draft,
      learnings: learnings.map((l) => ({ ...l, verdict: "loser" as const })),
    });
    expect(down.confidence).toBe(2);
  });
  it("sin problema no sugiere confianza", () => {
    expect(suggestIce({ expectedEffectPct: 10, metric, problem: null, draftText: "" }).confidence).toBeNull();
  });
});

describe("iceSuggestionLabel", () => {
  it("resume la sugerencia", () => {
    expect(iceSuggestionLabel({ impact: 7, confidence: 6 })).toBe("I 7 · C 6");
    expect(iceSuggestionLabel({ impact: null, confidence: 6 })).toBe("I — · C 6");
  });
});
