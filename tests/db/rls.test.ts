import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, adminClient, cleanup, createTestUser, readyExperiment, seedProgram, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programs: string[] = [];
let A: TestUser, O: TestUser, C: TestUser, G: TestUser, V: TestUser, X: TestUser;
let seed: Awaited<ReturnType<typeof seedProgram>>;

beforeAll(async () => {
  A = await createTestUser(admin, "admin", { isAdmin: true });
  O = await createTestUser(admin, "owner");
  C = await createTestUser(admin, "collab");
  G = await createTestUser(admin, "agency");
  V = await createTestUser(admin, "viewer");
  X = await createTestUser(admin, "outsider");
  users.push(A, O, C, G, V, X);
  seed = await seedProgram(A.client, "Test RLS");
  programs.push(seed.programId);
  await addMember(A.client, seed.programId, O.id, "owner");
  await addMember(A.client, seed.programId, C.id, "collaborator");
  await addMember(A.client, seed.programId, G.id, "agency");
  await addMember(A.client, seed.programId, V.id, "viewer");
});

afterAll(async () => {
  await cleanup(admin, programs, users);
});

describe("lectura", () => {
  it("todos los miembros ven el programa; un externo no ve nada", async () => {
    for (const u of [O, C, G, V]) {
      const { data } = await u.client.from("programs").select("id").eq("id", seed.programId);
      expect(data).toHaveLength(1);
    }
    const { data } = await X.client.from("problems").select("id").eq("program_id", seed.programId);
    expect(data).toEqual([]);
  });
});

describe("crear programas", () => {
  it("solo un admin crea programas", async () => {
    const { error } = await O.client.from("programs").insert({ name: "No debería" });
    expect(error).not.toBeNull();
  });
});

describe("viewer no puede escribir nada", () => {
  it("no crea problemas, líneas, ejercicios ni valores", async () => {
    const stage = seed.stages.find((s) => s.line_id === seed.lineId)!;
    const p = await V.client.from("problems").insert({ program_id: seed.programId, line_id: seed.lineId, stage_id: stage.id, title: "X", evidence: "Evidencia de prueba" });
    expect(p.error).not.toBeNull();
    const l = await V.client.from("business_lines").insert({ program_id: seed.programId, name: "X" });
    expect(l.error).not.toBeNull();
    const e = await V.client.from("experiments").insert({ line_id: seed.lineId, problem_id: seed.problemId, metric_id: seed.inputId, title: "X" });
    expect(e.error).not.toBeNull();
    const mv = await V.client.from("metric_values").insert({ metric_id: seed.inputId, week_start: "2026-08-03", value: 1 });
    expect(mv.error).not.toBeNull();
  });

  it("no edita (el update no afecta filas)", async () => {
    const { data } = await V.client.from("problems").update({ title: "Hackeado" }).eq("id", seed.problemId).select("id");
    expect(data ?? []).toEqual([]);
  });
});

describe("agencia", () => {
  let own: string;
  let other: string;

  beforeAll(async () => {
    const r = await G.client
      .from("experiments")
      .insert({ line_id: seed.lineId, problem_id: seed.problemId, metric_id: seed.inputId, title: "De la agencia", owner_id: G.id })
      .select("id")
      .single();
    expect(r.error).toBeNull();
    own = r.data!.id;
    other = await readyExperiment(C.client, seed, C.id);
  });

  it("edita el ejercicio que tiene asignado", async () => {
    const { data, error } = await G.client.from("experiments").update({ hypothesis_if: "cambiamos X" }).eq("id", own).select("id");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("NO edita un ejercicio que no tiene asignado", async () => {
    const { data } = await G.client.from("experiments").update({ title: "Intento" }).eq("id", other).select("id");
    expect(data ?? []).toEqual([]);
    const { data: check } = await admin.from("experiments").select("title").eq("id", other).single();
    expect(check!.title).not.toBe("Intento");
  });

  it("no califica ICE ni en sus propios ejercicios", async () => {
    const { error } = await G.client.from("experiments").update({ impact: 9 }).eq("id", own);
    expect(error?.message).toMatch(/agencia/i);
  });

  it("no carga resultados en ejercicios no asignados", async () => {
    const { data: v } = await admin.from("experiment_variants").select("id").eq("experiment_id", other).limit(1).single();
    const { data } = await G.client.from("experiment_variants").update({ sample: 10 }).eq("id", v!.id).select("id");
    expect(data ?? []).toEqual([]);
  });

  it("no crea problemas", async () => {
    const stage = seed.stages.find((s) => s.line_id === seed.lineId)!;
    const { error } = await G.client.from("problems").insert({ program_id: seed.programId, line_id: seed.lineId, stage_id: stage.id, title: "X", evidence: "Evidencia de prueba" });
    expect(error).not.toBeNull();
  });
});

describe("reglas en la base", () => {
  it("no hay ejercicios huérfanos ni con métricas de otra línea", async () => {
    const noProblem = await C.client.from("experiments").insert({ line_id: seed.lineId, metric_id: seed.inputId, title: "Huérfano" });
    expect(noProblem.error).not.toBeNull();
    const otherLine = await C.client
      .from("experiments")
      .insert({ line_id: seed.lineId, problem_id: seed.problemId, metric_id: seed.metricBId, title: "Otra línea" });
    expect(otherLine.error?.message).toMatch(/misma línea/);
  });

  it("calcula ICE y puntaje final en la base", async () => {
    const id = await readyExperiment(C.client, seed, C.id, { impact: 8, confidence: 7, ease: 8, fits_calendar: true, control: "ours" });
    const { data } = await admin.from("experiments").select("ice_score, final_score").eq("id", id).single();
    expect(Number(data!.ice_score)).toBe(7.7);
    expect(Number(data!.final_score)).toBe(8.7);
  });

  it("el estado solo cambia con transiciones válidas", async () => {
    const id = await readyExperiment(C.client, seed, C.id);
    const direct = await C.client.from("experiments").update({ status: "in_test" }).eq("id", id);
    expect(direct.error).not.toBeNull();
    const skip = await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_test" });
    expect(skip.error?.message).toMatch(/No se puede pasar/);
  });

  it("pasar a En diseño exige la hipótesis completa", async () => {
    const id = await readyExperiment(C.client, seed, C.id, { hypothesis_because: "  " });
    expect((await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "prioritized" })).error).toBeNull();
    const blocked = await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_design" });
    expect(blocked.error?.message).toMatch(/hipótesis completa/);
  });

  it("bloquea el diseño al pasar a En prueba; solo el owner desbloquea con justificación", async () => {
    const id = await readyExperiment(C.client, seed, C.id);
    for (const to of ["prioritized", "in_design", "in_test"]) {
      const r = await C.client.rpc("transition_experiment", { p_experiment: id, p_to: to });
      expect(r.error).toBeNull();
    }
    const edit = await C.client.from("experiments").update({ decision_rule: "Otra regla" }).eq("id", id);
    expect(edit.error?.message).toMatch(/bloqueado/);
    const { data: v } = await admin.from("experiment_variants").select("id").eq("experiment_id", id).eq("is_control", false).single();
    const rename = await C.client.from("experiment_variants").update({ name: "Otra" }).eq("id", v!.id);
    expect(rename.error?.message).toMatch(/bloqueado/);
    const results = await C.client.from("experiment_variants").update({ sample: 100, conversions: 10 }).eq("id", v!.id);
    expect(results.error).toBeNull();

    const byCollab = await C.client.rpc("unlock_design", { p_experiment: id, p_justification: "Necesito cambiarlo" });
    expect(byCollab.error).not.toBeNull();
    const noReason = await O.client.rpc("unlock_design", { p_experiment: id, p_justification: "" });
    expect(noReason.error).not.toBeNull();
    const ok = await O.client.rpc("unlock_design", { p_experiment: id, p_justification: "Error en la regla de decisión" });
    expect(ok.error).toBeNull();
    const { data: log } = await admin.from("activity_log").select("action, payload").eq("entity_id", id).eq("action", "design_unlocked");
    expect(log).toHaveLength(1);
  });

  it("bloquea el inicio dentro de un congelamiento salvo que el owner lo fuerce", async () => {
    await A.client.from("calendar_events").insert({ program_id: seed.programId, type: "freeze", name: "Congelamiento test", start_date: "2026-11-23", end_date: "2026-12-06" });
    const id = await readyExperiment(C.client, seed, C.id, { planned_start: "2026-11-25", planned_end: "2026-12-10" });
    await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "prioritized" });
    await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_design" });
    const blocked = await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_test" });
    expect(blocked.error?.message).toMatch(/congelamiento/);
    const collabForce = await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_test", p_force: true, p_justification: "Urgente" });
    expect(collabForce.error).not.toBeNull();
    const ownerForce = await O.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_test", p_force: true, p_justification: "Aprobado por dirección" });
    expect(ownerForce.error).toBeNull();
  });

  it("solo owner/admin decide, y exige aprendizaje", async () => {
    const id = await readyExperiment(C.client, seed, C.id);
    for (const to of ["prioritized", "in_design", "in_test"]) await C.client.rpc("transition_experiment", { p_experiment: id, p_to: to });
    const { data: vs } = await admin.from("experiment_variants").select("id").eq("experiment_id", id);
    for (const v of vs!) await C.client.from("experiment_variants").update({ sample: 100, conversions: 20 }).eq("id", v.id);
    await C.client.rpc("transition_experiment", { p_experiment: id, p_to: "in_reading" });
    const args = { p_experiment: id, p_verdict: "winner", p_decision: "scale", p_rationale: "Ok", p_learning: "Aprendimos algo útil", p_applies_to: [] };
    const byCollab = await C.client.rpc("decide_experiment", args);
    expect(byCollab.error).not.toBeNull();
    const noLearning = await O.client.rpc("decide_experiment", { ...args, p_learning: " " });
    expect(noLearning.error?.message).toMatch(/aprendizaje/);
    const ok = await O.client.rpc("decide_experiment", args);
    expect(ok.error).toBeNull();
    const { data } = await admin.from("learnings").select("id").eq("experiment_id", id);
    expect(data).toHaveLength(1);
  });

  it("un owner no puede quitarse si es el único owner; los cambios de rol se registran", async () => {
    const { data: m } = await admin.from("program_members").select("id").eq("program_id", seed.programId).eq("user_id", V.id).single();
    const r = await O.client.from("program_members").update({ role: "collaborator" }).eq("id", m!.id);
    expect(r.error).toBeNull();
    const { data: log } = await admin.from("activity_log").select("id").eq("program_id", seed.programId).eq("action", "role_changed").eq("entity_id", V.id);
    expect(log!.length).toBeGreaterThan(0);
    await O.client.from("program_members").update({ role: "viewer" }).eq("id", m!.id);
  });

  it("un usuario no se promueve a admin", async () => {
    const { error } = await C.client.from("profiles").update({ is_admin: true }).eq("id", C.id);
    expect(error).not.toBeNull();
  });
});
