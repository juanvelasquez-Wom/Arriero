"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXIS = { fontSize: 12, fill: "var(--soft)" };
const TOOLTIP_STYLE = {
  background: "var(--paper)",
  border: "1px solid var(--line)",
  borderRadius: 8,
  color: "var(--ink)",
  fontSize: 12,
};

export interface CountDatum {
  key: string;
  label: string;
  value: number;
  /** Amarillo solo para lo que exige atención (p. ej. ganadores). */
  highlight?: boolean;
}

/**
 * Barras de conteo por categoría. Cada barra lleva su valor escrito y la
 * categoría en el eje, así que no depende del color. Incluye una tabla
 * equivalente para lectores de pantalla.
 */
export function CountBarChart({ data, caption, unit = "ejercicios" }: { data: CountDatum[]; caption: string; unit?: string }) {
  return (
    <figure className="m-0">
      <figcaption className="sr-only">{caption}</figcaption>
      <div aria-hidden className="h-56 w-full tabular-nums">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 8, bottom: 0, left: -16 }} accessibilityLayer={false}>
            <CartesianGrid vertical={false} stroke="var(--line)" />
            <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--line)" }} tick={AXIS} interval={0} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS} />
            <Tooltip
              cursor={{ fill: "var(--wash)" }}
              contentStyle={TOOLTIP_STYLE}
              formatter={(value) => [`${value} ${unit}`, "Cantidad"]}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={56}>
              {data.map((d) => (
                <Cell
                  key={d.key}
                  fill={d.highlight ? "var(--accent-yellow)" : "var(--gray-4)"}
                  stroke={d.highlight ? "var(--ink)" : "none"}
                />
              ))}
              <LabelList dataKey="value" position="top" style={{ fill: "var(--ink)", fontSize: 12, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{caption}</caption>
        <thead>
          <tr>
            <th scope="col">Categoría</th>
            <th scope="col">Cantidad</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{d.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export interface VelocityDatum {
  week: string;
  label: string;
  launched: number;
  closed: number;
}

/** Lanzados vs cerrados por semana (la tabla accesible va aparte, visible). */
export function VelocityChart({ data }: { data: VelocityDatum[] }) {
  return (
    <div aria-hidden className="h-64 w-full tabular-nums">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, bottom: 0, left: -16 }} barGap={2} accessibilityLayer={false}>
          <CartesianGrid vertical={false} stroke="var(--line)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--line)" }} tick={AXIS} interval="preserveStartEnd" />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS} />
          <Tooltip cursor={{ fill: "var(--wash)" }} contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Semana del ${l}`} />
          <Legend wrapperStyle={{ fontSize: 12, color: "var(--ink)" }} iconType="square" />
          <Bar dataKey="launched" name="Lanzados" fill="var(--gray-3)" radius={[3, 3, 0, 0]} maxBarSize={18} />
          <Bar dataKey="closed" name="Cerrados" fill="var(--ink)" radius={[3, 3, 0, 0]} maxBarSize={18} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
