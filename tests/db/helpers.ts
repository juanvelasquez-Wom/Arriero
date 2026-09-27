// Utilidades para los tests de integración. Las credenciales vienen de .env.local
// (nunca se escriben aquí). Todo lo que se crea se borra en cleanup().
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const TEST_EMAIL_DOMAIN = "growth-tests.example";

function env(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name} en .env.local para correr los tests de base de datos.`);
  return v;
}

export function adminClient(): SupabaseClient {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export interface TestUser {
  id: string;
  email: string;
  client: SupabaseClient;
}

const run = Math.random().toString(36).slice(2, 8);

/** Crea un usuario de prueba con contraseña aleatoria y devuelve su cliente autenticado. */
export async function createTestUser(admin: SupabaseClient, label: string, opts: { isAdmin?: boolean } = {}): Promise<TestUser> {
  const email = `${label}-${run}@${TEST_EMAIL_DOMAIN}`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: `Test ${label}` },
    app_metadata: { test: true },
  });
  if (error || !data.user) throw new Error(`createUser ${label}: ${error?.message}`);
  if (opts.isAdmin) {
    const { error: e } = await admin.from("profiles").update({ is_admin: true }).eq("id", data.user.id);
    if (e) throw new Error(`promote ${label}: ${e.message}`);
  }
  const client = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw new Error(`signIn ${label}: ${signInError.message}`);
  return { id: data.user.id, email, client };
}

/** Borra programas (en cascada) y usuarios de prueba. */
export async function cleanup(admin: SupabaseClient, programIds: string[], users: TestUser[]) {
  for (const id of programIds) {
    await admin.from("activity_log").delete().eq("program_id", id);
    await admin.from("programs").delete().eq("id", id);
  }
  for (const u of users) await admin.auth.admin.deleteUser(u.id);
}

export function unwrap<T>(r: { data: T | null; error: { message: string } | null }, what = "query"): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data as T;
}

/** Programa mínimo: línea (con sus 4 etapas), métrica norte + entrada, un problema. */
export async function seedProgram(owner: SupabaseClient, name: string) {
  const program = unwrap(await owner.from("programs").insert({ name }).select("id").single(), "program") as { id: string };
  const line = unwrap(
    await owner.from("business_lines").insert({ program_id: program.id, name: "Línea A" }).select("id").single(),
    "line",
  ) as { id: string };
  const lineB = unwrap(
    await owner.from("business_lines").insert({ program_id: program.id, name: "Línea B" }).select("id").single(),
    "lineB",
  ) as { id: string };
  const stages = unwrap(
    await owner.from("funnel_stages").select("id, name, line_id").eq("program_id", program.id).order("sort_order"),
    "stages",
  ) as { id: string; name: string; line_id: string }[];
  const ns = unwrap(
    await owner.from("metrics").insert({ line_id: line.id, type: "north_star", name: "Norte A", unit: "u" }).select("id").single(),
    "ns",
  ) as { id: string };
  const input = unwrap(
    await owner
      .from("metrics")
      .insert({ line_id: line.id, parent_id: ns.id, type: "input", branch: "conversion", name: "Entrada A", unit: "%" })
      .select("id")
      .single(),
    "input",
  ) as { id: string };
  const metricB = unwrap(
    await owner.from("metrics").insert({ line_id: lineB.id, type: "north_star", name: "Norte B" }).select("id").single(),
    "metricB",
  ) as { id: string };
  const stageA = stages.find((s) => s.line_id === line.id)!;
  const problem = unwrap(
    await owner
      .from("problems")
      .insert({ program_id: program.id, line_id: line.id, stage_id: stageA.id, title: "Problema A", evidence: "Evidencia suficiente" })
      .select("id")
      .single(),
    "problem",
  ) as { id: string };
  const problem2 = unwrap(
    await owner
      .from("problems")
      .insert({ program_id: program.id, line_id: line.id, stage_id: stageA.id, title: "Problema A2", evidence: "Otra evidencia" })
      .select("id")
      .single(),
    "problem2",
  ) as { id: string };
  return { programId: program.id, lineId: line.id, lineBId: lineB.id, stages, nsId: ns.id, inputId: input.id, metricBId: metricB.id, problemId: problem.id, problem2Id: problem2.id };
}

export async function addMember(owner: SupabaseClient, programId: string, userId: string, role: string) {
  unwrap(await owner.from("program_members").insert({ program_id: programId, user_id: userId, role }), `member ${role}`);
}

/** Ejercicio listo para pasar a En prueba (ICE, diseño y variantes completos). */
export async function readyExperiment(
  client: SupabaseClient,
  seed: Awaited<ReturnType<typeof seedProgram>>,
  ownerId: string,
  overrides: Record<string, unknown> = {},
) {
  const exp = unwrap(
    await client
      .from("experiments")
      .insert({
        line_id: seed.lineId,
        problem_id: seed.problemId,
        metric_id: seed.inputId,
        title: `Ejercicio ${Math.random().toString(36).slice(2, 6)}`,
        impact: 7,
        confidence: 6,
        ease: 8,
        hypothesis_if: "cambiamos el mensaje",
        hypothesis_then: "sube la entrada",
        hypothesis_because: "el cliente entiende mejor la oferta",
        fits_calendar: true,
        test_type: "ab",
        primary_metric: "Entrada A",
        min_duration_days: 14,
        decision_rule: "Escalar si mejora 10%",
        owner_id: ownerId,
        planned_start: "2026-10-05",
        planned_end: "2026-10-25",
        ...overrides,
      })
      .select("id")
      .single(),
    "experiment",
  ) as { id: string };
  unwrap(
    await client.from("experiment_variants").insert([
      { experiment_id: exp.id, name: "Control", is_control: true },
      { experiment_id: exp.id, name: "Variante", is_control: false },
    ]),
    "variants",
  );
  return exp.id;
}
