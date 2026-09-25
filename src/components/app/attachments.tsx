"use client";

import { Download, FileText, Paperclip, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { DeleteButton } from "@/components/app/delete-button";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { formatDateTime } from "@/domain/format";
import { createClient } from "@/lib/supabase/client";
import { ATTACHMENT_ACCEPT, ATTACHMENT_TYPES, resolveMime, validateAttachment } from "@/lib/validation/problems";
import { getAttachmentUrl, registerAttachment } from "@/server/actions/problems";
import type { AttachmentRow } from "@/server/queries/experiments";

function safeName(name: string) {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .slice(-120);
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
}

/** Sube archivos a Storage y los registra. Devuelve la cantidad subida. */
export async function uploadAttachments(
  programId: string,
  entityType: "problem" | "experiment",
  entityId: string,
  files: File[],
): Promise<{ uploaded: number; errors: string[] }> {
  const supabase = createClient();
  const errors: string[] = [];
  let uploaded = 0;
  for (const file of files) {
    const invalid = validateAttachment(file);
    if (invalid) {
      errors.push(invalid);
      continue;
    }
    const mime = resolveMime(file);
    const path = `${programId}/${entityType}/${entityId}/${crypto.randomUUID()}-${safeName(file.name)}`;
    const { error } = await supabase.storage.from("attachments").upload(path, file, { contentType: mime, upsert: false });
    if (error) {
      errors.push(`“${file.name}”: no se pudo subir (${error.message}).`);
      continue;
    }
    const r = await registerAttachment(programId, {
      entity_type: entityType,
      entity_id: entityId,
      storage_path: path,
      name: file.name,
      mime_type: mime,
      size_bytes: file.size,
    });
    if (!r.ok) errors.push(`“${file.name}”: ${r.error}`);
    else uploaded += 1;
  }
  return { uploaded, errors };
}

export function AttachmentList({
  programId,
  entityType,
  entityId,
  items,
  canUpload,
}: {
  programId: string;
  entityType: "problem" | "experiment";
  entityId: string;
  items: AttachmentRow[];
  canUpload: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [downloading, setDownloading] = useState<string>();

  function onFiles(files: FileList | null) {
    if (!files?.length) return;
    startTransition(async () => {
      const { uploaded, errors } = await uploadAttachments(programId, entityType, entityId, Array.from(files));
      if (uploaded) toast.success(uploaded === 1 ? "Adjunto guardado" : `${uploaded} adjuntos guardados`);
      for (const e of errors) toast.error(e);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  async function download(item: AttachmentRow) {
    setDownloading(item.id);
    const r = await getAttachmentUrl(item.storage_path);
    setDownloading(undefined);
    if (!r.ok) toast.error(r.error);
    else window.open(r.data.url, "_blank", "noopener");
  }

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-soft">
          <Paperclip className="size-4" aria-hidden /> Sin adjuntos. Sube capturas, reportes o bases que respalden la evidencia.
        </p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <FileText className="size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.name}</div>
                <div className="text-xs text-soft">
                  {ATTACHMENT_TYPES[a.mime_type] ?? a.mime_type} · {formatSize(a.size_bytes)} · {formatDateTime(a.created_at)}
                  {a.uploaded_by_name ? ` · ${a.uploaded_by_name}` : ""}
                </div>
              </div>
              <Button size="sm" variant="ghost" onClick={() => download(a)} disabled={downloading === a.id}>
                {downloading === a.id ? <Spinner /> : <Download aria-hidden />} Descargar
              </Button>
              {canUpload ? (
                <DeleteButton entity="attachment" id={a.id} programId={programId} name={a.name} variant="ghost" iconOnly />
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canUpload ? (
        <div>
          <input
            ref={input}
            type="file"
            multiple
            accept={ATTACHMENT_ACCEPT}
            className="sr-only"
            id={`upload-${entityId}`}
            onChange={(e) => onFiles(e.target.files)}
          />
          <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
            {pending ? <Spinner /> : <Upload aria-hidden />} Subir archivos
          </Button>
          <span className="ml-2 text-xs text-soft">PDF, imágenes, CSV o XLSX · máximo 20 MB.</span>
        </div>
      ) : null}
    </div>
  );
}
