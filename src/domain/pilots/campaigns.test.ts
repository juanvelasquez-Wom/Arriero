import { describe, expect, it } from "vitest";
import { aggregateCampaigns, campaignSummary, changeRatio, parseCampaignRange, previousRange, trendTone, type CampaignFact } from "./campaigns";

const f = (day: string, campaign_name: string, spend: number, conversations: number, impressions = 1000, clicks = 50): CampaignFact => ({
  day,
  campaign_name,
  spend,
  conversations,
  impressions,
  clicks,
});

describe("campañas", () => {
  it("rango por defecto: 14 días hasta ayer", () => {
    expect(parseCampaignRange({}, "2026-09-27")).toEqual({ from: "2026-09-13", to: "2026-09-26" });
    expect(parseCampaignRange({ desde: "2026-09-01", hasta: "2026-09-10" }, "2026-09-27")).toEqual({ from: "2026-09-01", to: "2026-09-10" });
    // Fechas al revés o inválidas vuelven al valor por defecto.
    expect(parseCampaignRange({ desde: "2026-09-20", hasta: "2026-09-10" }, "2026-09-27")).toEqual({ from: "2026-08-28", to: "2026-09-10" });
    expect(parseCampaignRange({ desde: "2026-02-30" }, "2026-09-27").from).toBe("2026-09-13");
  });

  it("periodo anterior del mismo largo", () => {
    expect(previousRange({ from: "2026-09-13", to: "2026-09-26" })).toEqual({ from: "2026-08-30", to: "2026-09-12" });
  });

  it("suma por campaña, compara y marca", () => {
    const range = { from: "2026-09-08", to: "2026-09-14" };
    const facts = [
      f("2026-09-08", "CTWA Pospago", 100, 10),
      f("2026-09-09", "ctwa pospago", 100, 10),
      f("2026-09-01", "CTWA Pospago", 100, 20),
      f("2026-09-10", "Prepago sin conv", 50, 0),
      f("2026-08-20", "Vieja", 30, 3),
    ];
    const rows = aggregateCampaigns(facts, range);
    expect(rows.map((r) => r.campaign)).toEqual(["CTWA Pospago", "Prepago sin conv"]);
    const pos = rows[0];
    expect(pos.current.spend).toBe(200);
    expect(pos.current.conversations).toBe(20);
    expect(pos.current.ctr).toBeCloseTo(0.05);
    expect(pos.current.cpc).toBeCloseTo(2);
    expect(pos.current.costPerConversation).toBe(10);
    expect(pos.previous.costPerConversation).toBe(5);
    expect(pos.change.costPerConversation).toBeCloseTo(1);
    expect(pos.flags).toEqual(["cost_per_conversation_up"]);
    expect(rows[1].flags).toEqual(["spend_no_conversations"]);
    expect(rows[1].current.costPerConversation).toBeNull();
    expect(rows[1].change.spend).toBeNull();
  });

  it("resumen y tono de tendencia", () => {
    const s = campaignSummary([f("2026-09-10", "A", 100, 5), f("2026-09-01", "A", 50, 5)], { from: "2026-09-08", to: "2026-09-14" });
    expect(s.current.spend).toBe(100);
    expect(s.previous.spend).toBe(50);
    expect(changeRatio(0, 0)).toBeNull();
    expect(trendTone(0.3, true)).toBe("bad");
    expect(trendTone(0.3, false)).toBe("good");
    expect(trendTone(0.001, false)).toBe("flat");
    expect(trendTone(null, false)).toBe("none");
  });

  it("vacío no rompe", () => {
    expect(aggregateCampaigns([], { from: "2026-09-08", to: "2026-09-14" })).toEqual([]);
    expect(campaignSummary([], { from: "2026-09-08", to: "2026-09-14" }).current.ctr).toBeNull();
  });
});
