import { BookOpen, PencilLine, ShieldCheck, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Callout, PageHeader } from "@/components/app/page";
import { RolesTable } from "@/components/pilots/roles/roles-table";
import { isPilotApprover } from "@/domain/pilots/flow";
import { PILOT_ROLE_DESCRIPTION, PILOT_ROLE_LABEL } from "@/domain/pilots/labels";
import { PILOT_ROLES, type PilotRole } from "@/domain/pilots/types";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { listPilotMembers } from "@/server/queries/pilots";

export const metadata: Metadata = { title: "Roles de pilotos" };

const ROLE_ICON: Record<PilotRole, LucideIcon> = { approver: ShieldCheck, creator: PencilLine, reader: BookOpen };

export default async function PilotRolesPage() {
  const { user, actor } = await getPilotContext();
  if (!actor.role || !(await isPilotsReady())) return null;
  if (!isPilotApprover(actor)) redirect("/pilotos");
  const members = await listPilotMembers();
  const counts = Object.fromEntries(PILOT_ROLES.map((r) => [r, members.filter((m) => (m.is_admin ? "approver" : m.role) === r).length])) as Record<
    PilotRole,
    number
  >;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Pilotos de medios"
        title="Roles de pilotos"
        description="Quién ve, quién crea y quién aprueba en Pilotos. Son independientes de los roles de cada programa."
      />

      <ul className="stagger mb-6 grid gap-3 sm:grid-cols-3">
        {PILOT_ROLES.map((r) => {
          const Icon = ROLE_ICON[r];
          return (
            <li key={r} className="rounded-2xl border bg-paper p-4 shadow-card">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 font-heading font-bold">
                  <Icon aria-hidden className="size-4" />
                  {PILOT_ROLE_LABEL[r]}
                </span>
                <span className="text-xs text-soft tabular-nums">
                  {counts[r]} {counts[r] === 1 ? "persona" : "personas"}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-soft">{PILOT_ROLE_DESCRIPTION[r]}</p>
            </li>
          );
        })}
      </ul>

      <Callout tone="neutral" icon={ShieldCheck} className="mb-6">
        Los permisos no dependen de esta pantalla: la base de datos (RLS) los hace cumplir. Un lector no puede escribir nada, ni siquiera desde la API. Los admins
        globales son aprobadores siempre.
      </Callout>

      <RolesTable members={members} currentUserId={user.id} />
    </div>
  );
}
