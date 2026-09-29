// Cuánto cuesta La Tía: precios por millón de tokens y estimaciones por flujo.
// Precios de lista de Anthropic en USD. Si cambian, se actualizan aquí.

export interface ModelPrice {
  input: number;
  output: number;
  cacheWrite: number;
  cacheRead: number;
}

/**
 * USD por millón de tokens, por familia de modelo (se busca por prefijo del id).
 * Haiku 4.5: precio de lista. Sonnet: se asume el precio de lista de la familia
 * Sonnet (USD 3 / 15); confírmelo en la consola de Anthropic y ajústelo aquí.
 */
export const TIA_PRICES: { prefix: string; label: string; price: ModelPrice }[] = [
  { prefix: "claude-haiku", label: "Haiku", price: { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } },
  { prefix: "claude-sonnet", label: "Sonnet", price: { input: 3, output: 15, cacheWrite: 3.75, cacheRead: 0.3 } },
];

/** Pesos por dólar para mostrar costos (aproximado; se cambia con TIA_USD_COP). */
export const DEFAULT_USD_COP = 4000;

export function usdCop(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_USD_COP;
}

export function priceFor(model: string): ModelPrice {
  return (TIA_PRICES.find((p) => model.startsWith(p.prefix)) ?? TIA_PRICES[1]).price;
}

export interface UsageForCost {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

/** Costo en USD de una llamada. */
export function costUsd(u: UsageForCost): number {
  const p = priceFor(u.model);
  return (
    (u.inputTokens * p.input + u.outputTokens * p.output + (u.cacheReadTokens ?? 0) * p.cacheRead + (u.cacheWriteTokens ?? 0) * p.cacheWrite) /
    1_000_000
  );
}

/**
 * Tokens aproximados de un texto en español. Calibrado con llamadas reales del
 * 28 sep 2026 (JSON y español con tildes): ≈ 2,8 caracteres por token.
 */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 2.8);
}

export interface CallEstimate {
  what: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface FlowEstimate {
  key: string;
  label: string;
  calls: CallEstimate[];
  usd: number;
  cop: number;
}

export function estimateFlow(key: string, label: string, calls: CallEstimate[], rate = DEFAULT_USD_COP): FlowEstimate {
  const usd = calls.reduce((sum, c) => sum + costUsd(c), 0);
  return { key, label, calls, usd, cop: Math.round(usd * rate) };
}

/** "COP 42" / "USD 0,011". */
export function formatCop(cop: number): string {
  return `COP ${Math.round(cop).toLocaleString("es-CO")}`;
}
export function formatUsd(usd: number): string {
  return `USD ${usd.toLocaleString("es-CO", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}
