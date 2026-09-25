"use client";

import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDate, formatMetricValue, formatNumber, formatShortDate } from "@/domain/format";

export interface ChartTarget {
  label: string;
  value: number;
  /** Objetivo del horizonte en curso: se marca en amarillo (lo que se persigue ahora). */
  current: boolean;
}

/** Evolución semanal con línea base y objetivos como referencias. */
export function MetricEvolutionChart({
  name,
  values,
  baseline,
  targets,
  unit,
}: {
  name: string;
  values: { week_start: string; value: number }[];
  baseline: number | null;
  targets: ChartTarget[];
  unit: string | null;
}) {
  const data = values.map((v) => ({ week: v.week_start, value: v.value }));
  const last = values.at(-1);
  const summary = last
    ? `${name}: ${values.length} semanas cargadas; último valor ${formatMetricValue(last.value, unit)} la semana del ${formatDate(last.week_start)}.`
    : `${name}: sin valores cargados.`;

  return (
    <figure className="m-0">
      <div role="img" aria-label={summary} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 16, bottom: 4, left: 4 }}>
            <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="week"
              tickFormatter={(w: string) => formatShortDate(w)}
              tick={{ fill: "var(--soft)", fontSize: 11 }}
              stroke="var(--line)"
              minTickGap={24}
            />
            <YAxis
              tickFormatter={(v: number) => formatNumber(v)}
              tick={{ fill: "var(--soft)", fontSize: 11 }}
              stroke="var(--line)"
              width={64}
              domain={["auto", "auto"]}
            />
            <Tooltip
              contentStyle={{
                background: "var(--paper)",
                border: "1px solid var(--line)",
                borderRadius: 8,
                color: "var(--ink)",
                fontSize: 12,
              }}
              labelFormatter={(w) => `Semana del ${formatDate(String(w))}`}
              formatter={(v) => [formatMetricValue(Number(v), unit), "Valor"]}
            />
            {baseline != null ? (
              <ReferenceLine
                y={baseline}
                stroke="var(--gray-3)"
                strokeDasharray="6 4"
                ifOverflow="extendDomain"
                label={{ value: "Línea base", position: "insideTopLeft", fill: "var(--soft)", fontSize: 11 }}
              />
            ) : null}
            {targets.map((t) => (
              <ReferenceLine
                key={t.label}
                y={t.value}
                stroke={t.current ? "var(--accent-yellow)" : "var(--gray-4)"}
                strokeWidth={t.current ? 2 : 1}
                strokeDasharray={t.current ? undefined : "2 3"}
                ifOverflow="extendDomain"
                label={{ value: t.label, position: "insideTopRight", fill: "var(--ink)", fontSize: 11 }}
              />
            ))}
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--ink)"
              strokeWidth={2}
              dot={{ r: 2.5, fill: "var(--ink)" }}
              activeDot={{ r: 4 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-soft">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-0.5 w-4 bg-ink" /> Valor semanal
        </span>
        {baseline != null ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-gray-3" /> Línea base
          </span>
        ) : null}
        {targets.some((t) => t.current) ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="h-0.5 w-4 bg-highlight" /> Objetivo del horizonte en curso
          </span>
        ) : null}
        {targets.some((t) => !t.current) ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dotted border-gray-4" /> Otros objetivos
          </span>
        ) : null}
      </figcaption>
    </figure>
  );
}
