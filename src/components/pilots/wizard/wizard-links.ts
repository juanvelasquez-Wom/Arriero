import type { PilotStepKey } from "@/domain/pilots/flow";

export function pilotStepHref(pilotId: string, step: PilotStepKey) {
  return `/pilotos/${pilotId}/editar?paso=${step}`;
}
