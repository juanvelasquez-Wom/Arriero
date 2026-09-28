"use client";

import { CloudDownload, Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { FormError } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatDateTime, formatNumber } from "@/domain/format";
import type { EntityMap } from "@/domain/pilots/extraction-mapping";
import {
  applyPilotSnapshot,
  fetchPilotMetaData,
  getSnapshotDetail,
  type FetchedExtraction,
  type SnapshotDetail,
} from "@/server/actions/pilot-integrations";

const SKIP = "__skip__";

/**
 * "Traer datos de Meta": extrae el rango del piloto (queda un snapshot) y, antes
 * de guardar, la persona confirma a qué grupo va cada campaña, conjunto o anuncio.
 */
export function MetaFetchButton({ pilotId }: { pilotId: string }) {
  const router = useRouter();
  const [fetched, setFetched] = useState<FetchedExtraction | null>(null);
  const [map, setMap] = useState<EntityMap>({});
  const [error, setError] = useState<string>();
  const [fetching, startFetch] = useTransition();
  const [saving, startSave] = useTransition();

  function fetchData() {
    startFetch(async () => {
      const r = await fetchPilotMetaData(pilotId);
      if (!r.ok) {
        toast.error(r.error);
        router.refresh();
        return;
      }
      setError(undefined);
      setMap(r.data.suggested);
      setFetched(r.data);
    });
  }

  function apply() {
    if (!fetched) return;
    setError(undefined);
    startSave(async () => {
      const r = await applyPilotSnapshot(pilotId, fetched.snapshotId, map);
      if (!r.ok) return setError(r.error);
      toast.success(r.message ?? "Datos guardados.");
      setFetched(null);
      router.refresh();
    });
  }

  const mapped = Object.values(map).filter(Boolean).length;

  return (
    <>
      <Button type="button" variant="outline" onClick={fetchData} disabled={fetching}>
        {fetching ? <Spinner /> : <CloudDownload aria-hidden />}
        {fetching ? "Trayendo datos de Meta…" : "Traer datos de Meta"}
      </Button>
      <Dialog open={!!fetched} onOpenChange={(o) => (o ? null : setFetched(null))}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>¿A qué grupo va cada campaña?</DialogTitle>
            <DialogDescription>
              {fetched
                ? `Meta devolvió ${formatNumber(fetched.rows)} filas del ${formatDate(fetched.dateFrom)} al ${formatDate(fetched.dateTo)}. Revise el reparto antes de guardar; lo cargado a mano no se pisa.`
                : null}
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} />
          <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
            {fetched?.entities.map((entity, i) => (
              <div key={entity} className="grid items-center gap-2 rounded-lg border px-3 py-2 sm:grid-cols-[minmax(0,1fr)_14rem]">
                <label htmlFor={`entity-${i}`} className="min-w-0 break-words text-sm font-medium">
                  {entity}
                </label>
                <Select value={map[entity] ?? SKIP} onValueChange={(v) => setMap((m) => ({ ...m, [entity]: v === SKIP ? null : v }))}>
                  <SelectTrigger id={`entity-${i}`} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SKIP}>No usar</SelectItem>
                    {fetched.arms.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                        {a.is_control ? " (control)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFetched(null)}>
              Cancelar
            </Button>
            <Button type="button" onClick={apply} disabled={saving || mapped === 0}>
              {saving ? <Spinner /> : null}
              Guardar datos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const STATUS_TEXT: Record<SnapshotDetail["status"], string> = { ok: "Válida", invalid: "No pasó la validación", error: "Con error" };

/** "¿De dónde sale este número?": la extracción que originó un dato. */
export function SnapshotSourceButton({ pilotId, snapshotId }: { pilotId: string; snapshotId: string }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<SnapshotDetail | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next && !detail) {
      startTransition(async () => {
        const r = await getSnapshotDetail(pilotId, snapshotId);
        if (r.ok) setDetail(r.data);
        else setError(r.error);
      });
    }
  }

  const rows: [string, string][] = detail
    ? [
        ["Extraído", formatDateTime(detail.created_at)],
        ["Cuenta", detail.account_ref ?? "—"],
        ["Rango", `${formatDate(detail.date_from)} – ${formatDate(detail.date_to)}`],
        ["Estado", STATUS_TEXT[detail.status]],
        ["Intentos", String(detail.attempts)],
        ["Tokens", `${formatNumber(detail.input_tokens)} de entrada · ${formatNumber(detail.output_tokens)} de salida`],
        ["Modelo", detail.model ?? "—"],
      ]
    : [];

  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="h-6 px-1.5 text-xs" onClick={() => onOpenChange(true)}>
        <Info aria-hidden className="size-3.5" />
        ¿De dónde sale?
      </Button>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>¿De dónde sale este número?</DialogTitle>
            <DialogDescription>De esta extracción de la plataforma. La IA solo leyó el reporte; las cuentas las hace Arriero.</DialogDescription>
          </DialogHeader>
          {pending ? (
            <div className="flex items-center gap-2 text-sm text-soft">
              <Spinner /> Buscando la extracción…
            </div>
          ) : error ? (
            <FormError message={error} />
          ) : detail ? (
            <div className="space-y-3">
              <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                {rows.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-soft">{k}</dt>
                    <dd className="tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
              {detail.error ? <p className="text-sm text-soft">Detalle: {detail.error}</p> : null}
              {detail.validatedPreview ? (
                <details className="rounded-lg border">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
                    JSON validado ({formatNumber(detail.totalRows)} filas{detail.totalRows > 200 ? ", se muestran 200" : ""})
                  </summary>
                  <pre className="max-h-72 overflow-auto border-t bg-wash p-3 text-xs">{detail.validatedPreview}</pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
