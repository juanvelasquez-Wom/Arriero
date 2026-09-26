"use client";

import { Crown, Eye, Megaphone, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ProgramRole } from "@/domain/types";
import type { Member } from "@/server/queries/programs";
import { MembersStep } from "../members-step";
import { StepFooter } from "../step-footer";

const ROLE_CARDS: { role: ProgramRole; title: string; icon: typeof Crown; can: string[]; cannot: string[] }[] = [
  {
    role: "owner",
    title: "Owner",
    icon: Crown,
    can: ["Decidir: veredicto y escalar, ajustar o apagar", "Invitar y cambiar roles", "Borrar y restaurar"],
    cannot: [],
  },
  {
    role: "collaborator",
    title: "Colaborador",
    icon: Users,
    can: ["Editar líneas, métricas, embudo y calendario", "Registrar problemas y ejercicios", "Calificar ICE y cargar resultados"],
    cannot: ["Decidir ejercicios", "Borrar estructura"],
  },
  {
    role: "agency",
    title: "Agencia",
    icon: Megaphone,
    can: ["Crear ejercicios", "Editar y cargar resultados de los que tiene asignados"],
    cannot: ["Calificar ICE ni priorizar", "Editar ejercicios de otros"],
  },
  {
    role: "viewer",
    title: "Lector",
    icon: Eye,
    can: ["Ver todo el programa y los tableros"],
    cannot: ["Cambiar cualquier cosa"],
  },
];

export function StepTeam({
  programId,
  members,
  currentUserId,
  canManage,
  prevHref,
  nextHref,
}: {
  programId: string;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
  prevHref: string;
  nextHref: string;
}) {
  const router = useRouter();
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_CARDS.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.role} className="rounded-xl border bg-paper p-4 text-sm">
              <div className="flex items-center gap-2 font-semibold">
                <Icon className="size-4" aria-hidden /> {c.title}
              </div>
              <ul className="mt-2 space-y-1">
                {c.can.map((x) => (
                  <li key={x}>✓ {x}</li>
                ))}
                {c.cannot.map((x) => (
                  <li key={x} className="text-soft">
                    ✕ {x}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="rounded-xl border bg-paper p-5">
        <MembersStep programId={programId} members={members} currentUserId={currentUserId} canManage={canManage} />
      </div>
      <StepFooter
        prevHref={prevHref}
        pending={false}
        onNext={() => router.push(nextHref)}
        nextLabel={members.length > 1 ? "Seguir" : "Invitar después y seguir"}
      />
    </div>
  );
}
