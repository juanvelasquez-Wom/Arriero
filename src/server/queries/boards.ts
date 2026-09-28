import "server-only";
import { boardHealth, experimentColumn, pilotColumn, type BoardItem } from "@/domain/boards";
import { daysBetween } from "@/domain/dates";
import { STATUS_LABEL } from "@/domain/labels";
import { daysInStatus } from "@/domain/lifecycle";
import { PILOT_STATUS_LABEL } from "@/domain/pilots/labels";
import type { PilotStatus } from "@/domain/pilots/types";
import { bogotaDate } from "@/domain/rollup";
import type { CalendarEvent, ExperimentStatus, IsoDate } from "@/domain/types";
import { createClient } from "@/lib/supabase/server";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listVisiblePrograms, type ManagementProgram } from "@/server/queries/management";
import { loadPeople } from "@/server/queries/pilots";

// Lecturas del tablero general (/tableros): ejercicios de todos los programas
// visibles y pilotos de medios. Solo lectura, con el cliente de la persona:
// RLS decide qué ve cada quien. Nunca el cliente con secret key.

const PAGE = 1000;
type PageResult = { data: unknown[] | null; error: { message: string } | null };

async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<PageResult>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

interface ExperimentRaw {
  id: string;
  program_id: string;
  title: string;
  status: ExperimentStatus;
  owner_id: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  status_changed_at: string;
  line: { name: string } | { name: string }[] | null;
  owner: { name: string; email: string } | { name: string; email: string }[] | null;
}

interface PilotRaw {
  id: string;
  title: string;
  status: PilotStatus;
  owner_id: string | null;
  program_id: string | null;
  planned_start: IsoDate | null;
  planned_end: IsoDate | null;
  actual_start: IsoDate | null;
  actual_end: IsoDate | null;
  status_changed_at: string;
  is_example: boolean;
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Un dato cuenta como reciente solo si es posterior al arranque real. */
function dataSince(last: IsoDate | null, start: IsoDate | null): IsoDate | null {
  if (!last) return null;
  return start && daysBetween(start, last) < 0 ? null : last;
}

export interface GlobalBoardsData {
  programs: ManagementProgram[];
  items: BoardItem[];
  /** Calendario por programa (para la franja del Gantt al filtrar uno). */
  calendar: Map<string, CalendarEvent[]>;
  /** La persona tiene un rol en Pilotos de medios. */
  hasPilots: boolean;
  owners: { id: string; name: string }[];
}

export async function loadGlobalBoards(today: IsoDate, now: Date = new Date()): Promise<GlobalBoardsData> {
  const supabase = await createClient();
  const programs = await listVisiblePrograms();
  const ids = programs.map((p) => p.id);
  const programName = new Map(programs.map((p) => [p.id, p.name]));
  const demo = new Set(programs.filter((p) => p.is_demo).map((p) => p.id));

  const [experiments, calendarRows] = ids.length
    ? await Promise.all([
        fetchAll<ExperimentRaw>((a, b) =>
          supabase
            .from("experiments")
            .select(
              "id, program_id, title, status, owner_id, planned_start, planned_end, actual_start, actual_end, status_changed_at, line:business_lines!experiments_line_id_fkey(name), owner:profiles!experiments_owner_id_fkey(name, email)",
            )
            .in("program_id", ids)
            .is("deleted_at", null)
            .order("id")
            .range(a, b),
        ),
        fetchAll<CalendarEvent & { program_id: string }>((a, b) =>
          supabase
            .from("calendar_events")
            .select("id, program_id, type, name, start_date, end_date")
            .in("program_id", ids)
            .is("deleted_at", null)
            .order("id")
            .range(a, b),
        ),
      ])
    : [[], []];

  const calendar = new Map<string, CalendarEvent[]>();
  for (const ev of calendarRows) calendar.set(ev.program_id, [...(calendar.get(ev.program_id) ?? []), ev]);

  // Último resultado cargado de los ejercicios en prueba (las variantes se actualizan al cargar resultados).
  const runningIds = experiments.filter((e) => e.status === "in_test").map((e) => e.id);
  const lastExperimentData = new Map<string, IsoDate>();
  if (runningIds.length) {
    const variants = await fetchAll<{ experiment_id: string; updated_at: string }>((a, b) =>
      supabase.from("experiment_variants").select("experiment_id, updated_at").in("experiment_id", runningIds).is("deleted_at", null).order("id").range(a, b),
    ).catch(() => []);
    for (const v of variants) {
      const d = bogotaDate(v.updated_at);
      if (d && (lastExperimentData.get(v.experiment_id) ?? "") < d) lastExperimentData.set(v.experiment_id, d);
    }
  }

  const items: BoardItem[] = experiments.map((e) => {
    const column = experimentColumn(e.status);
    const days = daysInStatus(e.status_changed_at, now);
    const owner = one(e.owner);
    const lastDataAt = dataSince(lastExperimentData.get(e.id) ?? null, e.actual_start);
    return {
      id: e.id,
      kind: "experiment",
      title: e.title,
      href: `/programas/${e.program_id}/ejercicios/${e.id}`,
      programId: e.program_id,
      programName: programName.get(e.program_id) ?? null,
      chip: one(e.line)?.name ?? "Sin línea",
      status: e.status,
      statusLabel: STATUS_LABEL[e.status],
      column,
      ownerId: e.owner_id,
      ownerName: owner ? owner.name || owner.email : null,
      days,
      plannedStart: e.planned_start,
      plannedEnd: e.planned_end,
      actualStart: e.actual_start,
      actualEnd: e.actual_end,
      lastDataAt,
      isExample: demo.has(e.program_id),
      health: boardHealth({
        column,
        plannedStart: e.planned_start,
        plannedEnd: e.planned_end,
        actualStart: e.actual_start,
        actualEnd: e.actual_end,
        days,
        lastDataAt,
        calendar: calendar.get(e.program_id) ?? [],
        today,
      }),
    };
  });

  // Pilotos: solo con un rol en el módulo y con la migración aplicada.
  const { actor } = await getPilotContext();
  const hasPilots = !!actor.role && (await isPilotsReady());
  if (hasPilots) {
    const { data, error } = await supabase
      .from("pilots")
      .select("id, title, status, owner_id, program_id, planned_start, planned_end, actual_start, actual_end, status_changed_at, is_example")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(500);
    const pilots = error ? [] : ((data ?? []) as PilotRaw[]);
    const running = pilots.filter((p) => p.status === "in_test").slice(0, 50);
    const [people, lastData] = await Promise.all([
      loadPeople(pilots.map((p) => p.owner_id)),
      Promise.all(
        running.map(async (p) => {
          const { data: m } = await supabase
            .from("pilot_measurements")
            .select("updated_at")
            .eq("pilot_id", p.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          return [p.id, bogotaDate((m?.updated_at as string | undefined) ?? null)] as const;
        }),
      ),
    ]);
    const lastPilotData = new Map(lastData);
    for (const p of pilots) {
      const column = pilotColumn(p.status);
      const days = daysInStatus(p.status_changed_at, now);
      const lastDataAt = dataSince(lastPilotData.get(p.id) ?? null, p.actual_start);
      items.push({
        id: p.id,
        kind: "pilot",
        title: p.title,
        href: `/pilotos/${p.id}`,
        programId: null,
        programName: null,
        chip: "Piloto de medios",
        status: p.status,
        statusLabel: PILOT_STATUS_LABEL[p.status],
        column,
        ownerId: p.owner_id,
        ownerName: p.owner_id ? (people[p.owner_id] ?? null) : null,
        days,
        plannedStart: p.planned_start,
        plannedEnd: p.planned_end,
        actualStart: p.actual_start,
        actualEnd: p.actual_end,
        lastDataAt,
        isExample: p.is_example,
        health: boardHealth({
          column,
          plannedStart: p.planned_start,
          plannedEnd: p.planned_end,
          actualStart: p.actual_start,
          actualEnd: p.actual_end,
          days,
          lastDataAt,
          // Si el piloto cuelga de un programa visible, se usan sus congelamientos.
          calendar: p.program_id ? (calendar.get(p.program_id) ?? []) : [],
          today,
        }),
      });
    }
  }

  const owners = new Map<string, string>();
  for (const i of items) if (i.ownerId && !owners.has(i.ownerId)) owners.set(i.ownerId, i.ownerName ?? "Sin nombre");

  return {
    programs,
    items,
    calendar,
    hasPilots,
    owners: [...owners].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, "es")),
  };
}
