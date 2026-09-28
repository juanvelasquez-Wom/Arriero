"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { authorLabel, IDEA_TITLE_MAX, IDEA_TITLE_MIN, type IdeaRow } from "@/domain/ideas";
import { cn } from "@/lib/utils";
import { deleteIdea, updateIdea } from "@/server/actions/ideas";

/** Menú de una idea: corregir (mientras llueve) y borrar. */
export function IdeaMenu({ idea, canEdit, canRemove, onEdit }: { idea: IdeaRow; canEdit: boolean; canRemove: boolean; onEdit?: () => void }) {
  const router = useRouter();
  if (!canEdit && !canRemove) return null;
  return (
    <div className="flex shrink-0 items-center">
      {canEdit ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Opciones de «${idea.title}»`}>
              <MoreHorizontal aria-hidden className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onEdit?.()}>
              <Pencil aria-hidden className="size-4" /> Corregir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      {canRemove ? (
        <ConfirmAction
          title="¿Borrar esta idea?"
          description="Se va del aguacero para todos, con sus puntajes. Si solo no convenció, mejor que la entierren al decidir."
          confirmLabel="Sí, borrar"
          onConfirm={async () => {
            const r = await deleteIdea(idea.id);
            if (!r.ok) return r.error;
            toast.success(r.message);
            router.refresh();
          }}
        >
          <Button variant="ghost" size="icon-sm" aria-label={`Borrar «${idea.title}»`}>
            <Trash2 aria-hidden className="size-4" />
          </Button>
        </ConfirmAction>
      ) : null}
    </div>
  );
}

/** Tarjeta de idea mientras llueve: se lee, se corrige y se borra. */
export function IdeaItem({ idea, canEdit, canRemove }: { idea: IdeaRow; canEdit: boolean; canRemove: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [detail, setDetail] = useState(idea.detail ?? "");
  const [anonymous, setAnonymous] = useState(idea.anonymous);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  if (editing) {
    return (
      <li className="rounded-2xl border bg-paper p-4 shadow-card">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(undefined);
            start(async () => {
              const r = await updateIdea(idea.id, { title, detail, anonymous });
              if (!r.ok) {
                setError(r.fieldErrors ? (Object.values(r.fieldErrors)[0]?.[0] ?? r.error) : r.error);
                return;
              }
              toast.success(r.message);
              setEditing(false);
              router.refresh();
            });
          }}
        >
          <Input aria-label="La idea" value={title} maxLength={IDEA_TITLE_MAX} autoFocus onChange={(e) => setTitle(e.target.value)} />
          <Textarea
            aria-label="Detalle"
            value={detail}
            rows={2}
            maxLength={2000}
            placeholder="Detalle opcional: cómo, para quién, cuánto costaría…"
            onChange={(e) => setDetail(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={anonymous} onChange={(e) => setAnonymous(e.target.checked)} className="size-4 accent-[#111111]" />
            Mostrarla en anónimo
          </label>
          {error ? (
            <p role="alert" className="rounded-xl bg-wash px-3 py-2 text-sm font-medium">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending || title.trim().length < IDEA_TITLE_MIN}>
              Guardar
            </Button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className="pop-in">
      <article className={cn("flex h-full gap-2 rounded-2xl border bg-paper p-4 shadow-card", idea.mine && "border-ink/30")}>
        <div className="min-w-0 flex-1">
          <p className="text-pretty font-medium leading-snug">{idea.title}</p>
          {idea.detail ? <p className="mt-1 line-clamp-3 text-sm text-soft">{idea.detail}</p> : null}
          <p className="mt-2 text-xs text-soft">{authorLabel(idea)}</p>
        </div>
        <IdeaMenu idea={idea} canEdit={canEdit} canRemove={canRemove} onEdit={() => setEditing(true)} />
      </article>
    </li>
  );
}
