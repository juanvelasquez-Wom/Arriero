"use client";

import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatShortDate } from "@/domain/format";
import { formatPilotValue, type ChartPoint } from "@/domain/pilots/reading";
import type { PilotMetricDef } from "@/domain/pilots/types";

const AXIS = { fontSize: 12, fill: "var(--soft)" };
const TOOLTIP_STYLE = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 12,
};
// Grises de distinta intensidad; el amarillo queda solo para el ganador.
const VARIANT_STROKES = ["var(--ink)", "var(--gray-4)", "var(--gray-5)", "var(--soft)"];

export interface ChartArm {
  id: string;
  name: string;
  is_control: boolean;
}

/** Métrica principal por grupo y periodo. En geo y antes / después marca el inicio. */
export function PilotReadingChart({
  points,
  arms,
  metric,
  startPeriod,
  winnerId,
  caption,
}: {
  points: ChartPoint[];
  arms: ChartArm[];
  metric: Pick<PilotMetricDef, "calc" | "unit" | "name">;
  /** Primer periodo con el cambio (solo geo y antes / después). */
  startPeriod: string | null;
  winnerId: string | null;
  caption: string;
}) {
  const data = points.map((p) => ({ period: p.period, ...p.values }));
  const fmt = (v: unknown) => formatPilotValue(metric, typeof v === "number" ? v : null);
  let variantIndex = 0;
  const lines = arms.map((a) => {
    const stroke = a.id === winnerId ? "var(--accent-yellow)" : a.is_control ? "var(--gray-3)" : VARIANT_STROKES[variantIndex++ % VARIANT_STROKES.length];
    return { ...a, stroke };
  });

  return (
    <figure className="m-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div aria-hidden className="h-64 w-full tabular-nums">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 16, right: 12, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis
              dataKey="period"
              tickFormatter={(v: string) => formatShortDate(v)}
              tickLine={false}
              axisLine={{ stroke: "var(--line)" }}
              tick={AXIS}
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis tickFormatter={fmt} tickLine={false} axisLine={false} tick={AXIS} width={72} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              labelFormatter={(l) => formatShortDate(String(l))}
              formatter={(value, name) => [fmt(value), name]}
            />
            <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink)" }} iconType="plainline" />
            {startPeriod ? (
              <ReferenceLine
                x={startPeriod}
                stroke="var(--ink)"
                strokeDasharray="4 3"
                label={{ value: "Inicio", position: "insideTopLeft", fill: "var(--ink)", fontSize: 12 }}
              />
            ) : null}
            {lines.map((l) => (
              <Line
                key={l.id}
                type="monotone"
                dataKey={l.id}
                name={l.is_control ? `${l.name} (control)` : l.name}
                stroke={l.stroke}
                strokeWidth={l.id === winnerId ? 3 : 2}
                strokeDasharray={l.is_control ? "5 4" : undefined}
                dot={data.length <= 20 ? { r: 2.5 } : false}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Periodo</th>
            {arms.map((a) => (
              <th key={a.id} scope="col">
                {a.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.period}>
              <th scope="row">{formatShortDate(p.period)}</th>
              {arms.map((a) => (
                <td key={a.id}>{fmt(p.values[a.id])}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
