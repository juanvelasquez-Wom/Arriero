import { TriangleAlert } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate, formatNumber, formatPercent } from "@/domain/format";
import { gapText, type ReconciliationRow } from "@/domain/pilots/reconciliation";
import { formatCop } from "@/domain/value";

const SIDE_TEXT: Record<ReconciliationRow["side"], string | null> = {
  both: null,
  platform_only: "Sin ventas del negocio con ese nombre de campaña",
  business_only: "Sin datos de la plataforma con ese nombre de campaña",
};

/** Conciliación por campaña (y semana): plataforma vs. negocio. */
export function ReconciliationTable({ rows, byWeek }: { rows: ReconciliationRow[]; byWeek: boolean }) {
  return (
    <div className="overflow-x-auto">
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Campaña</TableHead>
            {byWeek ? <TableHead>Semana</TableHead> : null}
            <TableHead className="text-right">Conversaciones (plataforma)</TableHead>
            <TableHead className="text-right">Ventas (negocio)</TableHead>
            <TableHead className="text-right">Conversación → venta</TableHead>
            <TableHead className="text-right">CAC real</TableHead>
            <TableHead>Brecha</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.campaign}|${r.period ?? ""}`}>
              <TableCell className="max-w-64">
                <span className="block break-words font-medium">{r.campaign}</span>
                {r.channels.length ? <span className="text-xs text-soft">{r.channels.join(", ")}</span> : null}
              </TableCell>
              {byWeek ? <TableCell>{r.period ? formatDate(r.period) : "—"}</TableCell> : null}
              <TableCell className="text-right">{formatNumber(r.conversations)}</TableCell>
              <TableCell className="text-right">{formatNumber(r.sales)}</TableCell>
              <TableCell className="text-right">{formatPercent(r.conversationToSale)}</TableCell>
              <TableCell className="text-right">
                <span className="block">{formatCop(r.realCac)}</span>
                {r.platformCostPerConversation != null ? (
                  <span className="text-xs text-soft">Plataforma: {formatCop(r.platformCostPerConversation)} por conversación</span>
                ) : null}
              </TableCell>
              <TableCell className="max-w-72 text-sm">
                {SIDE_TEXT[r.side] ? <span className="text-soft">{SIDE_TEXT[r.side]}</span> : <span>{gapText(r)}</span>}
                {r.doubleCountRisk ? (
                  <span className="mt-1 flex items-start gap-1 rounded-md border border-highlight bg-highlight/15 px-2 py-1 text-xs font-medium">
                    <TriangleAlert aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                    El negocio registra más ventas que conversaciones: puede haber doble conteo o ventas de otros canales con este nombre.
                  </span>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
