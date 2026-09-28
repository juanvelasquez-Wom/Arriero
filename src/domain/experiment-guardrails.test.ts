import { describe, expect, it } from "vitest";
import { brokenGuardrailMessages, describeGuardrail, evaluateGuardrails, type ExperimentGuardrail } from "./experiment-guardrails";

const guardrails: ExperimentGuardrail[] = [
  { id: "g1", metric_id: "m1", metric_name: "Tasa de bloqueo", direction: "down", limit_pct: 10 },
  { id: "g2", metric_id: "m2", metric_name: "Ticket promedio", direction: "up", limit_pct: 5 },
];
const variants = [
  { id: "c", name: "Control", is_control: true, guardrail_values: { g1: 2, g2: 100 } },
  { id: "a", name: "Variante A", is_control: false, guardrail_values: { g1: 2.4, g2: 98 } },
  { id: "b", name: "Variante B", is_control: false, guardrail_values: { g1: 2.1 } },
];

describe("evaluateGuardrails", () => {
  const r = evaluateGuardrails(guardrails, variants);

  it("calcula el cambio relativo de cada variante frente al control", () => {
    expect(r[0].rows[0].change_pct).toBeCloseTo(20, 6);
    expect(r[1].rows[0].change_pct).toBeCloseTo(-2, 6);
  });

  it("se rompe según la dirección: en 'menos es mejor', subir más del límite", () => {
    expect(r[0].rows[0].broken).toBe(true);
    expect(r[0].rows[1].broken).toBe(false);
    expect(r[0].broken).toBe(true);
    expect(r[1].rows[0].broken).toBe(false);
    expect(r[1].broken).toBe(false);
  });

  it("sin el dato queda en null, no roto", () => {
    expect(r[1].rows[1].broken).toBeNull();
    expect(evaluateGuardrails(guardrails, [{ id: "c", name: "C", is_control: true, guardrail_values: null }])[0].rows).toEqual([]);
  });

  it("arma el aviso de los rotos", () => {
    const msgs = brokenGuardrailMessages(r);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/Tasa de bloqueo.*Variante A.*20 %.*10 %/);
  });
});

describe("describeGuardrail", () => {
  it("usa la dirección de la métrica", () => {
    expect(describeGuardrail({ limit_pct: 15, direction: "up" })).toBe("No baja más de 15 % frente al control");
    expect(describeGuardrail({ limit_pct: 2.5, direction: "down" })).toBe("No sube más de 2,5 % frente al control");
  });
});
