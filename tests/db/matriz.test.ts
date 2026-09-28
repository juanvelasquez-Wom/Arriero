// Migración 014 (matriz de hallazgos) contra Supabase. Se salta si no está aplicada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanup, createTestUser, seedProgram, unwrap, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programIds: string[] = [];
const pilotIds: string[] = [];
let ready = false;
let owner: TestUser;
let creatorA: TestUser;
let creatorB: TestUser;

beforeAll(async () => {
  const { error } = await admin.from("experiment_guardrails").select("id").limit(1);
  ready = !error;
  if (!ready) return;
  owner = await createTestUser(admin, "m14-owner", { isAdmin: true });
  creatorA = await createTestUser(admin, "m14-creator-a");
  creatorB = await createTestUser(admin, "m14-creator-b");
  users.push(owner, creatorA, creatorB);
  unwrap(await admin.from("pilot_roles").insert([
    { user_id: creatorA.id, role: "creator" },
    { user_id: creatorB.id, role: "creator" },
  ]), "roles");
});

afterAll(async () => {
  if (!ready) return;
  if (pilotIds.length) {
    await admin.from("pilots").delete().in("id", pilotIds);
    await admin.from("pilot_audit").delete().in("pilot_id", pilotIds);
  }
  await admin.from("tia_usage").delete().in("user_id", users.map((u) => u.id));
  await cleanup(admin, programIds, users);
});

describe("matriz de hallazgos (014)", () => {
  it("un creador no edita el piloto de otro creador", async (ctx) => {
    if (!ready) ctx.skip();
    const p = unwrap(await creatorA.client.from("pilots").insert({ title: "Piloto de A", problem: "Algo pasa en medios" }).select("id, updated_at").single(), "pilot") as {
      id: string;
      updated_at: string;
    };
    pilotIds.push(p.id);
    const { data: hacked } = await creatorB.client.from("pilots").update({ title: "hack" }).eq("id", p.id).select("id");
    expect(hacked).toEqual([]);
    const { error } = await creatorB.client.from("pilot_arms").insert({ pilot_id: p.id, name: "X", is_control: true });
    expect(error).not.toBeNull();

    // Guardado atómico con bloqueo optimista.
    const saved = await creatorA.client.rpc("save_pilot_design", {
      p_pilot: p.id,
      p_expected_updated_at: p.updated_at,
      p_fields: { test_type: "ab_platform", design_config: { granularity: "day" } },
      p_arms: [
        { name: "Control", is_control: true, split_pct: 50, cities: [] },
        { name: "B", is_control: false, split_pct: 50, cities: [] },
      ],
      p_media: [],
    });
    expect(saved.error).toBeNull();
    const stale = await creatorA.client.rpc("save_pilot_design", {
      p_pilot: p.id,
      p_expected_updated_at: "2020-01-01T00:00:00Z",
      p_fields: {},
      p_arms: [],
      p_media: [],
    });
    expect(stale.error?.message).toMatch(/Otra persona/);
  });

  it("La Tía reserva el cupo de forma atómica", async (ctx) => {
    if (!ready) ctx.skip();
    const first = await creatorA.client.rpc("tia_reserve", { p_program: null, p_feature: "chat", p_limit: 1 });
    const second = await creatorA.client.rpc("tia_reserve", { p_program: null, p_feature: "chat", p_limit: 1 });
    expect(first.data).toBeTruthy();
    expect(second.data).toBeNull();
  });

  it("guardrails del ejercicio: de la misma línea y bloqueados con el diseño", async (ctx) => {
    if (!ready) ctx.skip();
    const seed = await seedProgram(owner.client, "Programa 014");
    programIds.push(seed.programId);
    const exp = unwrap(
      await owner.client
        .from("experiments")
        .insert({ line_id: seed.lineId, problem_id: seed.problemId, metric_id: seed.inputId, title: "Con guardrail" })
        .select("id")
        .single(),
      "exp",
    ) as { id: string };
    const ok = await owner.client.from("experiment_guardrails").insert({ experiment_id: exp.id, metric_id: seed.nsId, limit_pct: 10 });
    expect(ok.error).toBeNull();
    const wrong = await owner.client.from("experiment_guardrails").insert({ experiment_id: exp.id, metric_id: seed.metricBId, limit_pct: 10 });
    expect(wrong.error?.message).toMatch(/misma línea/);
  });
});
