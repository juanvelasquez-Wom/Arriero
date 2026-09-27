import { ArrowRight, CalendarRange, Radio, UserRound } from "lucide-react";
import Link from "next/link";
import { DecisionBadge, DemoBadge } from "@/components/app/status-badge";
import { PilotStatusBadge, PilotTestTypeBadge } from "@/components/pilots/pilot-badges";
import { PilotTerm } from "@/components/pilots/pilot-term";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateRange, formatPercent, formatSignedPercent } from "@/domain/format";
import { budgetProgress, pilotRange, type HeadlineResult } from "@/domain/pilots/portfolio";
import { formatCop } from "@/domain/value";
import { cn } from "@/lib/utils";
import type { PilotListItem } from "@/server/queries/pilots";

export interface PortfolioItem extends PilotListItem {
  result: HeadlineResult | null;
  /** Nombre de la variante del resultado. */
  resultArmName: string | null;
}

/** Inversión planeada vs. ejecutada con una barra mínima. */
export function BudgetBar({ planned, spent, className }: { planned: number | null; spent: number; className?: string }) {
  const { pct, over } = budgetProgress(planned, spent);
  return (
    <div className={cn("min-w-32", className)}>
      <div className="flex items-baseline justify-between gap-2 text-xs tabular-nums">
        <span className="font-medium">{formatCop(spent)}</span>
        <span className="text-soft">de {formatCop(planned)}</span>
      </div>
      <div
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-1"
        role="img"
        aria-label={pct == null ? "Sin inversión planeada" : `Ejecutado ${Math.round(pct)} % de lo planeado${over ? ", ya se pasó" : ""}`}
      >
        {pct != null ? (
          <div className={cn("fill-in h-full rounded-full", over ? "bg-ink" : "bg-gray-4")} style={{ width: `${Math.max(pct, 2)}%` }} />
        ) : null}
      </div>
      {over ? <div className="mt-0.5 text-[11px] font-medium">Se pasó de lo planeado</div> : null}
    </div>
  );
}

/** Resultado de la mejor variante: probabilidad de ganar y diferencia vs. control. */
export function PilotResult({ item }: { item: PortfolioItem }) {
  if (!item.result) {
    return <span className="text-xs text-soft">{item.status === "in_test" ? "Todavía no se sabe" : "—"}</span>;
  }
  const { probability, liftPct } = item.result;
  return (
    <div className="text-xs tabular-nums">
      <div>
        <span className="font-semibold">{formatPercent(probability)}</span> <span className="text-soft">prob. de ganar</span>
      </div>
      <div>
        <span className="font-semibold">{formatSignedPercent(liftPct == null ? null : liftPct / 100)}</span>{" "}
        <span className="text-soft">vs. control{item.resultArmName ? ` · ${item.resultArmName}` : ""}</span>
      </div>
    </div>
  );
}

function dates(item: PilotListItem) {
  const { start, end } = pilotRange(item);
  return formatDateRange(start, end);
}

export function PilotTable({ items }: { items: PortfolioItem[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card" role="region" aria-label="Pilotos (desplácese horizontalmente)" tabIndex={0}>
      <Table className="tabular-nums">
        <TableHeader>
          <TableRow>
            <TableHead>Piloto</TableHead>
            <TableHead>Qué se prueba</TableHead>
            <TableHead>Canal</TableHead>
            <TableHead>Inversión</TableHead>
            <TableHead>
              <PilotTerm k="probabilityToWin">Resultado</PilotTerm>
            </TableHead>
            <TableHead>Decisión</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Fechas</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="max-w-72 min-w-56 whitespace-normal">
                <Link href={`/pilotos/${p.id}`} className="font-medium hover:underline">
                  {p.title}
                </Link>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <PilotStatusBadge status={p.status} className="h-5 px-1.5 text-[11px]" />
                  {p.is_example ? <DemoBadge /> : null}
                </div>
              </TableCell>
              <TableCell className="min-w-48 whitespace-normal">
                <div className="text-sm">{p.variable_name ?? <span className="text-soft">Sin variable</span>}</div>
                <PilotTestTypeBadge testType={p.test_type} className="mt-1" />
              </TableCell>
              <TableCell className="text-sm whitespace-normal">{p.media_names.length ? p.media_names.join(", ") : <span className="text-soft">—</span>}</TableCell>
              <TableCell>
                <BudgetBar planned={p.planned_budget_cop} spent={p.spent_cop} />
              </TableCell>
              <TableCell>
                <PilotResult item={p} />
              </TableCell>
              <TableCell>
                <DecisionBadge decision={p.decision} />
              </TableCell>
              <TableCell className="text-sm">{p.owner_name ?? <span className="text-soft">Sin responsable</span>}</TableCell>
              <TableCell className="text-sm">{dates(p)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function PilotCards({ items }: { items: PortfolioItem[] }) {
  return (
    <ul className="stagger grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((p) => (
        <li key={p.id}>
          <Link href={`/pilotos/${p.id}`} className="lift group flex h-full flex-col gap-3 rounded-2xl border bg-paper p-5 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base leading-snug font-bold">{p.title}</h2>
              {p.is_example ? <DemoBadge className="shrink-0" /> : null}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <PilotStatusBadge status={p.status} />
              <PilotTestTypeBadge testType={p.test_type} />
            </div>
            <div className="text-sm">
              <span className="text-soft">Qué se prueba: </span>
              {p.variable_name ?? "Sin variable"}
            </div>
            <BudgetBar planned={p.planned_budget_cop} spent={p.spent_cop} />
            <div className="flex flex-wrap items-end justify-between gap-2">
              <PilotResult item={p} />
              <DecisionBadge decision={p.decision} />
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-3 text-xs text-soft">
              <span className="inline-flex items-center gap-1">
                <Radio aria-hidden className="size-3.5" />
                {p.media_names.length ? p.media_names.join(", ") : "Sin canal"}
              </span>
              <span className="inline-flex items-center gap-1">
                <UserRound aria-hidden className="size-3.5" />
                {p.owner_name ?? "Sin responsable"}
              </span>
              <span className="inline-flex items-center gap-1 tabular-nums">
                <CalendarRange aria-hidden className="size-3.5" />
                {dates(p)}
              </span>
              <ArrowRight aria-hidden className="ml-auto size-4 text-ink transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
