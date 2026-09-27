"use client";

import { Hand, Pencil, Plug, Plus } from "lucide-react";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MEDIA_DATA_MODE_LABEL } from "@/domain/pilots/labels";
import type { MediaDataMode } from "@/domain/pilots/types";
import { cn } from "@/lib/utils";
import { setMediaArchived } from "@/server/actions/pilots";
import type { MediaChannel } from "@/server/queries/pilots";
import { ArchiveButton, CatalogStateBadge } from "./catalog-bits";
import { MediaFormDialog } from "./media-form-dialog";
import { MergeMediaDialog } from "./merge-media-dialog";

const INTEGRATION_LABEL: Record<string, string> = { meta: "Meta Ads", google_ads: "Google Ads", ga4: "GA4", tiktok: "TikTok" };

export function DataModeBadge({ mode }: { mode: MediaDataMode }) {
  const Icon = mode === "mcp" ? Plug : Hand;
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium whitespace-nowrap",
        mode === "mcp" ? "border-gray-3 bg-gray-1" : "border-line bg-paper",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {MEDIA_DATA_MODE_LABEL[mode]}
    </span>
  );
}

export function MediaTable({ media, canWrite, isApprover }: { media: MediaChannel[]; canWrite: boolean; isApprover: boolean }) {
  const byId = new Map(media.map((m) => [m.id, m.name]));
  const sorted = [...media].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at) || a.name.localeCompare(b.name, "es-CO"));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-soft">
          Los medios donde corre la pauta. Cualquier creador agrega uno escribiendo su nombre; un aprobador lo edita, lo archiva o fusiona los duplicados.
        </p>
        <div className="flex flex-wrap gap-2">
          {isApprover ? <MergeMediaDialog media={media} /> : null}
          {canWrite ? (
            <MediaFormDialog
              trigger={
                <Button>
                  <Plus aria-hidden /> Agregar medio
                </Button>
              }
            />
          ) : null}
        </div>
      </div>

      <Callout tone="neutral" icon={Plug}>
        «Conectado» llega con las integraciones. Hoy todos los medios son manuales: los datos se cargan a mano o por CSV y nada se bloquea por eso.
      </Callout>

      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-paper py-10 text-center text-sm text-soft">Aún no hay medios en el catálogo.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card" role="region" aria-label="Medios (desplácese horizontalmente)" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medio</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Proveedor</TableHead>
                <TableHead>Modo de datos</TableHead>
                <TableHead>Integración</TableHead>
                <TableHead>Estado</TableHead>
                {isApprover ? (
                  <TableHead>
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((m) => {
                const archived = !!m.archived_at;
                return (
                  <TableRow key={m.id} className={cn(archived && "text-soft")}>
                    <TableCell className="font-medium">{m.name}</TableCell>
                    <TableCell>{m.kind ?? <span className="text-soft">—</span>}</TableCell>
                    <TableCell>{m.provider ?? <span className="text-soft">—</span>}</TableCell>
                    <TableCell>
                      <DataModeBadge mode={m.data_mode} />
                    </TableCell>
                    <TableCell>{m.integration ? (INTEGRATION_LABEL[m.integration] ?? m.integration) : <span className="text-soft">—</span>}</TableCell>
                    <TableCell>
                      <CatalogStateBadge archived={archived} mergedInto={m.merged_into_id ? (byId.get(m.merged_into_id) ?? "otro medio") : null} />
                    </TableCell>
                    {isApprover ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!m.merged_into_id ? (
                            <>
                              <MediaFormDialog
                                media={m}
                                trigger={
                                  <Button size="sm" variant="ghost" aria-label={`Editar ${m.name}`}>
                                    <Pencil aria-hidden /> Editar
                                  </Button>
                                }
                              />
                              <ArchiveButton archived={archived} name={m.name} onToggle={(a) => setMediaArchived(m.id, a)} />
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
