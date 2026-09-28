// Migración 016 (La Recua) contra Supabase. Se salta si no está aplicada.
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { adminClient, cleanup, createTestUser, seedProgram, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
const programIds: string[] = [];
let ready = false;
let owner: TestUser;
let other: TestUser;

beforeAll(async () => {
  const { error } = await admin.rpc("gamification_stats", { p_since: null });
  ready = !error;
  if (!ready) return;
  owner = await createTestUser(admin, "recua-owner", { isAdmin: true });
  other = await createTestUser(admin, "recua-other");
  users.push(owner, other);
  const seeded = await seedProgram(owner.client, "Programa Recua");
  programIds.push(seeded.programId);
});

afterAll(async () => {
  if (!ready) return;
  await cleanup(admin, programIds, users);
});

describe("La Recua (016)", () => {
  it("cualquiera con sesión ve los conteos de los demás, sin detalle", async (ctx) => {
    if (!ready) ctx.skip();
    const { data, error } = await other.client.rpc("gamification_stats", { p_since: null });
    expect(error).toBeNull();
    const row = (data as Record<string, unknown>[]).find((r) => r.user_id === owner.id);
    expect(row).toBeDefined();
    expect(row!.programs_created).toBe(1);
    // Solo conteos: ni títulos ni ids de programas.
    expect(Object.keys(row!).some((k) => /title|program_id|body|text/.test(k))).toBe(false);
  });

  it("el periodo filtra: desde mañana no hay nada", async (ctx) => {
    if (!ready) ctx.skip();
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString();
    const { data } = await other.client.rpc("gamification_stats", { p_since: tomorrow });
    const row = (data as Record<string, unknown>[]).find((r) => r.user_id === owner.id);
    expect(row!.programs_created).toBe(0);
  });

  it("sin sesión no se puede leer", async (ctx) => {
    if (!ready) ctx.skip();
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false },
    });
    const { error } = await anon.rpc("gamification_stats", { p_since: null });
    expect(error).not.toBeNull();
  });
});
