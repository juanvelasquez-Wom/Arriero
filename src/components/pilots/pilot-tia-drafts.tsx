"use client";

import { Check, Pencil, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { TiaCard, TiaText } from "@/components/tia/tia-ui";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { TIA_ENABLED, TIA_LINES } from "@/domain/tia";
import { requestPilotDraft, reviewPilotDraft, type PilotDraftKind } from "@/server/actions/pilot-tia";
import type { PilotDraftRow } from "@/server/queries/pilots";

const TITLE: Record<PilotDraftKind, string> = {
  diagnosis: "La Tía le revisa la línea base y la hipótesis",
  design: "La Tía tiene una recomendación de diseño",
  conclusion: "La Tía le lee el resultado",
};

const BUTTON: Record<PilotDraftKind, string> = {
  diagnosis: "Pedirle el diagnóstico",
  design: "Pedirle la recomendación",
  conclusion: "Pedirle el borrador de conclusión",
};

const STATUS: Record<PilotDraftRow["status"], string> = {
  draft: "Borrador de la Tía",
  edited: "Borrador de la Tía · editado",
  approved: "Aprobado por el equipo",
};

/** Borrador de La Tía para un piloto. Apagada (TIA_ENABLED) no se muestra. */
export function PilotTiaDraft({
  pilotId,
  kind,
  draft,
  canWrite,
}: {
  pilotId: string;
  kind: PilotDraftKind;
  draft: PilotDraftRow | null;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(draft?.content ?? "");
  if (!TIA_ENABLED) return null;

  const ask = () =>
    start(async () => {
      const r = await requestPilotDraft(pilotId, kind);
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setText(r.data.content);
      router.refresh();
    });
  const save = (approve: boolean) =>
    start(async () => {
      if (!draft) return;
      const r = await reviewPilotDraft(draft.id, { content: editing ? text : undefined, approve });
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.message);
      setEditing(false);
      router.refresh();
    });

  return (
    <TiaCard
      title={TITLE[kind]}
      actions={
        canWrite ? (
          <>
            <Button type="button" variant={draft ? "outline" : "default"} size="sm" onClick={ask} disabled={pending}>
              {pending ? <Spinner /> : <Sparkles aria-hidden />} {draft ? "Pedirle otro" : BUTTON[kind]}
            </Button>
            {draft && !editing ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(true)} disabled={pending}>
                <Pencil aria-hidden /> Editar
              </Button>
            ) : null}
            {draft && editing ? (
              <Button type="button" variant="outline" size="sm" onClick={() => save(false)} disabled={pending}>
                Guardar cambios
              </Button>
            ) : null}
            {draft && draft.status !== "approved" ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => save(true)} disabled={pending}>
                <Check aria-hidden /> Aprobar borrador
              </Button>
            ) : null}
          </>
        ) : null
      }
    >
      {draft ? (
        <>
          <span className="mb-2 inline-flex h-5 items-center rounded-full border border-dashed border-gray-4 px-2 text-[11px] font-semibold uppercase tracking-wide text-soft">
            {STATUS[draft.status]}
          </span>
          {editing ? (
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={8} aria-label="Editar el borrador de la Tía" />
          ) : (
            <TiaText text={draft.content} />
          )}
        </>
      ) : (
        <p className="text-sm text-soft">{pending ? TIA_LINES.thinking[0] : "Todavía no le ha pedido nada para este piloto."}</p>
      )}
      <p className="mt-2 text-xs text-soft">{TIA_LINES.disclaimer} Los números salen del motor de Arriero, no de la IA.</p>
    </TiaCard>
  );
}
