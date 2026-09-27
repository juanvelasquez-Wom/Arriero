"use client";

import { Banknote, Pencil, Plus, TriangleAlert } from "lucide-react";
import { InfoTip } from "@/components/app/info-tip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { METRIC_CALC_LABEL, METRIC_SCOPE_LABEL, PILOT_UNIT_LABEL, PLATFORM_METRIC_WARNING } from "@/domain/pilots/labels";
import { cn } from "@/lib/utils";
import { setMetricArchived } from "@/server/actions/pilots";
import type { CatalogMetric, MediaChannel } from "@/server/queries/pilots";
import { ArchiveButton, CatalogStateBadge } from "./catalog-bits";
import { DIRECTION_TEXT, MetricDefFormDialog } from "./metric-def-form-dialog";

export function MetricsTable({
  metrics,
  media,
  canWrite,
  isApprover,
}: {
  metrics: CatalogMetric[];
  media: MediaChannel[];
  canWrite: boolean;
  isApprover: boolean;
}) {
  const nameOf = new Map(metrics.map((m) => [m.id, m.name]));
  const mediaName = new Map(media.map((m) => [m.id, m.name]));
  const sorted = [...metrics].sort((a, b) => Number(!!a.archived_at) - Number(!!b.archived_at));

  const how = (m: CatalogMetric) => {
    if (m.calc === "sum") return METRIC_CALC_LABEL.sum;
    const num = m.numerator_id ? (nameOf.get(m.numerator_id) ?? "?") : "?";
    const den = m.denominator_id ? (nameOf.get(m.denominator_id) ?? "?") : "?";
    return (
      <>
        <span className="block">{METRIC_CALC_LABEL[m.calc]}</span>
        <span className="block text-xs text-soft">
          {num} ÷ {den}
        </span>
      </>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-soft">
          Las métricas que se cargan (sumas) y las que se calculan con ellas (tasas y costos por unidad). Las de negocio dicen si de verdad se vende más; las de
          plataforma, qué tan eficiente fue la pauta.
        </p>
        {canWrite ? (
          <MetricDefFormDialog
            metrics={metrics}
            media={media}
            isApprover={isApprover}
            trigger={
              <Button>
                <Plus aria-hidden /> Agregar métrica
              </Button>
            }
          />
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-dashed bg-paper py-10 text-center text-sm text-soft">Aún no hay métricas en el catálogo.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card" role="region" aria-label="Métricas (desplácese horizontalmente)" tabIndex={0}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Métrica</TableHead>
                <TableHead>Cómo se calcula</TableHead>
                <TableHead>Unidad</TableHead>
                <TableHead>Dirección</TableHead>
                <TableHead>Alcance</TableHead>
                <TableHead>Medio</TableHead>
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
                    <TableCell className="max-w-64 min-w-44 whitespace-normal">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium">
                        {m.name}
                        {m.is_spend ? (
                          <span className="inline-flex h-5 items-center gap-1 rounded-full border border-gray-3 bg-gray-1 px-1.5 text-[11px] font-semibold">
                            <Banknote aria-hidden className="size-3" /> Inversión
                          </span>
                        ) : null}
                      </div>
                      {m.description ? <div className="text-xs text-soft">{m.description}</div> : null}
                    </TableCell>
                    <TableCell className="min-w-44 whitespace-normal text-sm">{how(m)}</TableCell>
                    <TableCell className="text-sm">{PILOT_UNIT_LABEL[m.unit]}</TableCell>
                    <TableCell className="text-sm">{DIRECTION_TEXT[m.direction]}</TableCell>
                    <TableCell className="text-sm">
                      {m.scope === "platform" ? (
                        <span className="inline-flex items-center gap-1">
                          <TriangleAlert aria-hidden className="size-3.5" />
                          {METRIC_SCOPE_LABEL.platform}
                          <InfoTip label={METRIC_SCOPE_LABEL.platform}>{PLATFORM_METRIC_WARNING}</InfoTip>
                        </span>
                      ) : (
                        METRIC_SCOPE_LABEL[m.scope]
                      )}
                    </TableCell>
                    <TableCell className="text-sm">{m.media_id ? (mediaName.get(m.media_id) ?? "—") : <span className="text-soft">General</span>}</TableCell>
                    <TableCell>
                      <CatalogStateBadge archived={archived} />
                    </TableCell>
                    {isApprover ? (
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          <MetricDefFormDialog
                            metric={m}
                            metrics={metrics}
                            media={media}
                            isApprover
                            trigger={
                              <Button size="sm" variant="ghost" aria-label={`Editar ${m.name}`}>
                                <Pencil aria-hidden /> Editar
                              </Button>
                            }
                          />
                          <ArchiveButton archived={archived} name={m.name} onToggle={(a) => setMetricArchived(m.id, a)} />
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
