import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, adminClient, cleanup, createTestUser, readyExperiment, seedProgram, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programs: string[] = [];
let A: TestUser, O: TestUser, C: TestUser, G: TestUser;

beforeAll(async () => {
  A = await createTestUser(admin, "del-admin", { isAdmin: true });
  O = await createTestUser(admin, "del-owner");
  C = await createTestUser(admin, "del-collab");
  G = await createTestUser(admin, "del-agency");
  users.push(A, O, C, G);
});

afterAll(async () => {
  await cleanup(admin, programs, users);
});

async function freshProgram(name: string) {
  const seed = await seedProgram(A.client, name);
  programs.push(seed.programId);
  await addMember(A.client, seed.programId, O.id, "owner");
  await addMember(A.client, seed.programId, C.id, "collaborator");
  await addMember(A.client, seed.programId, G.id, "agency");
  return seed;
}

const visible = async (client: TestUser["client"], table: string, id: string) =>
  ((await client.from(table).select("id").eq("id", id)).data ?? []).length === 1;

describe("borrado lógico y restauración", () => {
  it("borrar un ejercicio lo oculta, lo manda a la papelera con sus variantes y se restaura", async () => {
    const seed = await freshProgram("Del ejercicio");
    const id = await readyExperiment(C.client, seed, C.id);
    const del = await C.client.rpc("delete_experiment", { p_id: id });
    expect(del.error).toBeNull();
    expect(await visible(C.client, "experiments", id)).toBe(false);
    const { data: vs } = await C.client.from("experiment_variants").select("id").eq("experiment_id", id);
    expect(vs).toEqual([]);
    const { data: trash } = await O.client.from("trash_items").select("id, entity_type").eq("entity_id", id);
    expect(trash).toHaveLength(1);
    // Solo quien puede restaurar ve la papelera.
    const { data: trashAsCollab } = await C.client.from("trash_items").select("id").eq("entity_id", id);
    expect(trashAsCollab).toEqual([]);
    const restoreByCollab = await C.client.rpc("restore_trash_item", { p_trash: trash![0].id });
    expect(restoreByCollab.error).not.toBeNull();
    const restore = await O.client.rpc("restore_trash_item", { p_trash: trash![0].id });
    expect(restore.error).toBeNull();
    expect(await visible(C.client, "experiments", id)).toBe(true);
    const { data: vs2 } = await C.client.from("experiment_variants").select("id").eq("experiment_id", id);
    expect(vs2).toHaveLength(2);
    const { data: log } = await admin.from("activity_log").select("action").eq("entity_id", id).in("action", ["deleted", "restored"]);
    expect(log!.map((l) => l.action).sort()).toEqual(["deleted", "restored"]);
  });

  it("la agencia no puede borrar lo que no creó; sí lo suyo en estados tempranos", async () => {
    const seed = await freshProgram("Del agencia");
    const byCollab = await readyExperiment(C.client, seed, C.id);
    const denied = await G.client.rpc("delete_experiment", { p_id: byCollab });
    expect(denied.error).not.toBeNull();
    const own = await G.client
      .from("experiments")
      .insert({ line_id: seed.lineId, problem_id: seed.problemId, metric_id: seed.inputId, title: "Propio", owner_id: G.id })
      .select("id")
      .single();
    const ok = await G.client.rpc("delete_experiment", { p_id: own.data!.id });
    expect(ok.error).toBeNull();
  });

  it("un ejercicio En prueba solo lo borra el owner o un admin", async () => {
    const seed = await freshProgram("Del en prueba");
    const id = await readyExperiment(C.client, seed, C.id);
    for (const to of ["prioritized", "in_design", "in_test"]) await C.client.rpc("transition_experiment", { p_experiment: id, p_to: to });
    expect((await C.client.rpc("delete_experiment", { p_id: id })).error).not.toBeNull();
    expect((await O.client.rpc("delete_experiment", { p_id: id })).error).toBeNull();
  });

  it("borrar una línea borra en cascada todo lo que cuelga de ella, y se restaura completa", async () => {
    const seed = await freshProgram("Del línea");
    const id = await readyExperiment(C.client, seed, C.id);
    await C.client.from("metric_values").insert({ metric_id: seed.inputId, week_start: "2026-08-03", value: 10 });
    const impact = await O.client.rpc("deletion_impact", { p_entity_type: "line", p_id: seed.lineId });
    expect(impact.data).toMatchObject({ problems: 2, experiments: 1, stages: 4, metric_values: 1, variants: 2 });
    expect((await C.client.rpc("delete_line", { p_id: seed.lineId })).error).not.toBeNull();
    expect((await O.client.rpc("delete_line", { p_id: seed.lineId })).error).toBeNull();
    for (const [table, key] of [
      ["problems", seed.problemId],
      ["experiments", id],
      ["metrics", seed.inputId],
      ["business_lines", seed.lineId],
    ] as const) {
      expect(await visible(C.client, table, key)).toBe(false);
    }
    const { data: stages } = await C.client.from("funnel_stages").select("id").eq("line_id", seed.lineId);
    expect(stages).toEqual([]);
    // La otra línea no se toca.
    expect(await visible(C.client, "business_lines", seed.lineBId)).toBe(true);

    const { data: trash } = await O.client.from("trash_items").select("id").eq("entity_id", seed.lineId).single();
    expect((await O.client.rpc("restore_trash_item", { p_trash: trash!.id })).error).toBeNull();
    expect(await visible(C.client, "experiments", id)).toBe(true);
    const { data: stagesBack } = await C.client.from("funnel_stages").select("id").eq("line_id", seed.lineId);
    expect(stagesBack).toHaveLength(4);
    const { data: values } = await C.client.from("metric_values").select("id").eq("metric_id", seed.inputId);
    expect(values).toHaveLength(1);
  });

  it("borrar un problema con ejercicios obliga a elegir: reasignar o borrar juntos", async () => {
    const seed = await freshProgram("Del problema");
    const id = await readyExperiment(C.client, seed, C.id);
    const noChoice = await O.client.rpc("delete_problem", { p_id: seed.problemId });
    expect(noChoice.error?.message).toMatch(/reasignarlos o borrarlos/);
    const reassign = await O.client.rpc("delete_problem", { p_id: seed.problemId, p_strategy: "reassign", p_target: seed.problem2Id });
    expect(reassign.error).toBeNull();
    const { data: moved } = await C.client.from("experiments").select("problem_id").eq("id", id).single();
    expect(moved!.problem_id).toBe(seed.problem2Id);

    const cascade = await O.client.rpc("delete_problem", { p_id: seed.problem2Id, p_strategy: "cascade" });
    expect(cascade.error).toBeNull();
    expect(await visible(C.client, "experiments", id)).toBe(false);
  });

  it("borrar una métrica con ejercicios también exige reasignar o borrar", async () => {
    const seed = await freshProgram("Del métrica");
    const id = await readyExperiment(C.client, seed, C.id);
    const noChoice = await O.client.rpc("delete_metric", { p_id: seed.inputId });
    expect(noChoice.error).not.toBeNull();
    const ok = await O.client.rpc("delete_metric", { p_id: seed.inputId, p_strategy: "reassign", p_target: seed.nsId });
    expect(ok.error).toBeNull();
    const { data } = await C.client.from("experiments").select("metric_id").eq("id", id).single();
    expect(data!.metric_id).toBe(seed.nsId);
  });

  it("la eliminación definitiva borra las filas; el programa exige su nombre", async () => {
    const seed = await freshProgram("Del definitivo");
    const id = await readyExperiment(C.client, seed, C.id);
    await O.client.rpc("delete_experiment", { p_id: id });
    const { data: trash } = await O.client.from("trash_items").select("id").eq("entity_id", id).single();
    expect((await C.client.rpc("purge_trash_item", { p_trash: trash!.id })).error).not.toBeNull();
    expect((await O.client.rpc("purge_trash_item", { p_trash: trash!.id })).error).toBeNull();
    const { data: gone } = await admin.from("experiments").select("id").eq("id", id);
    expect(gone).toEqual([]);
    const { data: variants } = await admin.from("experiment_variants").select("id").eq("experiment_id", id);
    expect(variants).toEqual([]);

    const wrongName = await O.client.rpc("delete_program", { p_id: seed.programId, p_confirm_name: "otro" });
    expect(wrongName.error).not.toBeNull();
    const ok = await O.client.rpc("delete_program", { p_id: seed.programId, p_confirm_name: "Del definitivo" });
    expect(ok.error).toBeNull();
    expect(await visible(O.client, "programs", seed.programId)).toBe(false);
  });
});
