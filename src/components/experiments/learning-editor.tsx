"use client";

import { Pencil, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { updateLearning } from "@/server/actions/experiments";
import { LearningTaxonomyFields, leverLabel } from "./learning-taxonomy";

export function LearningEditor({
  programId,
  learning,
  lines,
  ownLineId,
  canEdit,
  problemChannel,
  taxonomyReady = true,
}: {
  programId: string;
  learning: {
    id: string;
    text: string;
    applies_to_line_ids: string[];
    suggested_hypothesis: string | null;
    lever?: string | null;
    channel?: string | null;
  };
  lines: { id: string; name: string }[];
  ownLineId: string;
  canEdit: boolean;
  /** false si la base todavía no tiene palanca y canal (migración K1). */
  taxonomyReady?: boolean;
  /** Canal del problema: se propone si el aprendizaje no tiene canal. */
  problemChannel?: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(learning.text);
  const [appliesTo, setAppliesTo] = useState(learning.applies_to_line_ids);
  const [suggested, setSuggested] = useState(learning.suggested_hypothesis ?? "");
  const [lever, setLever] = useState(learning.lever ?? "");
  const [channel, setChannel] = useState(learning.channel ?? problemChannel ?? "");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const lineName = (id: string) => lines.find((l) => l.id === id)?.name ?? "Línea borrada";

  if (!editing) {
    return (
      <div className="space-y-3">
        <blockquote className="border-l-4 border-l-ink/30 pl-3 text-sm whitespace-pre-line">{learning.text}</blockquote>
        <div className="text-sm">
          <span className="text-soft">Aplica a: </span>
          {learning.applies_to_line_ids.length ? learning.applies_to_line_ids.map(lineName).join(", ") : "solo esta línea"}
        </div>
        {learning.suggested_hypothesis ? (
          <div className="text-sm">
            <span className="text-soft">Hipótesis derivada sugerida: </span>
            {learning.suggested_hypothesis}
          </div>
        ) : null}
        {learning.lever || learning.channel ? (
          <div className="text-sm">
            {learning.lever ? (
              <>
                <span className="text-soft">Palanca: </span>
                {leverLabel(learning.lever)}
              </>
            ) : null}
            {learning.lever && learning.channel ? <span className="text-soft"> · </span> : null}
            {learning.channel ? (
              <>
                <span className="text-soft">Canal: </span>
                {learning.channel}
              </>
            ) : null}
          </div>
        ) : null}
        {canEdit ? (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil aria-hidden /> Editar aprendizaje
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="learning-text">Aprendizaje</Label>
        <Textarea id="learning-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      <div className="flex flex-wrap gap-4">
        {lines
          .filter((l) => l.id !== ownLineId)
          .map((l) => (
            <label key={l.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={appliesTo.includes(l.id)}
                onCheckedChange={(c) => setAppliesTo((prev) => (c ? [...prev, l.id] : prev.filter((x) => x !== l.id)))}
              />
              {l.name}
            </label>
          ))}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="learning-suggested">Hipótesis derivada sugerida</Label>
        <Input id="learning-suggested" value={suggested} onChange={(e) => setSuggested(e.target.value)} />
      </div>
      {taxonomyReady ? (
        <LearningTaxonomyFields lever={lever} onLever={setLever} channel={channel} onChannel={setChannel} idPrefix="learning" />
      ) : null}
      {error ? <Callout title="No se pudo guardar">{error}</Callout> : null}
      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={pending || text.trim().length < 10}
          onClick={() =>
            startTransition(async () => {
              const r = await updateLearning(programId, learning.id, {
                text,
                appliesTo,
                suggestedHypothesis: suggested,
                // Solo se mandan si cambiaron: sin la migración K1 esas columnas no existen.
                ...(taxonomyReady && lever !== (learning.lever ?? "") ? { lever: lever || null } : {}),
                ...(taxonomyReady && channel.trim() !== (learning.channel ?? "") ? { channel: channel.trim() || null } : {}),
              });
              if (!r.ok) {
                setError(r.error);
                return;
              }
              setEditing(false);
              toast.success("¡Eso! Aprendizaje actualizado", { description: "Queda para el camino." });
              router.refresh();
            })
          }
        >
          {pending ? <Spinner /> : <Save aria-hidden />} Guardar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
