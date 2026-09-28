import { TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatNumber, formatPercent } from "@/domain/format";
import { CAMPAIGN_FLAG_LABEL, type CampaignRow } from "@/domain/pilots/campaigns";
import { formatCop } from "@/domain/value";
import { Trend } from "./trend";

/** Tabla de campañas del rango con su tendencia y lo que pide atención. */
export function CampaignsTable({ rows }: { rows: CampaignRow[] }) {
  return (
    <div className="overflow-x-auto">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Campaña</TableHead>
            <TableHead className="text-right">Inversión</TableHead>
            <TableHead className="text-right">Impresiones</TableHead>
            <TableHead className="text-right">Clics</TableHead>
            <TableHead className="text-right">CTR</TableHead>
            <TableHead className="text-right">CPC</TableHead>
            <TableHead className="text-right">Conversaciones</TableHead>
            <TableHead className="text-right">Costo por conversación</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.campaign}>
              <TableCell className="max-w-72">
                <span className="block break-words font-medium">{r.campaign}</span>
                {r.flags.length ? (
                  <span className="mt-1 flex flex-wrap gap-1">
                    {r.flags.map((f) => (
                      <span key={f} className="inline-flex h-6 items-center gap-1 rounded-full border border-highlight bg-highlight/15 px-2 text-xs font-medium">
                        <TriangleAlert aria-hidden className="size-3.5" />
                        {CAMPAIGN_FLAG_LABEL[f]}
                      </span>
                    ))}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="text-right">
                <span className="block">{formatCop(r.current.spend)}</span>
                <Trend change={r.change.spend} neutral />
              </TableCell>
              <TableCell className="text-right">{formatNumber(r.current.impressions)}</TableCell>
              <TableCell className="text-right">{formatNumber(r.current.clicks)}</TableCell>
              <TableCell className="text-right">
                <span className="block">{formatPercent(r.current.ctr)}</span>
                <Trend change={r.change.ctr} />
              </TableCell>
              <TableCell className="text-right">{formatCop(r.current.cpc)}</TableCell>
              <TableCell className="text-right">
                <span className="block">{formatNumber(r.current.conversations)}</span>
                <Trend change={r.change.conversations} />
              </TableCell>
              <TableCell className="text-right">
                <span className="block">{formatCop(r.current.costPerConversation)}</span>
                <Trend change={r.change.costPerConversation} lowerIsBetter />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
