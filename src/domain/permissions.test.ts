import { describe, expect, it } from "vitest";
import { can } from "./permissions";
import type { Actor } from "./types";

const admin: Actor = { userId: "a", isAdmin: true, role: null };
const owner: Actor = { userId: "o", isAdmin: false, role: "owner" };
const collab: Actor = { userId: "c", isAdmin: false, role: "collaborator" };
const agency: Actor = { userId: "g", isAdmin: false, role: "agency" };
const viewer: Actor = { userId: "v", isAdmin: false, role: "viewer" };

describe("matriz de permisos", () => {
  it("crear programas y el ejemplo: solo admin", () => {
    expect([admin, owner, collab, agency, viewer].map(can.createProgram)).toEqual([true, false, false, false, false]);
    expect([admin, owner].map(can.manageDemo)).toEqual([true, false]);
  });

  it("invitar y decidir: admin y owner", () => {
    expect([admin, owner, collab, agency, viewer].map(can.manageMembers)).toEqual([true, true, false, false, false]);
    expect([admin, owner, collab, agency, viewer].map(can.decide)).toEqual([true, true, false, false, false]);
  });

  it("editar estructura, cargar valores, crear problemas y calificar ICE: hasta collaborator", () => {
    for (const fn of [can.editStructure, can.loadMetricValues, can.createProblem, can.scoreIce]) {
      expect([admin, owner, collab, agency, viewer].map(fn)).toEqual([true, true, true, false, false]);
    }
  });

  it("crear ejercicios: también la agencia", () => {
    expect([admin, owner, collab, agency, viewer].map(can.createExperiment)).toEqual([true, true, true, true, false]);
  });

  it("la agencia edita y carga resultados solo en los asignados", () => {
    expect(can.editExperiment(agency, { owner_id: "g" })).toBe(true);
    expect(can.editExperiment(agency, { owner_id: "otro" })).toBe(false);
    expect(can.uploadResults(agency, { owner_id: "g" })).toBe(true);
    expect(can.uploadResults(viewer, { owner_id: "v" })).toBe(false);
  });

  it("borrar ejercicios según estado y creador", () => {
    const early = { status: "in_design" as const, created_by: "g", owner_id: null };
    const launched = { status: "in_test" as const, created_by: "c", owner_id: null };
    expect(can.deleteExperiment(agency, early)).toBe(true);
    expect(can.deleteExperiment(agency, { ...early, created_by: "c" })).toBe(false);
    expect(can.deleteExperiment(collab, { ...early, created_by: "c" })).toBe(true);
    expect(can.deleteExperiment(collab, launched)).toBe(false);
    expect(can.deleteExperiment(owner, launched)).toBe(true);
    expect(can.deleteExperiment(admin, launched)).toBe(true);
    expect(can.deleteExperiment(viewer, { ...early, created_by: "v" })).toBe(false);
  });

  it("borrar estructura, restaurar y vaciar papelera: admin y owner", () => {
    for (const fn of [can.deleteStructure, can.restore, can.emptyTrash, can.deleteProgram]) {
      expect([admin, owner, collab, agency, viewer].map(fn)).toEqual([true, true, false, false, false]);
    }
  });
});
