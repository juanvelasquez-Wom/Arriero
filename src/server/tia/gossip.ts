import "server-only";

import { addDays, todayIso } from "@/domain/dates";
import { tiaSystem } from "@/domain/tia";
import {
  cleanGossip,
  gossipDedupeKey,
  gossipFacts,
  GOSSIP_TASK,
  GOSSIP_TITLE,
  hasGossipMaterial,
  type GossipInput,
} from "@/domain/tia-insights";
import type { CalendarEventType, ExperimentStatus, MetricDirection } from "@/domain/types";
import type { AdminSupabase } from "@/lib/supabase/admin";
import { askTia, tiaConfigured } from "./client";

// "La Tía le tiene un chismecito": una vez por semana (lunes, desde el cron de
// avisos), un hallazgo corto por programa real y activo para owners y
// colaboradores. Corre sin sesión, con el cliente admin (solo aquí, en el cron):
// por eso cada consulta filtra a mano lo borrado y el programa.

export interface GossipRunResult {
  programs: number;
  sent: number;
  notifications: number;
  skipped: number;
  failed: number;
}

type Row = Record<string, unknown>;

async function programFacts(admin: AdminSupabase, program: { id: string; name: string; start_date: string | null }, today: string) {
  const since = addDays(today, -35);
  const [horizons, lines, metrics, experiments, calendar] = await Promise.all([
    admin.from("program_horizons").select("id, name, start_date, end_date").eq("program_id", program.id),
    admin.from("business_lines").select("id, name").eq("program_id", program.id).is("deleted_at", null),
    admin
      .from("metrics")
      .select("id, line_id, name, unit, direction, baseline, metric_targets(horizon_id, target)")
      .eq("program_id", program.id)
      .eq("type", "north_star")
      .is("deleted_at", null),
    admin
      .from("experiments")
      .select("title, line_id, status, status_changed_at")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .order("status_changed_at", { ascending: false })
      .limit(300),
    admin
      .from("calendar_events")
      .select("type, name, start_date, end_date")
      .eq("program_id", program.id)
      .is("deleted_at", null)
      .gte("end_date", today),
  ]);
  const firstError = [horizons, lines, metrics, experiments, calendar].find((r) => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const lineName = new Map(((lines.data ?? []) as Row[]).map((l) => [l.id as string, l.name as string]));
  const northStars = ((metrics.data ?? []) as Row[]).filter((m) => lineName.has(m.line_id as string));
  const values = northStars.length
    ? await admin
        .from("metric_values")
        .select("metric_id, week_start, value")
        .in("metric_id", northStars.map((m) => m.id as string))
        .is("deleted_at", null)
        .gte("week_start", since)
        .order("week_start")
    : { data: [], error: null };
  if (values.error) throw new Error(values.error.message);
  const valueRows = (values.data ?? []) as Row[];

  const input: GossipInput = {
    today,
    program: { name: program.name, start_date: program.start_date },
    horizons: ((horizons.data ?? []) as Row[]).map((h) => ({
      id: h.id as string,
      name: h.name as string,
      start_date: h.start_date as string,
      end_date: h.end_date as string,
    })),
    northStars: northStars.map((m) => ({
      line_name: lineName.get(m.line_id as string) ?? "",
      name: m.name as string,
      unit: (m.unit as string | null) ?? null,
      direction: m.direction as MetricDirection,
      baseline: m.baseline == null ? null : Number(m.baseline),
      targets: ((m.metric_targets ?? []) as Row[]).map((t) => ({ horizon_id: t.horizon_id as string, target: Number(t.target) })),
      values: valueRows.filter((v) => v.metric_id === m.id).map((v) => ({ week_start: v.week_start as string, value: Number(v.value) })),
    })),
    experiments: ((experiments.data ?? []) as Row[])
      .filter((e) => lineName.has(e.line_id as string))
      .map((e) => ({
        title: e.title as string,
        line_name: lineName.get(e.line_id as string) ?? "",
        status: e.status as ExperimentStatus,
        status_changed_at: e.status_changed_at as string,
      })),
    calendar: ((calendar.data ?? []) as Row[]).map((c) => ({
      type: c.type as CalendarEventType,
      name: c.name as string,
      start_date: c.start_date as string,
      end_date: c.end_date as string,
    })),
  };
  return gossipFacts(input);
}

async function insertNotifications(admin: AdminSupabase, rows: Row[]): Promise<number> {
  if (!rows.length) return 0;
  const { error } = await admin.from("notifications").insert(rows);
  if (!error) return rows.length;
  if (error.code !== "23505") throw new Error(error.message);
  // Alguien ya lo tenía (clave única por persona): se insertan uno por uno.
  let n = 0;
  for (const row of rows) {
    const r = await admin.from("notifications").insert(row);
    if (!r.error) n++;
    else if (r.error.code !== "23505") throw new Error(r.error.message);
  }
  return n;
}

/**
 * Genera el chismecito de la semana para cada programa real y activo. Es
 * idempotente por semana ISO (dedupe_key "gossip:<programa>:<semana>"): si el
 * programa ya lo recibió, no vuelve a preguntarle a Claude.
 */
export async function sendWeeklyGossip(admin: AdminSupabase, now: Date = new Date()): Promise<GossipRunResult> {
  const result: GossipRunResult = { programs: 0, sent: 0, notifications: 0, skipped: 0, failed: 0 };
  if (!tiaConfigured()) return result;
  const today = todayIso(now);

  const { data: programs, error } = await admin
    .from("programs")
    .select("id, name, start_date, end_date")
    .eq("is_demo", false)
    .is("deleted_at", null)
    .or(`end_date.is.null,end_date.gte.${today}`);
  if (error) throw new Error(error.message);

  for (const p of (programs ?? []) as Row[]) {
    result.programs++;
    const programId = p.id as string;
    const dedupeKey = gossipDedupeKey(programId, today);
    try {
      const [existing, members] = await Promise.all([
        admin.from("notifications").select("id").eq("program_id", programId).eq("dedupe_key", dedupeKey).limit(1),
        admin.from("program_members").select("user_id").eq("program_id", programId).in("role", ["owner", "collaborator"]),
      ]);
      if (existing.error) throw new Error(existing.error.message);
      if (members.error) throw new Error(members.error.message);
      const recipients = [...new Set(((members.data ?? []) as Row[]).map((m) => m.user_id as string))];
      if ((existing.data ?? []).length || !recipients.length) {
        result.skipped++;
        continue;
      }

      const facts = await programFacts(admin, { id: programId, name: p.name as string, start_date: (p.start_date as string | null) ?? null }, today);
      if (!hasGossipMaterial(facts)) {
        result.skipped++;
        continue;
      }

      const reply = await askTia({
        system: tiaSystem(GOSSIP_TASK, facts),
        messages: [{ role: "user", content: "Tía, ¿cuál es el chismecito de esta semana?" }],
        maxTokens: 300,
        temperature: 0.7,
      });
      const usage = await admin.from("tia_usage").insert({
        user_id: null,
        program_id: programId,
        feature: "gossip",
        model: reply.usage.model,
        input_tokens: reply.usage.inputTokens,
        output_tokens: reply.usage.outputTokens,
      });
      if (usage.error && usage.error.code !== "PGRST205") console.error("[tia] no se pudo registrar el consumo del chismecito", usage.error.code);

      const body = cleanGossip(reply.text);
      if (!body) {
        result.skipped++;
        continue;
      }
      const created = await insertNotifications(
        admin,
        recipients.map((user_id) => ({
          user_id,
          program_id: programId,
          kind: "gossip",
          title: GOSSIP_TITLE,
          body,
          href: `/programas/${programId}`,
          dedupe_key: dedupeKey,
        })),
      );
      result.sent++;
      result.notifications += created;
    } catch (e) {
      result.failed++;
      console.error("[tia] chismecito falló para un programa", e instanceof Error ? e.message : e);
    }
  }
  return result;
}
