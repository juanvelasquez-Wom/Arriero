// Migración 018 (lluvia de ideas) contra Supabase. Se salta si no está aplicada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanup, createTestUser, seedProgram, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programIds: string[] = [];
let ready = false;
let owner: TestUser; // admin: arma el aguacero y crea el programa
let guest: TestUser; // participa
let sessionId = "";
let ownerIdea = "";
let guestIdea = "";

beforeAll(async () => {
  const { error } = await admin.from("idea_sessions").select("id").limit(1);
  ready = !error;
  if (!ready) return;
  owner = await createTestUser(admin, "ideas-owner", { isAdmin: true });
  guest = await createTestUser(admin, "ideas-guest");
  users.push(owner, guest);
});

afterAll(async () => {
  if (!ready) return;
  await admin.from("insights").delete().in("created_by", users.map((u) => u.id));
  await admin.from("idea_sessions").delete().in("created_by", users.map((u) => u.id));
  await cleanup(admin, programIds, users);
});

describe("lluvia de ideas (018)", () => {
  it("cualquiera anota mientras llueve y no se puntúa todavía", async (ctx) => {
    if (!ready) ctx.skip();
    const s = await owner.client.from("idea_sessions").insert({ title: "¿Cómo subimos las portabilidades en diciembre?" }).select("id").single();
    expect(s.error).toBeNull();
    sessionId = s.data!.id as string;
    const a = await owner.client.from("ideas").insert({ session_id: sessionId, title: "Regalar el primer mes" }).select("id").single();
    const b = await guest.client.from("ideas").insert({ session_id: sessionId, title: "Portabilidad sin cédula", anonymous: true }).select("id").single();
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    ownerIdea = a.data!.id as string;
    guestIdea = b.data!.id as string;
    const early = await guest.client.rpc("score_idea", { p_idea: ownerIdea, p_impact: 4, p_ease: 4 });
    expect(early.error).not.toBeNull();
  });

  it("solo quien lo armó cambia la fase, y nadie la cambia con un update", async (ctx) => {
    if (!ready || !sessionId) ctx.skip();
    expect((await guest.client.rpc("set_idea_session_phase", { p_session: sessionId, p_phase: "voting" })).error).not.toBeNull();
    expect((await owner.client.from("idea_sessions").update({ phase: "voting" }).eq("id", sessionId)).error).not.toBeNull();
    expect((await owner.client.rpc("set_idea_session_phase", { p_session: sessionId, p_phase: "voting" })).error).toBeNull();
  });

  it("puntaje a ciegas, sin la idea propia y con máximo 3 favoritas", async (ctx) => {
    if (!ready || !sessionId) ctx.skip();
    expect((await guest.client.rpc("score_idea", { p_idea: ownerIdea, p_impact: 5, p_ease: 4, p_favorite: true })).error).toBeNull();
    expect((await guest.client.rpc("score_idea", { p_idea: ownerIdea, p_ease: 2 })).error).toBeNull();
    expect((await guest.client.rpc("score_idea", { p_idea: guestIdea, p_impact: 5, p_ease: 5 })).error).not.toBeNull();
    expect((await owner.client.rpc("score_idea", { p_idea: guestIdea, p_impact: 3, p_ease: 3 })).error).toBeNull();
    const mine = await guest.client.from("idea_scores").select("idea_id, impact, ease");
    expect(mine.data).toEqual([{ idea_id: ownerIdea, impact: 5, ease: 2 }]);
  });

  it("se decide al cerrar: proyecto vinculado e insight en el carriel", async (ctx) => {
    if (!ready || !sessionId) ctx.skip();
    expect((await owner.client.rpc("decide_idea", { p_idea: ownerIdea, p_decision: "project" })).error).not.toBeNull();
    expect((await owner.client.rpc("set_idea_session_phase", { p_session: sessionId, p_phase: "closed" })).error).toBeNull();
    expect((await guest.client.rpc("decide_idea", { p_idea: ownerIdea, p_decision: "project" })).error).not.toBeNull();
    expect((await owner.client.rpc("decide_idea", { p_idea: ownerIdea, p_decision: "project" })).error).toBeNull();
    const insight = await owner.client.rpc("decide_idea", { p_idea: guestIdea, p_decision: "insight" });
    expect(insight.error).toBeNull();
    expect(typeof insight.data).toBe("string");

    const seeded = await seedProgram(owner.client, "Programa Ideas");
    programIds.push(seeded.programId);
    expect((await guest.client.rpc("link_idea", { p_idea: ownerIdea, p_program: seeded.programId })).error).not.toBeNull();
    expect((await owner.client.rpc("link_idea", { p_idea: ownerIdea, p_program: seeded.programId })).error).toBeNull();

    const stats = await guest.client.rpc("gamification_stats", { p_since: null });
    const row = (stats.data as Record<string, number | string>[]).find((r) => r.user_id === guest.id);
    expect(row).toMatchObject({ ideas_created: 1, ideas_scored: 1, ideas_chosen: 1 });
    const ownerRow = (stats.data as Record<string, number | string>[]).find((r) => r.user_id === owner.id);
    expect(ownerRow).toMatchObject({ idea_sessions_created: 1, ideas_chosen: 1 });
  });

  it("solo quien lo armó (o un admin) borra el aguacero", async (ctx) => {
    if (!ready || !sessionId) ctx.skip();
    expect((await guest.client.rpc("delete_idea_session", { p_session: sessionId })).error).not.toBeNull();
    expect((await owner.client.rpc("delete_idea_session", { p_session: sessionId })).error).toBeNull();
    const gone = await guest.client.from("idea_sessions").select("id").eq("id", sessionId);
    expect(gone.data).toHaveLength(0);
  });
});
