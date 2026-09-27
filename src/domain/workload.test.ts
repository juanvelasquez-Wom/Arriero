import { describe, expect, it } from "vitest";
import { computeWorkload, isOverdue, isStale, type WorkloadExperiment } from "./workload";

const today = "2026-09-26";

function exp(over: Partial<WorkloadExperiment>): WorkloadExperiment {
  return {
    id: Math.random().toString(36).slice(2),
    title: "Ejercicio",
    status: "idea",
    owner_id: "ana",
    line_name: "Pospago",
    planned_end: null,
    actual_start: null,
    min_duration_days: null,
    status_changed_at: "2026-09-20T12:00:00Z",
    ...over,
  };
}

const members = [
  { user_id: "ana", name: "Ana", role: "collaborator" as const },
  { user_id: "beto", name: "Beto", role: "agency" as const },
  { user_id: "carla", name: "Carla", role: "viewer" as const },
];

describe("isOverdue / isStale", () => {
  it("vencido: fin planeado pasado y abierto", () => {
    expect(isOverdue({ status: "in_test", planned_end: "2026-09-25" }, today)).toBe(true);
    expect(isOverdue({ status: "in_test", planned_end: "2026-09-26" }, today)).toBe(false);
    expect(isOverdue({ status: "decided", planned_end: "2026-09-01" }, today)).toBe(false);
    expect(isOverdue({ status: "idea", planned_end: null }, today)).toBe(false);
  });
  it("quieta: idea o priorizado sin moverse más de 30 días", () => {
    expect(isStale({ status: "idea", status_changed_at: "2026-08-01T00:00:00Z" }, today)).toBe(true);
    expect(isStale({ status: "prioritized", status_changed_at: "2026-09-10T00:00:00Z" }, today)).toBe(false);
    expect(isStale({ status: "in_design", status_changed_at: "2026-01-01T00:00:00Z" }, today)).toBe(false);
  });
});

describe("computeWorkload", () => {
  const experiments = [
    ...Array.from({ length: 4 }, () => exp({ status: "in_test", owner_id: "ana", actual_start: "2026-09-01", min_duration_days: 14 })),
    exp({ status: "in_design", owner_id: "ana", planned_end: "2026-09-20" }),
    exp({ status: "idea", owner_id: "beto", status_changed_at: "2026-07-01T00:00:00Z" }),
    exp({ status: "prioritized", owner_id: null }),
    exp({ status: "decided", owner_id: "beto" }),
    exp({ status: "in_reading", owner_id: "ex" }),
  ];
  const w = computeWorkload({
    members,
    experiments,
    activity: [
      { actor_id: "ana", created_at: "2026-09-20T10:00:00Z" },
      { actor_id: "ana", created_at: "2026-09-25T10:00:00Z" },
      { actor_id: null, created_at: "2026-09-26T10:00:00Z" },
    ],
    today,
  });

  it("cuenta por persona y marca sobrecarga", () => {
    const ana = w.people.find((p) => p.user_id === "ana")!;
    expect(ana.active).toBe(5);
    expect(ana.inTest).toBe(4);
    expect(ana.byStatus.in_design).toBe(1);
    expect(ana.readyToRead).toHaveLength(4);
    expect(ana.overdue).toHaveLength(1);
    expect(ana.overdue[0].days).toBe(6);
    expect(ana.overloaded).toBe(true);
    expect(ana.lastActivity).toBe("2026-09-25T10:00:00Z");
    expect(w.overloaded.map((p) => p.user_id)).toEqual(["ana"]);
  });

  it("ideas quietas, sin responsable y ex miembros", () => {
    const beto = w.people.find((p) => p.user_id === "beto")!;
    expect(beto.ideas).toBe(1);
    expect(beto.active).toBe(0);
    expect(beto.stale).toHaveLength(1);
    expect(w.people.at(-1)?.user_id).toBeNull();
    expect(w.people.find((p) => p.user_id === "ex")?.name).toBe("Ex miembro del programa");
  });

  it("totales e inactivos (sin contar lectores)", () => {
    expect(w.totals).toEqual({ active: 7, inTest: 4, readyToRead: 4, overdue: 1, stale: 1 });
    expect(w.idle.map((p) => p.user_id)).toEqual(["beto"]);
  });
});
