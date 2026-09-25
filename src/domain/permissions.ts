// Matriz de permisos (CLAUDE.md §7) para la INTERFAZ: ocultar o deshabilitar.
// La barrera real es RLS + RPC en Postgres; esto solo la refleja.
import type { Actor, ExperimentCore, ExperimentStatus } from "./types";

export const EARLY_STATUSES: readonly ExperimentStatus[] = ["idea", "prioritized", "in_design", "discarded"];

export const isManager = (a: Actor) => a.isAdmin || a.role === "owner";
export const isEditor = (a: Actor) => isManager(a) || a.role === "collaborator";
export const isMember = (a: Actor) => a.isAdmin || a.role !== null;
export const isAssignedAgency = (a: Actor, exp: Pick<ExperimentCore, "owner_id">) =>
  a.role === "agency" && exp.owner_id === a.userId;

type Exp = Pick<ExperimentCore, "owner_id" | "created_by" | "status">;

export const can = {
  createProgram: (a: Actor) => a.isAdmin,
  editProgramSettings: (a: Actor) => isManager(a),
  manageMembers: (a: Actor) => isManager(a),
  editStructure: (a: Actor) => isEditor(a),
  editCalendar: (a: Actor) => isEditor(a),
  loadMetricValues: (a: Actor) => isEditor(a),
  createProblem: (a: Actor) => isEditor(a),
  editProblem: (a: Actor) => isEditor(a),
  createExperiment: (a: Actor) => isEditor(a) || a.role === "agency",
  editExperiment: (a: Actor, e: Pick<ExperimentCore, "owner_id">) => isEditor(a) || isAssignedAgency(a, e),
  uploadResults: (a: Actor, e: Pick<ExperimentCore, "owner_id">) => isEditor(a) || isAssignedAgency(a, e),
  uploadProblemAttachment: (a: Actor) => isEditor(a),
  scoreIce: (a: Actor) => isEditor(a),
  decide: (a: Actor) => isManager(a),
  unlockDesign: (a: Actor) => isManager(a),
  forceFreeze: (a: Actor) => isManager(a),
  deleteExperiment: (a: Actor, e: Exp) => {
    if (isManager(a)) return true;
    return (
      EARLY_STATUSES.includes(e.status) &&
      (a.role === "collaborator" || a.role === "agency") &&
      e.created_by === a.userId
    );
  },
  deleteStructure: (a: Actor) => isManager(a),
  deleteProgram: (a: Actor) => isManager(a),
  emptyTrash: (a: Actor) => isManager(a),
  restore: (a: Actor) => isManager(a),
  viewTrash: (a: Actor) => isManager(a),
  manageDemo: (a: Actor) => a.isAdmin,
  view: (a: Actor) => isMember(a),
};

/** ¿Puede el actor intentar esta transición? (Los requisitos se validan aparte.) */
export function canTransition(a: Actor, e: Pick<ExperimentCore, "owner_id" | "status">, to: ExperimentStatus): boolean {
  if (to === "decided" || to === "scaled") return isManager(a);
  if (to === "in_test" || to === "in_reading" || (e.status === "prioritized" && to === "in_design")) {
    return isEditor(a) || isAssignedAgency(a, e);
  }
  return isEditor(a);
}
