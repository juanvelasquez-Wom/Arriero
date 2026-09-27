import { describe, expect, it } from "vitest";
import {
  availableTransitions,
  checkTransition,
  isHypothesisComplete,
  missingHypothesisParts,
  missingRequirements,
  type HypothesisParts,
  type TransitionContext,
} from "./lifecycle";
import type { Actor, CalendarEvent, ExperimentCore } from "./types";

const owner: Actor = { userId: "u-owner", isAdmin: false, role: "owner" };
const collaborator: Actor = { userId: "u-collab", isAdmin: false, role: "collaborator" };
const agency: Actor = { userId: "u-agency", isAdmin: false, role: "agency" };
const viewer: Actor = { userId: "u-viewer", isAdmin: false, role: "viewer" };
const admin: Actor = { userId: "u-admin", isAdmin: true, role: null };

const freeze: CalendarEvent = {
  id: "f1",
  type: "freeze",
  name: "Congelamiento pico 1",
  start_date: "2026-11-23",
  end_date: "2026-12-06",
};

type Exp = ExperimentCore & HypothesisParts;

function experiment(overrides: Partial<Exp> = {}): Exp {
  return {
    id: "e1",
    status: "idea",
    created_by: "u-collab",
    owner_id: null,
    impact: null,
    confidence: null,
    ease: null,
    fits_calendar: false,
    control: "ours",
    test_type: null,
    primary_metric: null,
    min_duration_days: null,
    decision_rule: null,
    planned_start: null,
    planned_end: null,
    actual_start: null,
    actual_end: null,
    design_locked_at: null,
    verdict: null,
    decision: null,
    hypothesis_if: null,
    hypothesis_then: null,
    hypothesis_because: null,
    ...overrides,
  };
}

const readyDesign: Partial<Exp> = {
  hypothesis_if: "enviamos un recordatorio por WhatsApp",
  hypothesis_then: "sube la segunda recarga",
  hypothesis_because: "el cliente se acuerda a tiempo",
  impact: 8,
  confidence: 7,
  ease: 8,
  test_type: "ab",
  primary_metric: "Segunda recarga a 30 días",
  min_duration_days: 28,
  decision_rule: "Escalar si supera 10 %",
  owner_id: "u-agency",
  planned_start: "2026-10-05",
};

const variants = [
  { is_control: true, sample: null, conversions: null, metric_value: null },
  { is_control: false, sample: null, conversions: null, metric_value: null },
];

function ctx(e: Partial<Exp>, extra: Partial<TransitionContext> = {}): TransitionContext {
  return { experiment: experiment(e), variants: [], hasLearning: false, calendar: [freeze], ...extra };
}

describe("transiciones permitidas", () => {
  it("rechaza saltos que no están en el ciclo", () => {
    const r = checkTransition("in_test", ctx({ status: "idea" }), owner);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toMatch(/No se puede pasar de Idea a En prueba/);
  });

  it("Descartado solo desde Idea, Priorizado o En diseño", () => {
    expect(checkTransition("discarded", ctx({ status: "idea" }), owner).ok).toBe(true);
    expect(checkTransition("discarded", ctx({ status: "prioritized", ...readyDesign }), owner).ok).toBe(true);
    expect(checkTransition("discarded", ctx({ status: "in_design", ...readyDesign }), owner).ok).toBe(true);
    expect(checkTransition("discarded", ctx({ status: "in_test", ...readyDesign }), owner).ok).toBe(false);
  });

  it("los estados terminales no tienen salida", () => {
    expect(availableTransitions(ctx({ status: "scaled" }), owner)).toEqual([]);
    expect(availableTransitions(ctx({ status: "discarded" }), owner)).toEqual([]);
  });
});

describe("Priorizado", () => {
  it("exige ICE completo", () => {
    const r = checkTransition("prioritized", ctx({ impact: 8, confidence: 7 }), collaborator);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toMatch(/ICE completa/);
    expect(checkTransition("prioritized", ctx({ impact: 8, confidence: 7, ease: 8 }), collaborator).ok).toBe(true);
  });

  it("la agencia y el lector no priorizan", () => {
    const c = ctx({ impact: 8, confidence: 7, ease: 8, owner_id: "u-agency" });
    expect(checkTransition("prioritized", c, agency).ok).toBe(false);
    expect(checkTransition("prioritized", c, viewer).ok).toBe(false);
  });
});

describe("En diseño", () => {
  const ice = { impact: 8, confidence: 7, ease: 8 };

  it("exige la hipótesis completa, con el mismo texto que la base", () => {
    const missing = missingRequirements("in_design", ctx({ status: "prioritized", ...ice, hypothesis_if: "cambiamos X" }));
    expect(missing).toEqual(["hipótesis completa (SI, ENTONCES y PORQUE)"]);
    const r = checkTransition("in_design", ctx({ status: "prioritized", ...ice, hypothesis_if: "cambiamos X" }), collaborator);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons[0]).toBe("Para pasar a En diseño falta: hipótesis completa (SI, ENTONCES y PORQUE).");
  });

  it("los espacios en blanco no cuentan como hipótesis", () => {
    const h = { hypothesis_if: "a", hypothesis_then: "  ", hypothesis_because: "c" };
    expect(missingHypothesisParts(h)).toEqual(["ENTONCES"]);
    expect(isHypothesisComplete(h)).toBe(false);
    expect(missingHypothesisParts({})).toEqual(["SI", "ENTONCES", "PORQUE"]);
  });

  it("pasa con ICE e hipótesis completos", () => {
    expect(checkTransition("in_design", ctx({ status: "prioritized", ...readyDesign }), collaborator).ok).toBe(true);
  });

  it("Priorizado no exige hipótesis", () => {
    expect(checkTransition("prioritized", ctx({ ...ice }), collaborator).ok).toBe(true);
  });
});

describe("En prueba", () => {
  it("lista todo lo que falta", () => {
    const missing = missingRequirements("in_test", ctx({ status: "in_design" }));
    expect(missing).toEqual([
      "tipo de prueba",
      "una variante de control",
      "al menos una variante además del control",
      "métrica principal",
      "duración mínima",
      "regla de decisión",
      "responsable",
      "fecha de inicio",
    ]);
  });

  it("pasa con el diseño completo, y la agencia asignada puede moverlo", () => {
    const c = ctx({ status: "in_design", ...readyDesign }, { variants });
    expect(checkTransition("in_test", c, collaborator).ok).toBe(true);
    expect(checkTransition("in_test", c, agency).ok).toBe(true);
  });

  it("la agencia no asignada no puede moverlo", () => {
    const c = ctx({ status: "in_design", ...readyDesign, owner_id: "otro" }, { variants });
    expect(checkTransition("in_test", c, agency).ok).toBe(false);
  });

  it("se bloquea si el inicio cae en un congelamiento; solo owner/admin puede forzar", () => {
    const c = ctx({ status: "in_design", ...readyDesign, planned_start: "2026-11-25" }, { variants });
    const byCollab = checkTransition("in_test", c, collaborator);
    expect(byCollab.ok).toBe(false);
    if (!byCollab.ok) {
      expect(byCollab.freeze?.id).toBe("f1");
      expect(byCollab.canForce).toBe(false);
    }
    const byOwner = checkTransition("in_test", c, owner);
    expect(byOwner.ok).toBe(false);
    if (!byOwner.ok) expect(byOwner.canForce).toBe(true);
    expect(checkTransition("in_test", c, owner, { force: true }).ok).toBe(true);
    expect(checkTransition("in_test", c, admin, { force: true }).ok).toBe(true);
  });

  it("usa la fecha real de inicio si existe", () => {
    const c = ctx(
      { status: "in_design", ...readyDesign, planned_start: "2026-11-25", actual_start: "2026-11-10" },
      { variants },
    );
    expect(checkTransition("in_test", c, owner).ok).toBe(true);
  });
});

describe("Decidido y Escalado", () => {
  const withResults = [
    { is_control: true, sample: 5000, conversions: 900, metric_value: null },
    { is_control: false, sample: 5000, conversions: 1150, metric_value: null },
  ];

  it("exige resultados, veredicto, decisión y aprendizaje", () => {
    const missing = missingRequirements("decided", ctx({ status: "in_reading" }, { variants }));
    expect(missing).toEqual(["resultados cargados en todas las variantes", "veredicto", "decisión", "aprendizaje"]);
  });

  it("solo owner o admin decide", () => {
    const c = ctx(
      { status: "in_reading", verdict: "winner", decision: "scale" },
      { variants: withResults, hasLearning: true },
    );
    expect(checkTransition("decided", c, owner).ok).toBe(true);
    expect(checkTransition("decided", c, admin).ok).toBe(true);
    expect(checkTransition("decided", c, collaborator).ok).toBe(false);
    expect(checkTransition("decided", c, agency).ok).toBe(false);
  });

  it("acepta el valor de la métrica cuando no hay conversiones", () => {
    const c = ctx(
      { status: "in_reading", verdict: "inconclusive", decision: "adjust" },
      {
        variants: [
          { is_control: true, sample: 100, conversions: null, metric_value: 9800 },
          { is_control: false, sample: 100, conversions: null, metric_value: 8200 },
        ],
        hasLearning: true,
      },
    );
    expect(checkTransition("decided", c, owner).ok).toBe(true);
  });

  it("Escalado a BAU exige la decisión escalar", () => {
    expect(checkTransition("scaled", ctx({ status: "decided", decision: "kill" }), owner).ok).toBe(false);
    expect(checkTransition("scaled", ctx({ status: "decided", decision: "scale" }), owner).ok).toBe(true);
  });
});
