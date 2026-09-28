// Migración 017 (carriel de insights) contra Supabase. Se salta si no está aplicada.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanup, createTestUser, seedProgram, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programIds: string[] = [];
let ready = false;
let owner: TestUser;
let author: TestUser;
let insightId = "";

beforeAll(async () => {
  const { error } = await admin.from("insights").select("id").limit(1);
  ready = !error;
  if (!ready) return;
  owner = await createTestUser(admin, "ins-owner", { isAdmin: true });
  author = await createTestUser(admin, "ins-author");
  users.push(owner, author);
  const seeded = await seedProgram(owner.client, "Programa Insights");
  programIds.push(seeded.programId);
});

afterAll(async () => {
  if (!ready) return;
  await admin.from("insights").delete().in("created_by", users.map((u) => u.id));
  await cleanup(admin, programIds, users);
});

describe("carriel de insights (017)", () => {
  it("cualquiera con sesión anota y todos lo ven", async (ctx) => {
    if (!ready) ctx.skip();
    const { data, error } = await author.client
      .from("insights")
      .insert({ title: "La gente pregunta el precio antes de saludar", source: "customer" })
      .select("id")
      .single();
    expect(error).toBeNull();
    insightId = data!.id as string;
    const seen = await owner.client.from("insights").select("id").eq("id", insightId);
    expect(seen.data).toHaveLength(1);
  });

  it("nadie marca «Sembrado» a mano ni edita lo ajeno", async (ctx) => {
    if (!ready || !insightId) ctx.skip();
    const planted = await author.client.from("insights").update({ status: "planted" }).eq("id", insightId);
    expect(planted.error).not.toBeNull();
    const other = await createTestUser(admin, "ins-other");
    users.push(other);
    const edited = await other.client.from("insights").update({ title: "Editado por otro" }).eq("id", insightId).select("id");
    expect(edited.data ?? []).toHaveLength(0);
  });

  it("votar suma y sembrar en un problema lo deja vinculado", async (ctx) => {
    if (!ready || !insightId) ctx.skip();
    expect((await owner.client.from("insight_votes").insert({ insight_id: insightId })).error).toBeNull();
    const { data: problem } = await owner.client.from("problems").select("id").eq("program_id", programIds[0]).limit(1).single();
    // El autor no es miembro del programa: no puede sembrar ahí.
    const denied = await author.client.rpc("link_insight", { p_insight: insightId, p_problem: problem!.id });
    expect(denied.error).not.toBeNull();
    const linked = await owner.client.rpc("link_insight", { p_insight: insightId, p_problem: problem!.id });
    expect(linked.error).toBeNull();
    const { data } = await author.client.from("insights").select("status, problem_id, program_id").eq("id", insightId).single();
    expect(data).toMatchObject({ status: "planted", problem_id: problem!.id, program_id: programIds[0] });
    const stats = await author.client.rpc("gamification_stats", { p_since: null });
    const row = (stats.data as Record<string, number | string>[]).find((r) => r.user_id === author.id);
    expect(row).toMatchObject({ insights_created: 1, insights_planted: 1, insight_votes_received: 1 });
  });

  it("solo el autor (o un admin) borra", async (ctx) => {
    if (!ready || !insightId) ctx.skip();
    const other = users.find((u) => u.email.includes("ins-other"))!;
    expect((await other.client.rpc("delete_insight", { p_insight: insightId })).error).not.toBeNull();
    expect((await author.client.rpc("delete_insight", { p_insight: insightId })).error).toBeNull();
    const gone = await owner.client.from("insights").select("id").eq("id", insightId);
    expect(gone.data).toHaveLength(0);
  });
});
