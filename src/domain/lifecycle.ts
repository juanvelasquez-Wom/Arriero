// Regla 3 · Ciclo de vida. Espejo de public.transition_experiment.
import { freezeContaining } from "./calendar";
import { STATUS_LABEL } from "./labels";
import { canTransition } from "./permissions";
import type { Actor, CalendarEvent, ExperimentCore, ExperimentStatus, Variant } from "./types";

export const STATUS_ORDER: readonly ExperimentStatus[] = [
  "idea",
  "prioritized",
  "in_design",
  "in_test",
  "in_reading",
  "decided",
  "scaled",
  "discarded",
];

/** Transiciones permitidas desde cada estado. */
export const TRANSITIONS: Record<ExperimentStatus, readonly ExperimentStatus[]> = {
  idea: ["prioritized", "discarded"],
  prioritized: ["in_design", "idea", "discarded"],
  in_design: ["in_test", "prioritized", "discarded"],
  in_test: ["in_reading"],
  in_reading: ["decided"],
  decided: ["scaled"],
  scaled: [],
  discarded: [],
};

export const CLOSED_STATUSES: readonly ExperimentStatus[] = ["decided", "scaled"];
export const ACTIVE_STATUSES: readonly ExperimentStatus[] = ["prioritized", "in_design", "in_test", "in_reading"];

export const isClosed = (s: ExperimentStatus) => CLOSED_STATUSES.includes(s);
export const isActive = (s: ExperimentStatus) => ACTIVE_STATUSES.includes(s);
/** Desde En prueba el diseño se considera lanzado. */
export const isLaunched = (s: ExperimentStatus) => ["in_test", "in_reading", "decided", "scaled"].includes(s);

export interface TransitionContext {
  experiment: ExperimentCore;
  variants: Pick<Variant, "is_control" | "sample" | "conversions" | "metric_value">[];
  hasLearning: boolean;
  calendar: CalendarEvent[];
}

export function isForward(from: ExperimentStatus, to: ExperimentStatus): boolean {
  return STATUS_ORDER.indexOf(to) > STATUS_ORDER.indexOf(from) && to !== "discarded";
}

/** Lista de lo que falta para pasar al estado `to` (vacía si se cumple todo). */
export function missingRequirements(to: ExperimentStatus, ctx: TransitionContext): string[] {
  const e = ctx.experiment;
  const missing: string[] = [];

  if ((to === "prioritized" || to === "in_design") && (e.impact == null || e.confidence == null || e.ease == null)) {
    missing.push("calificación ICE completa (impacto, confianza y facilidad)");
  }

  if (to === "in_test") {
    if (!e.test_type) missing.push("tipo de prueba");
    if (!ctx.variants.some((v) => v.is_control)) missing.push("una variante de control");
    if (!ctx.variants.some((v) => !v.is_control)) missing.push("al menos una variante además del control");
    if (!e.primary_metric?.trim()) missing.push("métrica principal");
    if (e.min_duration_days == null) missing.push("duración mínima");
    if (!e.decision_rule?.trim()) missing.push("regla de decisión");
    if (!e.owner_id) missing.push("responsable");
    if (!(e.actual_start ?? e.planned_start)) missing.push("fecha de inicio");
  }

  if (to === "decided") {
    const incomplete =
      ctx.variants.length === 0 ||
      ctx.variants.some((v) => v.sample == null || (v.conversions == null && v.metric_value == null));
    if (incomplete) missing.push("resultados cargados en todas las variantes");
    if (!e.verdict) missing.push("veredicto");
    if (!e.decision) missing.push("decisión");
    if (!ctx.hasLearning) missing.push("aprendizaje");
  }

  if (to === "scaled" && e.decision !== "scale") missing.push('decisión "escalar"');

  return missing;
}

export type TransitionCheck =
  | { ok: true; freeze: CalendarEvent | null }
  | { ok: false; reasons: string[]; freeze: CalendarEvent | null; canForce: boolean };

/**
 * Valida una transición. Si la fecha de inicio cae en un congelamiento la
 * transición falla con `freeze` definido; un owner/admin puede forzarla con
 * justificación (`canForce`).
 */
export function checkTransition(
  to: ExperimentStatus,
  ctx: TransitionContext,
  actor: Actor,
  options: { force?: boolean } = {},
): TransitionCheck {
  const from = ctx.experiment.status;
  if (from === to) return { ok: true, freeze: null };

  if (!TRANSITIONS[from].includes(to)) {
    const allowed = TRANSITIONS[from].map((s) => STATUS_LABEL[s]);
    const hint = allowed.length ? ` Desde ${STATUS_LABEL[from]} solo puede pasar a ${allowed.join(" o ")}.` : "";
    return {
      ok: false,
      reasons: [`No se puede pasar de ${STATUS_LABEL[from]} a ${STATUS_LABEL[to]}.${hint}`],
      freeze: null,
      canForce: false,
    };
  }

  if (!canTransition(actor, ctx.experiment, to)) {
    const reason =
      to === "decided" || to === "scaled"
        ? "Solo el owner o un admin puede decidir un ejercicio."
        : "No tiene permiso para mover este ejercicio.";
    return { ok: false, reasons: [reason], freeze: null, canForce: false };
  }

  const missing = missingRequirements(to, ctx);
  if (missing.length) {
    return {
      ok: false,
      reasons: [`Para pasar a ${STATUS_LABEL[to]} falta: ${missing.join(", ")}.`],
      freeze: null,
      canForce: false,
    };
  }

  if (to === "in_test") {
    const start = ctx.experiment.actual_start ?? ctx.experiment.planned_start;
    const freeze = freezeContaining(start, ctx.calendar);
    if (freeze && !options.force) {
      const manager = actor.isAdmin || actor.role === "owner";
      return {
        ok: false,
        reasons: [`La fecha de inicio cae dentro del congelamiento "${freeze.name}".`],
        freeze,
        canForce: manager,
      };
    }
    return { ok: true, freeze };
  }

  return { ok: true, freeze: null };
}

/** Transiciones visibles como botones en el detalle, con el motivo si no se puede. */
export function availableTransitions(ctx: TransitionContext, actor: Actor) {
  return TRANSITIONS[ctx.experiment.status].map((to) => ({ to, check: checkTransition(to, ctx, actor) }));
}

/** Días en el estado actual. */
export function daysInStatus(statusChangedAt: string, now: Date = new Date()): number {
  return Math.max(0, Math.floor((now.getTime() - new Date(statusChangedAt).getTime()) / 86_400_000));
}
