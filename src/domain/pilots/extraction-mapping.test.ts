import { describe, expect, it } from "vitest";
import {
  effectiveConnectionStatus,
  extractionEntities,
  extractionToAdFacts,
  extractionToValues,
  isMetaAccountId,
  metricKeyMap,
  pickConnection,
  sameAccount,
  suggestEntityMap,
} from "./extraction-mapping";
import type { PilotMetricDef } from "./types";

const metric = (id: string, name: string, calc: PilotMetricDef["calc"] = "sum"): PilotMetricDef => ({
  id,
  name,
  unit: "count",
  direction: "up",
  scope: "platform",
  calc,
  numerator_id: null,
  denominator_id: null,
  is_spend: name === "Inversión",
});

const rows = [
  { date: "2026-09-21", entity: "Pospago | Control", metric: "spend", value: 100 },
  { date: "2026-09-21", entity: "Pospago | Variante B", metric: "spend", value: 120 },
  { date: "2026-09-22", entity: "Pospago | Variante B", metric: "spend", value: 80 },
  { date: "2026-09-22", entity: "Pospago | Variante B", metric: "conversations_started", value: 9 },
  { date: "2026-09-22", entity: "Otra campaña", metric: "spend", value: 999 },
  { date: "2026-09-22", entity: "Pospago | Control", metric: "cpm", value: 5 },
  { date: "2026-10-30", entity: "Pospago | Control", metric: "spend", value: 7 },
];

describe("mapeo de extracciones", () => {
  const arms = [
    { id: "c", name: "Control" },
    { id: "b", name: "Variante B" },
  ];

  it("sugiere grupo por nombre y respeta el mapeo anterior", () => {
    const entities = extractionEntities({ rows });
    expect(entities).toEqual(["Otra campaña", "Pospago | Control", "Pospago | Variante B"]);
    expect(suggestEntityMap(entities, arms)).toEqual({ "Otra campaña": null, "Pospago | Control": "c", "Pospago | Variante B": "b" });
    expect(suggestEntityMap(entities, arms, { previous: { "Otra campaña": "b" } })["Otra campaña"]).toBe("b");
    // Un id que ya no existe no se respeta.
    expect(suggestEntityMap(entities, arms, { previous: { "Pospago | Control": "zzz" } })["Pospago | Control"]).toBe("c");
    // Por la campaña del medio cuando hay una sola variante.
    expect(suggestEntityMap(["Otra campaña"], arms, { mediaCampaigns: ["otra campana"], singleVariantId: "b" })).toEqual({ "Otra campaña": "b" });
  });

  it("suma por grupo, métrica y periodo, y cuenta lo que no entra", () => {
    const catalog = [metric("inv", "Inversión"), metric("conv", "Conversaciones iniciadas"), metric("tasa", "Clics", "rate")];
    const ids = metricKeyMap(catalog);
    expect(ids).toEqual({ spend: "inv", conversations_started: "conv" });
    const map = { "Pospago | Control": "c", "Pospago | Variante B": "b", "Otra campaña": null };
    const day = extractionToValues({ rows }, map, ids, { granularity: "day", minDate: "2026-09-01", maxDate: "2026-09-30" });
    expect(day.values).toEqual([
      { arm_id: "b", metric_id: "inv", period_start: "2026-09-21", value: 120 },
      { arm_id: "c", metric_id: "inv", period_start: "2026-09-21", value: 100 },
      { arm_id: "b", metric_id: "conv", period_start: "2026-09-22", value: 9 },
      { arm_id: "b", metric_id: "inv", period_start: "2026-09-22", value: 80 },
    ]);
    // Mismo resultado sin importar el orden de las filas.
    expect(extractionToValues({ rows: [...rows].reverse() }, map, ids, { granularity: "day", minDate: "2026-09-01", maxDate: "2026-09-30" }).values).toEqual(
      day.values,
    );
    expect(day.skipped).toEqual({ unmapped: 1, unknownMetric: 1, outOfRange: 1, notInPilot: 0 });
    const week = extractionToValues({ rows }, map, ids, { granularity: "week", allowedMetricIds: ["inv"], maxDate: "2026-09-30" });
    expect(week.values).toEqual([
      { arm_id: "b", metric_id: "inv", period_start: "2026-09-21", value: 200 },
      { arm_id: "c", metric_id: "inv", period_start: "2026-09-21", value: 100 },
    ]);
    expect(week.skipped.notInPilot).toBe(1);
  });

  it("hechos diarios por campaña", () => {
    const facts = extractionToAdFacts({ rows });
    expect(facts.find((f) => f.day === "2026-09-22" && f.campaign_name === "Pospago | Variante B")).toMatchObject({ spend: 80, conversations: 9 });
    expect(facts).toHaveLength(5);
  });

  it("cuentas y conexiones", () => {
    expect(isMetaAccountId("act_123456")).toBe(true);
    expect(isMetaAccountId("123456")).toBe(false);
    expect(sameAccount("act_123", "123")).toBe(true);
    expect(sameAccount("", "")).toBe(false);
    const conns = [
      { id: "1", account_ref: "act_111", status: "connected" },
      { id: "2", account_ref: "act_222", status: "error" },
    ];
    expect(pickConnection(["111"], conns)?.id).toBe("1");
    expect(pickConnection(["act_222"], conns)).toBeNull();
    expect(pickConnection([null], conns)?.id).toBe("1");
    expect(pickConnection(["act_999"], conns)).toBeNull();
  });
});

describe("estado de la conexión", () => {
  it("un token vencido se ve como vencida", () => {
    const now = new Date("2026-09-27T12:00:00Z");
    expect(effectiveConnectionStatus({ status: "connected", expires_at: "2026-09-26T00:00:00Z" }, now)).toBe("expired");
    expect(effectiveConnectionStatus({ status: "connected", expires_at: null }, now)).toBe("connected");
    expect(effectiveConnectionStatus({ status: "error", expires_at: "2026-09-26T00:00:00Z" }, now)).toBe("error");
  });
});
