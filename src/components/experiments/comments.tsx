"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MessageSquare, Send, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { relativeTime } from "@/domain/comments";
import { createClient } from "@/lib/supabase/client";
import { commentSchema, type CommentInput } from "@/lib/validation/comments";
import { addComment, deleteComment } from "@/server/actions/comments";

export interface CommentItem {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
  /** Lo decide el servidor con la regla de dominio (autor o admin). */
  canDelete: boolean;
  own: boolean;
}

const MAX = 4000;

/** Conversación del ejercicio: lista, publicar y borrar los propios. */
export function ExperimentComments({
  programId,
  experimentId,
  comments,
  ready,
  canPost,
}: {
  programId: string;
  experimentId: string;
  comments: CommentItem[];
  ready: boolean;
  canPost: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const form = useForm<CommentInput>({ resolver: zodResolver(commentSchema), defaultValues: { body: "" } });
  const body = useWatch({ control: form.control, name: "body" }) ?? "";
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Los comentarios de otras personas llegan en vivo (Realtime respeta RLS).
  useEffect(() => {
    if (!ready) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`comments-${experimentId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "experiment_comments", filter: `experiment_id=eq.${experimentId}` },
        () => {
          if (refreshTimer.current) clearTimeout(refreshTimer.current);
          refreshTimer.current = setTimeout(() => router.refresh(), 500);
        },
      )
      .subscribe();
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [experimentId, ready, router]);

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const r = await addComment(programId, experimentId, values);
      if (!r.ok) {
        applyFieldErrors(r.fieldErrors, form.setError);
        setError(r.error);
        return;
      }
      form.reset({ body: "" });
      toast.success("¡Eso! Comentario publicado");
      router.refresh();
    });
  });

  function remove(id: string) {
    setDeleting(id);
    startTransition(async () => {
      const r = await deleteComment(programId, id);
      setDeleting(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Listo pues: comentario borrado");
      router.refresh();
    });
  }

  if (!ready) {
    return <p className="text-sm text-soft">Los comentarios se activan cuando se aplique la actualización de la base.</p>;
  }

  return (
    <div className="space-y-4">
      {comments.length ? (
        <ol className="space-y-3" aria-label="Comentarios">
          {comments.map((c) => (
            <li key={c.id} className="rounded-xl border bg-paper px-3 py-2">
              <div className="flex items-start justify-between gap-2">
                <div className="text-xs text-soft">
                  <span className="font-medium text-ink">{c.author_name ?? "Alguien que ya no está"}</span>
                  {c.own ? " (usted)" : ""} · <time dateTime={c.created_at}>{relativeTime(c.created_at)}</time>
                </div>
                {c.canDelete ? (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label="Borrar comentario"
                    disabled={pending && deleting === c.id}
                    onClick={() => remove(c.id)}
                  >
                    <Trash2 aria-hidden className="size-3.5" />
                  </Button>
                ) : null}
              </div>
              <p className="mt-1 text-sm whitespace-pre-line">{c.body}</p>
            </li>
          ))}
        </ol>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-dashed px-3 py-4 text-sm text-soft">
          <MessageSquare aria-hidden className="size-4" />
          Todavía no hay comentarios. Aquí se conversa el ejercicio: dudas, contexto, lo que se vio en campo. Arranque usted.
        </div>
      )}

      {canPost ? (
        <form onSubmit={onSubmit} className="space-y-2" noValidate>
          <FormField
            id="comment-body"
            label="Nuevo comentario"
            error={form.formState.errors.body?.message}
            description={`${body.length.toLocaleString("es-CO")} / ${MAX.toLocaleString("es-CO")}`}
          >
            <Textarea
              id="comment-body"
              rows={3}
              maxLength={MAX}
              placeholder="¿Qué vio? ¿Qué duda tiene? Escriba sin afán."
              aria-invalid={!!form.formState.errors.body || undefined}
              {...form.register("body")}
            />
          </FormField>
          <FormError message={error} />
          <SubmitButton pending={pending && !deleting} disabled={!body.trim()}>
            <Send aria-hidden /> Comentar
          </SubmitButton>
        </form>
      ) : (
        <p className="text-xs text-soft">Puede leer la conversación; comentan quienes editan este ejercicio.</p>
      )}
    </div>
  );
}
