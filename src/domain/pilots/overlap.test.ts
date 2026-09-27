import { describe, expect, it } from "vitest";
import { dateIntersection, describeOverlap, findOverlap, overlapsFor } from "./overlap";
import type { PilotSummary } from "./types";

const base = (over: Partial<PilotSummary>): PilotSummary => ({
  id: "a",
  title: "A",
  status: "in_test",
  test_type: "ab_platform",
  start: "2026-10-05",
  end: "2026-11-01",
  media: [],
  arm_cities: [],
  ...over,
});

const meta = (over: Partial<PilotSummary["media"][number]> = {}) => ({
  media_id: "meta",
  media_name: "Meta Ads",
  account: "WOM CO",
  campaign: "CTWA Pospago",
  audience: null,
  destination: null,
  cities: [],
  ...over,
});

describe("cruces entre pilotos", () => {
  it("intersección de fechas", () => {
    expect(dateIntersection("2026-10-01", "2026-10-31", "2026-10-15", "2026-11-15")).toEqual({ from: "2026-10-15", to: "2026-10-31" });
    expect(dateIntersection("2026-10-01", "2026-10-10", "2026-10-11", "2026-10-20")).toBeNull();
    expect(dateIntersection(null, "2026-10-10", "2026-10-01", "2026-10-20")).toBeNull();
  });

  it("se cruzan si comparten campaña en las mismas fechas", () => {
    const a = base({ media: [meta()] });
    const b = base({ id: "b", title: "B", start: "2026-10-20", end: "2026-11-30", media: [meta({ campaign: " ctwa pospago ", account: "Otra" })] });
    const o = findOverlap(a, b)!;
    expect(o.from).toBe("2026-10-20");
    expect(o.shared.map((s) => s.reason)).toEqual(["campaign"]);
    expect(describeOverlap(o)).toBe("Comparten campaña (CTWA Pospago)");
  });

  it("la cuenta se compara junto con el medio", () => {
    const a = base({ media: [meta({ campaign: null })] });
    const b = base({ id: "b", media: [meta({ campaign: null, media_name: "Google Ads" })] });
    expect(findOverlap(a, b)).toBeNull();
  });

  it("ciudades de los grupos, sin tildes ni mayúsculas", () => {
    const a = base({ arm_cities: ["Medellín", "Cali"] });
    const b = base({ id: "b", media: [meta({ campaign: null, account: null, cities: ["medellin"] })] });
    const o = findOverlap(a, b)!;
    expect(describeOverlap(o)).toBe("Comparten ciudad (Medellín)");
  });

  it("sin fechas en común o cerrados no se cruzan", () => {
    const a = base({ media: [meta()] });
    expect(findOverlap(a, base({ id: "b", start: "2026-12-01", end: "2026-12-20", media: [meta()] }))).toBeNull();
    expect(findOverlap(a, base({ id: "b", status: "decided", media: [meta()] }))).toBeNull();
    expect(findOverlap(a, a)).toBeNull();
  });

  it("varios motivos y varios pilotos", () => {
    const a = base({ media: [meta({ destination: "WhatsApp Pospago" })], arm_cities: ["Bogotá"] });
    const b = base({ id: "b", media: [meta({ destination: "whatsapp pospago" })], arm_cities: ["Bogotá"] });
    const c = base({ id: "c", media: [meta({ account: "X", campaign: "Y" })] });
    const all = overlapsFor(a, [a, b, c]);
    expect(all).toHaveLength(1);
    expect(describeOverlap(all[0])).toBe("Comparten cuenta (Meta Ads · WOM CO), campaña (CTWA Pospago), ciudad (Bogotá) y destino (WhatsApp Pospago)");
  });
});
