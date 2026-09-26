import { ArrowRight, CalendarRange, FolderKanban, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState, PageHeader } from "@/components/app/page";
import { DemoBadge } from "@/components/app/status-badge";
import { phraseOfTheDay } from "@/components/brand/phrases";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/domain/labels";
import { formatDateRange } from "@/domain/format";
import { isDatabaseReady, requireUser } from "@/server/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDemoProgramId } from "@/server/demo/loader";
import { listDeletedPrograms, listMyPrograms } from "@/server/queries/programs";

// El admin ve el estado del ejemplo aunque esté en la papelera (existe una sola vez).
async function demoState() {
  const id = await findDemoProgramId(createAdminClient());
  return id ? { id, name: "Programa demo · Telco Andina" } : null;
}
import { DemoControls } from "./demo-controls";
import { DeletedPrograms } from "./deleted-programs";

export const metadata: Metadata = { title: "Mis programas" };

const firstName = (n: string) => n.split(/[\s@.]+/)[0] || n;

export default async function ProgramsPage() {
  const user = await requireUser();
  // El layout ya muestra el aviso; aquí solo evitamos consultar tablas inexistentes.
  if (!(await isDatabaseReady())) return null;
  const [programs, deleted, demo] = await Promise.all([
    listMyPrograms(user.id),
    listDeletedPrograms(),
    user.isAdmin ? demoState() : Promise.resolve(null),
  ]);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <PageHeader
          eyebrow={`Buenas, ${firstName(user.name || user.email)}`}
          title="¿Y por dónde es hoy?"
          description={`«${phraseOfTheDay(user.id)}» Estos son sus programas: cada uno junta las líneas de negocio, el calendario comercial y el equipo que mueve los ejercicios.`}
          actions={
            user.isAdmin ? (
              <>
                <Button asChild variant="outline">
                  <Link href="/admin/usuarios">
                    <Users aria-hidden /> Usuarios
                  </Link>
                </Button>
                <DemoControls demo={demo} />
                <Button asChild>
                  <Link href="/programas/nuevo">
                    <Plus aria-hidden /> Crear programa
                  </Link>
                </Button>
              </>
            ) : null
          }
        />

        {programs.length === 0 ? (
          <EmptyState
            icon={FolderKanban}
            title="Todavía no hay programas por aquí"
            description={
              user.isAdmin
                ? "Cree el primer programa y el asistente lo guía paso a paso. O cargue el programa de ejemplo para ver la app andando."
                : "Cuando un admin o un owner lo sume a un programa, aparece aquí."
            }
            action={
              user.isAdmin ? (
                <Button asChild>
                  <Link href="/programas/nuevo">
                    <Plus aria-hidden /> Crear programa
                  </Link>
                </Button>
              ) : null
            }
          />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {programs.map((p, i) => (
              <li key={p.id} className={`rise rise-delay-${Math.min(i, 3)}`}>
                <Link
                  href={p.setup_completed_at || p.is_demo ? `/programas/${p.id}` : `/programas/${p.id}/configuracion`}
                  className="lift group flex h-full flex-col rounded-2xl border bg-paper p-5 shadow-card"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-lg font-bold leading-snug">{p.name}</h2>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {p.is_demo ? <DemoBadge /> : null}
                      <span className="rounded-full bg-wash px-2.5 py-0.5 text-xs font-medium">
                        {p.role ? ROLE_LABEL[p.role] : "Admin"}
                      </span>
                    </div>
                  </div>
                  {p.description ? <p className="mt-1 line-clamp-2 text-sm text-soft">{p.description}</p> : null}
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-4 text-xs text-soft">
                    <span className="inline-flex items-center gap-1">
                      <CalendarRange className="size-3.5" aria-hidden />
                      {formatDateRange(p.start_date, p.end_date)}
                    </span>
                    <span className="tabular-nums">
                      {p.lines} {p.lines === 1 ? "línea" : "líneas"} · {p.experiments}{" "}
                      {p.experiments === 1 ? "ejercicio" : "ejercicios"}
                    </span>
                    {!p.setup_completed_at && !p.is_demo ? (
                      <span className="rounded-full bg-highlight px-2.5 py-0.5 font-semibold text-[#111111]">Falta terminar la configuración</span>
                    ) : null}
                    <ArrowRight aria-hidden className="ml-auto size-4 text-ink transition-transform group-hover:translate-x-1" />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}

        {deleted.length ? <DeletedPrograms items={deleted} /> : null}
      </main>
    </>
  );
}
