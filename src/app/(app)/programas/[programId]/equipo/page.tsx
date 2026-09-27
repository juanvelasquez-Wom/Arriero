import { AlarmClock, BookOpenCheck, Flame, Hourglass, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ExportCsvButton } from "@/components/app/export-csv-button";
import { Callout, EmptyState, PageHeader, Section, Stat } from "@/components/app/page";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCsv } from "@/domain/csv";
import { todayIso } from "@/domain/dates";
import { formatDateTime } from "@/domain/format";
import { ROLE_LABEL } from "@/domain/labels";
import { relativeTime } from "@/domain/notifications";
import { computeWorkload, OVERLOAD_IN_TEST, STALE_DAYS, type PersonWorkload, type WorkloadItem } from "@/domain/workload";
import { cn } from "@/lib/utils";
import { getProgramContext } from "@/server/auth";
import { listRecentActivity, listTeamMembers, loadProgramSnapshot } from "@/server/queries/management";

export const metadata: Metadata = { title: "Equipo" };

function ItemList({
  items,
  base,
  owner,
  suffix,
}: {
  items: (WorkloadItem & { owner?: string })[];
  base: string;
  owner?: boolean;
  suffix?: (i: WorkloadItem) => string | null;
}) {
  return (
    <ul className="divide-y">
      {items.map((i) => (
        <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2 first:pt-0 last:pb-0">
          <div className="min-w-0">
            <Link href={`${base}/ejercicios/${i.id}`} className="font-medium hover:underline">
              {i.title}
            </Link>
            <div className="text-xs text-soft">
              {i.line_name}
              {owner && i.owner ? ` · ${i.owner}` : ""}
              {suffix?.(i) ? ` · ${suffix(i)}` : ""}
            </div>
          </div>
          <StatusBadge status={i.status} />
        </li>
      ))}
    </ul>
  );
}

function withOwner(people: PersonWorkload[], pick: (p: PersonWorkload) => WorkloadItem[]) {
  return people.flatMap((p) => pick(p).map((i) => ({ ...i, owner: p.name })));
}

export default async function TeamPage({ params }: PageProps<"/programas/[programId]/equipo">) {
  const { programId } = await params;
  const ctx = await getProgramContext(programId);
  const today = todayIso();
  const [members, snapshot, activity] = await Promise.all([
    listTeamMembers(programId),
    loadProgramSnapshot(
      {
        id: ctx.program.id,
        name: ctx.program.name,
        is_demo: ctx.program.is_demo,
        start_date: ctx.program.start_date,
        end_date: ctx.program.end_date,
      },
      today,
    ),
    listRecentActivity(programId, today),
  ]);
  const w = computeWorkload({ members, experiments: snapshot.experiments, activity, today });
  const base = `/programas/${programId}`;

  const ready = withOwner(w.people, (p) => p.readyToRead);
  const overdue = withOwner(w.people, (p) => p.overdue).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));
  const stale = withOwner(w.people, (p) => p.stale).sort((a, b) => (b.days ?? 0) - (a.days ?? 0));

  const csv = toCsv(w.people, [
    { header: "Persona", value: (p) => p.name },
    { header: "Rol", value: (p) => (p.role ? ROLE_LABEL[p.role] : "") },
    { header: "Priorizado", value: (p) => p.byStatus.prioritized },
    { header: "En diseño", value: (p) => p.byStatus.in_design },
    { header: "En prueba", value: (p) => p.byStatus.in_test },
    { header: "En lectura", value: (p) => p.byStatus.in_reading },
    { header: "Ideas", value: (p) => p.ideas },
    { header: "Listos para leer", value: (p) => p.readyToRead.length },
    { header: "Vencidos", value: (p) => p.overdue.length },
    { header: "Ideas quietas", value: (p) => p.stale.length },
    { header: "Última actividad", value: (p) => (p.lastActivity ? formatDateTime(p.lastActivity) : "") },
  ]);

  const hasWork = w.people.some((p) => p.open.length > 0);

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        eyebrow="Equipo"
        title="Carga del equipo"
        description="Quién tiene qué, qué ya se puede leer, qué se venció y qué ideas llevan rato quietas. Para repartir la carga antes de que la mula se canse."
        actions={<ExportCsvButton csv={csv} name={["equipo", ctx.program.name, today]} />}
      />

      {!hasWork ? (
        <EmptyState
          icon={Users}
          title="Todavía no hay ejercicios asignados"
          description="Cuando el equipo cree y asigne ejercicios, aquí va a ver la carga de cada persona."
          action={
            <Button asChild variant="outline">
              <Link href={`${base}/ejercicios`}>Ir al backlog</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-6">
          {w.overloaded.length ? (
            <Callout icon={Flame} title="Hay gente sobrecargada">
              {w.overloaded.map((p) => `${p.name} (${p.inTest} en prueba)`).join(", ")}. Más de {OVERLOAD_IN_TEST} pruebas a la vez por
              persona es mucho: se leen tarde y mal. Reparta o espere a cerrar alguna antes de lanzar otra.
            </Callout>
          ) : null}
          {w.idle.length ? (
            <Callout tone="neutral" icon={Users} title="Con espacio para más">
              {w.idle.map((p) => p.name).join(", ")} no tiene{w.idle.length === 1 ? "" : "n"} ejercicios activos.
            </Callout>
          ) : null}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Ejercicios activos" value={w.totals.active} hint="Priorizado a en lectura" />
            <Stat label="En prueba" value={w.totals.inTest} />
            <Stat label="Listos para leer" value={w.totals.readyToRead} hint="Ya cumplieron la duración mínima" highlight={w.totals.readyToRead > 0} />
            <Stat label="Vencidos" value={w.totals.overdue} hint="Pasó el fin planeado" />
            <Stat label="Ideas quietas" value={w.totals.stale} hint={`Más de ${STALE_DAYS} días sin moverse`} />
          </div>

          <Section title="Por persona" description="Ejercicios abiertos de cada responsable. La última actividad sale de la bitácora del programa.">
            <div className="-m-5 overflow-x-auto">
              <Table className="tabular-nums">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Persona</TableHead>
                    <TableHead className="text-right">Priorizado</TableHead>
                    <TableHead className="text-right">En diseño</TableHead>
                    <TableHead className="text-right">En prueba</TableHead>
                    <TableHead className="text-right">En lectura</TableHead>
                    <TableHead className="text-right">Ideas</TableHead>
                    <TableHead className="text-right">Listos</TableHead>
                    <TableHead className="text-right">Vencidos</TableHead>
                    <TableHead className="pr-5">Última actividad</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {w.people.map((p) => (
                    <TableRow key={p.user_id ?? "none"} className={cn(p.overloaded && "bg-highlight/10 hover:bg-highlight/15")}>
                      <TableCell className={cn("pl-5", p.overloaded && "border-l-4 border-l-highlight")}>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-soft">{p.role ? ROLE_LABEL[p.role] : p.user_id ? "Ya no es miembro" : "Asigne un responsable"}</div>
                      </TableCell>
                      <TableCell className="text-right">{p.byStatus.prioritized || "·"}</TableCell>
                      <TableCell className="text-right">{p.byStatus.in_design || "·"}</TableCell>
                      <TableCell className={cn("text-right", p.overloaded && "font-bold")}>
                        {p.byStatus.in_test || "·"}
                        {p.overloaded ? <Flame aria-label="Sobrecarga" className="ml-1 inline size-3.5" /> : null}
                      </TableCell>
                      <TableCell className="text-right">{p.byStatus.in_reading || "·"}</TableCell>
                      <TableCell className="text-right">{p.ideas || "·"}</TableCell>
                      <TableCell className="text-right">{p.readyToRead.length || "·"}</TableCell>
                      <TableCell className="text-right">{p.overdue.length || "·"}</TableCell>
                      <TableCell className="pr-5 text-sm">
                        {p.lastActivity ? <span title={formatDateTime(p.lastActivity)}>{relativeTime(p.lastActivity)}</span> : <span className="text-soft">—</span>}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Section>

          <div className="grid gap-4 lg:grid-cols-3">
            <Section title={<span className="inline-flex items-center gap-1.5"><BookOpenCheck aria-hidden className="size-4" /> Listos para leer</span>}>
              {ready.length ? (
                <ItemList items={ready} base={base} owner />
              ) : (
                <p className="text-sm text-soft">Nada listo todavía. Las pruebas siguen corriendo.</p>
              )}
            </Section>
            <Section title={<span className="inline-flex items-center gap-1.5"><AlarmClock aria-hidden className="size-4" /> Vencidos</span>}>
              {overdue.length ? (
                <ItemList items={overdue} base={base} owner suffix={(i) => (i.days ? `${i.days} día${i.days === 1 ? "" : "s"} tarde` : null)} />
              ) : (
                <p className="text-sm text-soft">¡Eso! Nada vencido.</p>
              )}
            </Section>
            <Section title={<span className="inline-flex items-center gap-1.5"><Hourglass aria-hidden className="size-4" /> Ideas quietas</span>}>
              {stale.length ? (
                <ItemList items={stale} base={base} owner suffix={(i) => (i.days ? `${i.days} días quieta` : null)} />
              ) : (
                <p className="text-sm text-soft">Ninguna idea lleva más de un mes quieta.</p>
              )}
            </Section>
          </div>

          <Section title="Lo que tiene cada quien" description="Abra a una persona para ver y abrir sus ejercicios.">
            <div className="space-y-2">
              {w.people
                .filter((p) => p.open.length)
                .map((p) => (
                  <details key={p.user_id ?? "none"} className="group rounded-xl border px-4 py-2.5">
                    <summary className="cursor-pointer list-none text-sm font-medium marker:hidden">
                      {p.name} <span className="font-normal text-soft">· {p.open.length} abierto{p.open.length === 1 ? "" : "s"}</span>
                    </summary>
                    <div className="mt-3">
                      <ItemList items={p.open} base={base} />
                    </div>
                  </details>
                ))}
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
