import { describe, expect, it } from "vitest";
import { DEFAULT_DECISION_RULES } from "./types";
import {
  armsForTestType,
  defaultPowerInputs,
  holdoutSplits,
  isStepReachable,
  nextArmName,
  plannedDays,
  readinessFrom,
  rulesSentence,
  splitEvenly,
  splitTotal,
  stepsDone,
  summaryFromDesign,
  wizardProgress,
  type WizardProgressInput,
} from "./wizard";

const empty: WizardProgressInput = {
  problem: null,
  hypothesis_change: null,
  hypothesis_scope: null,
  hypothesis_metric: null,
  hypothesis_expected_pct: null,
  hypothesis_reason: null,
  variable_id: null,
  test_type: null,
  primary_metric_id: null,
  has_power: false,
  has_rules: false,
  arms: 0,
  media: 0,
  checklist: 0,
};

describe("stepsDone e isStepReachable", () => {
  it("sin nada guardado no hay pasos listos y solo se abre el primero", () => {
    const done = stepsDone(empty);
    expect(Object.values(done).every((x) => !x)).toBe(true);
    expect(isStepReachable("problema", done, true)).toBe(true);
    expect(isStepReachable("prueba", done, true)).toBe(false);
    expect(isStepReachable("problema", done, false)).toBe(true);
  });

  it("con el problema listo se abre el siguiente, no los demás", () => {
    const done = stepsDone({
      ...empty,
      problem: "CPA alto",
      hypothesis_change: "video",
      hypothesis_scope: "CTWA",
      hypothesis_metric: "ventas",
      hypothesis_expected_pct: 10,
      hypothesis_reason: "confianza",
    });
    expect(done.problema).toBe(true);
    expect(isStepReachable("prueba", done, true)).toBe(true);
    expect(isStepReachable("metricas", done, true)).toBe(false);
    expect(wizardProgress(done)).toBe(20);
  });

  it("un paso guardado se abre aunque falte uno anterior", () => {
    const done = stepsDone({ ...empty, has_rules: true });
    expect(isStepReachable("reglas", done, true)).toBe(true);
    expect(isStepReachable("metricas", done, true)).toBe(false);
  });
});

describe("reparto", () => {
  it("reparte parejo y suma 100", () => {
    expect(splitEvenly(2)).toEqual([50, 50]);
    const three = splitEvenly(3);
    expect(three).toEqual([33.4, 33.3, 33.3]);
    expect(splitTotal(three.map((s) => ({ split_pct: s })))).toBe(100);
    expect(splitEvenly(0)).toEqual([]);
  });

  it("holdout: expuesto y holdout, acotado entre 1 y 90", () => {
    expect(holdoutSplits(10)).toEqual([90, 10]);
    expect(holdoutSplits(95)).toEqual([10, 90]);
    expect(holdoutSplits(0)).toEqual([99, 1]);
  });
});

describe("armsForTestType", () => {
  it("A/B desde cero: control y variante B con 50 / 50", () => {
    const arms = armsForTestType("ab_creative", []);
    expect(arms.map((a) => [a.name, a.is_control, a.split_pct])).toEqual([
      ["Control", true, 50],
      ["Variante B", false, 50],
    ]);
  });

  it("holdout: exactamente dos grupos, con el reparto del holdout y conservando ids", () => {
    const arms = armsForTestType(
      "holdout",
      [
        { id: "c", name: "Control", is_control: true, split_pct: 34, cities: [] },
        { id: "b", name: "Variante B", is_control: false, split_pct: 33, cities: [] },
        { id: "x", name: "Variante C", is_control: false, split_pct: 33, cities: [] },
      ],
      20,
    );
    expect(arms).toHaveLength(2);
    expect(arms[0]).toMatchObject({ id: "b", name: "Expuesto", is_control: false, split_pct: 80 });
    expect(arms[1]).toMatchObject({ id: "c", name: "Holdout", is_control: true, split_pct: 20 });
  });

  it("geo: quita el reparto y respeta los nombres propios", () => {
    const arms = armsForTestType("geo", [
      { name: "Control", is_control: true, split_pct: 50, cities: ["Cali"] },
      { name: "Antioquia", is_control: false, split_pct: 50, cities: ["Medellín"] },
    ]);
    expect(arms.map((a) => [a.name, a.split_pct, a.cities])).toEqual([
      ["Ciudades de control", null, ["Cali"]],
      ["Antioquia", null, ["Medellín"]],
    ]);
  });

  it("sin control marca uno", () => {
    const arms = armsForTestType("ab_platform", [{ name: "A", is_control: false, split_pct: null, cities: [] }]);
    expect(arms.filter((a) => a.is_control)).toHaveLength(1);
    expect(arms).toHaveLength(2);
  });

  it("nextArmName no repite", () => {
    expect(nextArmName("ab_creative", [{ name: "Control" }, { name: "Variante B" }])).toBe("Variante C");
  });
});

describe("summaryFromDesign", () => {
  it("arma el resumen con el nombre del medio y las ciudades de los grupos", () => {
    const s = summaryFromDesign(
      {
        id: "p",
        title: "Piloto",
        status: "draft",
        test_type: "geo",
        planned_start: "2026-10-01",
        planned_end: "2026-10-28",
        media: [{ media_id: "m1", campaign: " CTWA ", account: "", cities: ["Cali"] }, { media_id: "" }],
        arms: [{ cities: ["Medellín"] }, { cities: [] }],
      },
      { m1: "Meta" },
    );
    expect(s.media).toEqual([
      { media_id: "m1", media_name: "Meta", account: null, campaign: "CTWA", audience: null, destination: null, cities: ["Cali"] },
    ]);
    expect(s.arm_cities).toEqual(["Medellín"]);
    expect(s.start).toBe("2026-10-01");
  });
});

describe("potencia por defecto", () => {
  it("días, inversión diaria y MDE objetivo salen del diseño", () => {
    expect(plannedDays("2026-10-01", "2026-10-28")).toBe(28);
    expect(plannedDays("2026-10-02", "2026-10-01")).toBeNull();
    const p = defaultPowerInputs({ calc: "rate", saved: null, plannedStart: "2026-10-01", plannedEnd: "2026-10-10", budgetCop: 1_000_000, expectedPct: -12 });
    expect(p.planned_days).toBe(10);
    expect(p.daily_spend_cop).toBe(100_000);
    expect(p.target_mde_pct).toBe(12);
    expect(p.daily_cv).toBeNull();
  });

  it("lo guardado manda", () => {
    const p = defaultPowerInputs({
      calc: "sum",
      saved: { baseline: 50, planned_days: 14, daily_cv: 0.4 },
      plannedStart: null,
      plannedEnd: null,
      budgetCop: null,
      expectedPct: null,
    });
    expect(p).toMatchObject({ baseline: 50, planned_days: 14, daily_cv: 0.4, alpha: 0.05, power: 0.8 });
  });
});

describe("rulesSentence", () => {
  it("dice las reglas por defecto en palabras", () => {
    expect(rulesSentence(DEFAULT_DECISION_RULES)).toBe(
      "Escalar si la probabilidad de ganar es ≥ 90 %, la mejora es ≥ 0 % y ningún guardrail se rompe. Apagar si la probabilidad es ≤ 20 %. En los demás casos, ajustar.",
    );
  });

  it("cuando el guardrail no bloquea lo aclara", () => {
    expect(rulesSentence({ ...DEFAULT_DECISION_RULES, guardrails_block_scale: false, scale_min_lift_pct: 5.5 })).toContain(
      "la mejora es ≥ 5,5 % (aunque un guardrail se rompa)",
    );
  });
});

describe("readinessFrom", () => {
  it("traduce lo guardado a la entrada de missingForReview", () => {
    const r = readinessFrom(
      {
        pilot: {
          problem: "x",
          hypothesis_change: null,
          hypothesis_scope: null,
          hypothesis_metric: null,
          hypothesis_expected_pct: null,
          hypothesis_reason: null,
          variable_id: "v",
          test_type: "geo",
          design_justification: null,
          primary_metric_id: null,
          power_result: { mde_pct: 5 },
          decision_rules: null,
          planned_start: null,
          planned_end: null,
        },
        guardrails: [{}],
        media: [],
        arms: [{ is_control: true, cities: [] }],
      },
      [{ id: "v", recommended_test_type: "geo", alternative_test_type: null }],
    );
    expect(r.variable).toEqual({ recommended_test_type: "geo", alternative_test_type: null });
    expect(r.has_power).toBe(true);
    expect(r.has_rules).toBe(false);
    expect(r.guardrails).toBe(1);
  });
});
