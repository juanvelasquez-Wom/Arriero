"use client";

import { FolderPlus, Lightbulb, Megaphone, Skull, Undo2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { celebrate } from "@/components/brand/celebrate";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { DECISION_LABEL, type IdeaDecision } from "@/domain/ideas";
import { decideIdea } from "@/server/actions/ideas";

export interface DecisionProps {
  ideaId: string;
  ideaTitle: string;
  decision: IdeaDecision | null;
  linked: boolean;
  canDecide: boolean;
  isAdmin: boolean;
  canPilot: boolean;
  insightId: string | null;
  program: { id: string; name: string } | null;
  pilot: { id: string; title: string } | null;
}

/** Qué pasa con la idea: los cuatro caminos y, ya decidida, el siguiente paso. */
export function DecisionControls(p: DecisionProps) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const decide = (d: IdeaDecision | null) =>
    start(async () => {
      const r = await decideIdea(p.ideaId, { decision: d });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (d === "project" || d === "pilot") celebrate(r.message ?? "¡Eso!", `«${p.ideaTitle}»`);
      else toast.success(r.message);
      router.refresh();
    });

  if (!p.decision) {
    if (!p.canDecide) return null;
    return (
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("project")}>
          <FolderPlus aria-hidden className="size-4" /> Proyecto
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={() => decide("pilot")}>
          <Megaphone aria-hidden className="size-4" /> Piloto
        </Button>
        <ConfirmAction
          title="¿Mandarla al carriel de insights?"
          description="Se crea un insight con esta idea, a nombre suyo y con la fuente «El equipo». Después ya no se cambia la decisión."
          confirmLabel="Sí, al carriel"
          onConfirm={async () => {
            const r = await decideIdea(p.ideaId, { decision: "insight" });
            if (!r.ok) return r.error;
            toast.success(r.message);
            router.refresh();
          }}
        >
          <Button size="sm" variant="outline" disabled={pending}>
            <Lightbulb aria-hidden className="size-4" /> Insight
          </Button>
        </ConfirmAction>
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide("buried")}>
          <Skull aria-hidden className="size-4" /> Al cementerio
        </Button>
      </div>
    );
  }

  const undo =
    p.canDecide && !p.linked ? (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide(null)}>
        <Undo2 aria-hidden className="size-4" /> {p.decision === "buried" ? "Revivir" : "Cambiar"}
      </Button>
    ) : null;

  if (p.decision === "buried") return undo ? <div className="flex flex-wrap gap-1.5">{undo}</div> : null;

  let next: React.ReactNode = null;
  if (p.decision === "project") {
    next = p.program ? (
      <Link href={`/programas/${p.program.id}`} className="text-sm font-semibold underline underline-offset-4">
        Programa: {p.program.name}
      </Link>
    ) : p.linked ? (
      <span className="text-sm text-soft">Ya es un programa (usted no está en él).</span>
    ) : p.isAdmin ? (
      <Button size="sm" asChild>
        <Link href={`/programas/nuevo?idea=${p.ideaId}`}>
          <FolderPlus aria-hidden className="size-4" /> Armar proyecto
        </Link>
      </Button>
    ) : (
      <span className="text-sm text-soft">Los programas los crea un admin: pásele este aguacero.</span>
    );
  } else if (p.decision === "pilot") {
    next = p.pilot ? (
      <Link href={`/pilotos/${p.pilot.id}`} className="text-sm font-semibold underline underline-offset-4">
        Piloto: {p.pilot.title}
      </Link>
    ) : p.linked ? (
      <span className="text-sm text-soft">Ya es un piloto.</span>
    ) : p.canPilot ? (
      <Button size="sm" asChild>
        <Link href={`/pilotos/nuevo?idea=${p.ideaId}`}>
          <Megaphone aria-hidden className="size-4" /> Crear piloto
        </Link>
      </Button>
    ) : (
      <span className="text-sm text-soft">Lo crea alguien con rol de Creador en Pilotos.</span>
    );
  } else if (p.decision === "insight" && p.insightId) {
    next = (
      <Link href={`/insights/${p.insightId}`} className="text-sm font-semibold underline underline-offset-4">
        Verlo en el carriel
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-ink px-2.5 py-0.5 text-xs font-semibold text-paper">{DECISION_LABEL[p.decision]}</span>
      {next}
      {undo}
    </div>
  );
}
