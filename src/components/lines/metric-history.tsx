import { History } from "lucide-react";
import { formatDateTime, formatMetricValue, formatShortDate } from "@/domain/format";
import type { MetricHistoryRow } from "@/server/queries/structure";

/** "Historial de cambios": correcciones de valores ya cargados (quién, qué y cuándo). */
export function MetricHistoryList({ rows, unit, limit = 10 }: { rows: MetricHistoryRow[]; unit: string | null; limit?: number }) {
  return (
    <div>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-soft">
        <History aria-hidden className="size-3.5" /> Historial de cambios
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-soft">Ningún valor se ha corregido. Cuando alguien cambie un dato ya cargado, queda aquí.</p>
      ) : (
        <ul className="divide-y rounded-xl border text-sm">
          {rows.slice(0, limit).map((h) => {
            const valueChanged = h.old_value !== h.new_value;
            return (
              <li key={h.id} className="px-3 py-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span>
                    Semana del {formatShortDate(h.week_start)}:{" "}
                    {valueChanged ? (
                      <span className="tabular-nums">
                        <span className="text-soft line-through">{formatMetricValue(h.old_value, unit)}</span> →{" "}
                        <span className="font-medium">{formatMetricValue(h.new_value, unit)}</span>
                      </span>
                    ) : (
                      <span className="text-soft">cambió la nota</span>
                    )}
                  </span>
                  <span className="text-xs text-soft">{formatDateTime(h.changed_at)}</span>
                </div>
                <div className="text-xs text-soft">
                  {h.changed_by_name ?? "Alguien del equipo"}
                  {h.new_note && h.new_note !== h.old_note ? ` · Nota: “${h.new_note}”` : ""}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > limit ? <p className="mt-1 text-xs text-soft">Y {rows.length - limit} cambios más antiguos.</p> : null}
    </div>
  );
}
