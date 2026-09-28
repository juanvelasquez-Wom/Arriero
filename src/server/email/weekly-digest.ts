import "server-only";

import { addDays, todayIso, weekStart } from "@/domain/dates";
import {
  buildDigest,
  pilotsEndingThisWeek,
  programDigestFacts,
  renderDigestHtml,
  renderDigestText,
  type DigestExperimentInput,
  type DigestNorthStarInput,
  type DigestPilot,
  type DigestProgramFacts,
  type DigestRole,
} from "@/domain/digest";
import type { TargetHorizon } from "@/domain/targets";
import type { ExperimentStatus, MetricDirection, ProgramRole } from "@/domain/types";
import { publicEnv } from "@/lib/env";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { emailConfigured, sendEmail } from "./mailer";

// Resumen semanal por correo (lunes, desde el cron de avisos). Corre sin
// sesión con el cliente admin (solo aquí, en el cron): por eso cada consulta
// filtra a mano lo borrado, y cada persona recibe SOLO lo de los programas
// donde es miembro (o todos si es admin global).

export interface DigestRunResult {
  recipients: number;
  sent: number;
  skipped: number;
  failed: number;
}

type Row = Record<string, unknown>;
const PAGE = 1000;
/** Semanas de valores que se leen para el semáforo de la métrica norte. */
const VALUE_WEEKS = 26;
const OPEN_STATUSES: ExperimentStatus[] = ["idea", "prioritized", "in_design", "in_test", "in_reading"];

async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>) {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as Row[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

interface ProgramData {
  program: { id: string; name: string; start_date: string | null };
  metrics: { id: string; name: string }[];
  loadedLastWeek: Set<string>;
  experiments: DigestExperimentInput[];
  northStars: DigestNorthStarInput[];
  horizons: TargetHorizon[];
}

async function loadPrograms(admin: AdminSupabase, today: string): Promise<ProgramData[]> {
  const programs = await fetchAll((a, b) =>
    admin
      .from("programs")
      .select("id, name, start_date, end_date")
      .eq("is_demo", false)
      .is("deleted_at", null)
      .or(`end_date.is.null,end_date.gte.${today}`)
      .order("id")
      .range(a, b),
  );
  if (!programs.length) return [];
  const ids = programs.map((p) => p.id as string);
  const lastWeek = addDays(weekStart(today), -7);
  const since = addDays(today, -7 * VALUE_WEEKS);

  const [horizons, lines, metrics, targets, experiments] = await Promise.all([
    fetchAll((a, b) => admin.from("program_horizons").select("id, program_id, name, start_date, end_date").in("program_id", ids).order("id").range(a, b)),
    fetchAll((a, b) => admin.from("business_lines").select("id, program_id, name").in("program_id", ids).is("deleted_at", null).order("id").range(a, b)),
    fetchAll((a, b) =>
      admin
        .from("metrics")
        .select("id, program_id, line_id, type, name, direction, baseline")
        .in("program_id", ids)
        .is("deleted_at", null)
        .order("id")
        .range(a, b),
    ),
    fetchAll((a, b) => admin.from("metric_targets").select("metric_id, horizon_id, target").in("program_id", ids).order("id").range(a, b)),
    fetchAll((a, b) =>
      admin
        .from("experiments")
        .select("id, program_id, line_id, title, owner_id, status, status_changed_at, actual_start, min_duration_days")
        .in("program_id", ids)
        .in("status", OPEN_STATUSES)
        .is("deleted_at", null)
        .order("id")
        .range(a, b),
    ),
  ]);

  const lineName = new Map(lines.map((l) => [l.id as string, l.name as string]));
  const liveMetrics = metrics.filter((m) => lineName.has(m.line_id as string));
  const northIds = liveMetrics.filter((m) => m.type === "north_star").map((m) => m.id as string);

  const [lastWeekValues, northValues] = await Promise.all([
    fetchAll((a, b) =>
      admin.from("metric_values").select("metric_id").in("program_id", ids).eq("week_start", lastWeek).is("deleted_at", null).order("id").range(a, b),
    ),
    northIds.length
      ? fetchAll((a, b) =>
          admin
            .from("metric_values")
            .select("metric_id, week_start, value")
            .in("metric_id", northIds)
            .gte("week_start", since)
            .is("deleted_at", null)
            .order("id")
            .range(a, b),
        )
      : Promise.resolve([] as Row[]),
  ]);

  const loaded = new Set(lastWeekValues.map((v) => v.metric_id as string));
  const valuesBy = new Map<string, { week_start: string; value: number }[]>();
  for (const v of northValues) {
    const list = valuesBy.get(v.metric_id as string) ?? [];
    list.push({ week_start: v.week_start as string, value: Number(v.value) });
    valuesBy.set(v.metric_id as string, list);
  }
  const targetsBy = new Map<string, { horizon_id: string; target: number }[]>();
  for (const t of targets) {
    const list = targetsBy.get(t.metric_id as string) ?? [];
    list.push({ horizon_id: t.horizon_id as string, target: Number(t.target) });
    targetsBy.set(t.metric_id as string, list);
  }

  return programs.map((p) => {
    const pid = p.id as string;
    const pm = liveMetrics.filter((m) => m.program_id === pid);
    return {
      program: { id: pid, name: p.name as string, start_date: (p.start_date as string | null) ?? null },
      metrics: pm.map((m) => ({ id: m.id as string, name: m.name as string })),
      loadedLastWeek: loaded,
      experiments: experiments
        .filter((e) => e.program_id === pid && lineName.has(e.line_id as string))
        .map((e) => ({
          id: e.id as string,
          title: e.title as string,
          line_name: lineName.get(e.line_id as string) ?? "",
          owner_id: (e.owner_id as string | null) ?? null,
          status: e.status as ExperimentStatus,
          status_changed_at: e.status_changed_at as string,
          actual_start: (e.actual_start as string | null) ?? null,
          min_duration_days: (e.min_duration_days as number | null) ?? null,
        })),
      northStars: pm
        .filter((m) => m.type === "north_star")
        .map((m) => ({
          metric_id: m.id as string,
          metric_name: m.name as string,
          line_id: m.line_id as string,
          line_name: lineName.get(m.line_id as string) ?? "",
          direction: m.direction as MetricDirection,
          baseline: m.baseline == null ? null : Number(m.baseline),
          targets: targetsBy.get(m.id as string) ?? [],
          values: (valuesBy.get(m.id as string) ?? []).sort((a, b) => a.week_start.localeCompare(b.week_start)),
        })),
      horizons: horizons
        .filter((h) => h.program_id === pid)
        .map((h) => ({ id: h.id as string, name: h.name as string, start_date: h.start_date as string, end_date: h.end_date as string })),
    };
  });
}

/** Ids de cuentas bloqueadas en Auth (no se les manda nada). */
async function bannedUserIds(admin: AdminSupabase): Promise<Set<string>> {
  const out = new Set<string>();
  const now = Date.now();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return out;
    for (const u of data.users) {
      const until = (u as { banned_until?: string | null }).banned_until;
      if (until && new Date(until).getTime() > now) out.add(u.id);
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/**
 * Manda el resumen semanal a quienes lo tienen activo (profiles.weekly_digest)
 * y tienen algo que contar. Sin SMTP configurado no hace nada. Un correo que
 * falla no detiene a los demás.
 */
export async function sendWeeklyDigests(admin: AdminSupabase, now: Date = new Date()): Promise<DigestRunResult> {
  const result: DigestRunResult = { recipients: 0, sent: 0, skipped: 0, failed: 0 };
  if (!emailConfigured()) return result;
  const today = todayIso(now);

  const profiles = await admin.from("profiles").select("id, name, email, is_admin").eq("weekly_digest", true);
  if (profiles.error) {
    // 42703: la columna weekly_digest aún no existe (migración pendiente).
    if (profiles.error.code === "42703") return result;
    throw new Error(profiles.error.message);
  }
  const people = ((profiles.data ?? []) as Row[]).filter((p) => typeof p.email === "string" && (p.email as string).includes("@"));
  if (!people.length) return result;

  const [programs, banned] = await Promise.all([loadPrograms(admin, today), bannedUserIds(admin)]);
  const programIds = programs.map((p) => p.program.id);
  const members = programIds.length
    ? await fetchAll((a, b) => admin.from("program_members").select("program_id, user_id, role").in("program_id", programIds).order("id").range(a, b))
    : [];
  const roleOf = new Map(members.map((m) => [`${m.program_id}|${m.user_id}`, m.role as ProgramRole]));

  // Pilotos en prueba que terminan esta semana (reales, no de ejemplo).
  const sunday = addDays(weekStart(today), 6);
  const [pilotRows, pilotRoles] = await Promise.all([
    admin
      .from("pilots")
      .select("id, title, status, planned_end, owner_id")
      .eq("status", "in_test")
      .eq("is_example", false)
      .is("deleted_at", null)
      .gte("planned_end", today)
      .lte("planned_end", sunday),
    admin.from("pilot_roles").select("user_id, role"),
  ]);
  // Si el módulo de pilotos no existe o falla, el resumen sigue sin esa sección.
  const pilots = pilotRows.error ? [] : pilotsEndingThisWeek((pilotRows.data ?? []) as (Row & { status: string; planned_end: string | null })[], today);
  const pilotRole = new Map(pilotRoles.error ? [] : ((pilotRoles.data ?? []) as Row[]).map((r) => [r.user_id as string, r.role as string]));

  const siteUrl = publicEnv.siteUrl;
  for (const person of people) {
    const userId = person.id as string;
    if (banned.has(userId)) continue;
    const isAdmin = !!person.is_admin;
    result.recipients++;

    const facts: DigestProgramFacts[] = [];
    for (const p of programs) {
      const memberRole = roleOf.get(`${p.program.id}|${userId}`);
      // Solo programas donde es miembro; el admin global ve todos.
      if (!memberRole && !isAdmin) continue;
      const role: DigestRole = isAdmin ? "admin" : (memberRole as ProgramRole);
      facts.push(programDigestFacts({ ...p, role, userId, today }));
    }

    // Pilotos: el aprobador y el admin ven todos; los demás, los suyos (si tienen rol en el módulo).
    const pr = pilotRole.get(userId);
    const myPilots: DigestPilot[] = pilots
      .filter((pl) => isAdmin || pr === "approver" || (!!pr && pl.owner_id === userId))
      .map((pl) => ({ id: pl.id as string, name: pl.title as string, planned_end: pl.planned_end as string }));

    const digest = buildDigest({ userName: (person.name as string) ?? "", today, siteUrl, programs: facts, pilots: myPilots });
    if (!digest) {
      result.skipped++;
      continue;
    }
    // Un solo resumen por persona y semana, aunque el cron corra dos veces: se reserva antes de enviar.
    const week = weekStart(today);
    const reserved = await admin.from("weekly_digest_sends").insert({ user_id: userId, week_start: week }).select("user_id");
    if (reserved.error) {
      if (reserved.error.code === "23505") {
        result.skipped++;
        continue;
      }
      if (reserved.error.code !== "PGRST205" && reserved.error.code !== "42P01") {
        result.failed++;
        console.error("[digest] no se pudo reservar el envío", reserved.error.code);
        continue;
      }
    }
    try {
      await sendEmail({ to: person.email as string, subject: digest.subject, html: renderDigestHtml(digest), text: renderDigestText(digest) });
      result.sent++;
    } catch (e) {
      result.failed++;
      // Si falló el envío, se libera la reserva para que el próximo intento lo mande.
      await admin.from("weekly_digest_sends").delete().eq("user_id", userId).eq("week_start", week);
      console.error("[digest] no se pudo enviar un resumen", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
