import { describe, expect, it } from "vitest";
import { businessTemplate, gapText, looksLikePhone, readBusinessImport, reconcile, reconciliationTotals } from "./reconciliation";

describe("CSV de ventas del negocio", () => {
  it("la plantilla se lee sin errores", () => {
    const r = readBusinessImport(businessTemplate("2026-09-20"));
    expect(r.issues).toEqual([]);
    expect(r.rows).toEqual([
      { day: "2026-09-20", channel: "WhatsApp", campaign_name: "Nombre de la campaña en Meta", sales: 12, revenue_cop: 1500000, match_key: "" },
    ]);
  });

  it("valida fechas, números, repetidos y teléfonos", () => {
    const csv = [
      "Fecha;Canal;Campaña;Ventas;Ingresos;Clave;Otra",
      "2026-09-20;WhatsApp;A;3;;;x",
      "31/02/2026;WhatsApp;A;3;;;",
      "2026-09-21;;A;3;;;",
      "2026-09-21;WhatsApp;A;tres;;;",
      "2026-09-21;WhatsApp;A;-1;;;",
      "2026-09-21;WhatsApp;A;2;mucho;;",
      "2026-09-21;WhatsApp;A;2;;+57 300 123 4567;",
      "2026-09-21;WhatsApp;A;2;;9f86d081884c7d659a2feaa0c55ad015;",
      "2026-09-20;whatsapp;a;1;;;",
      "2026-10-30;WhatsApp;A;1;;;",
    ].join("\n");
    const r = readBusinessImport(csv, { maxDate: "2026-09-27" });
    expect(r.ignoredColumns).toEqual(["Otra"]);
    expect(r.rows.map((x) => x.day)).toEqual(["2026-09-20", "2026-09-21"]);
    expect(r.rows[1].match_key).toBe("9f86d081884c7d659a2feaa0c55ad015");
    expect(r.issues.map((i) => i.line)).toEqual([3, 4, 5, 6, 7, 8, 10, 11]);
    expect(r.issues.find((i) => i.line === 8)?.message).toMatch(/teléfono/);
  });

  it("encabezados que faltan", () => {
    const r = readBusinessImport("Fecha;Campaña\n2026-09-20;A");
    expect(r.issues.map((i) => i.message)).toEqual(["Falta la columna Canal.", "Falta la columna Ventas."]);
  });

  it("reconoce teléfonos en claro", () => {
    expect(looksLikePhone("3001234567")).toBe(true);
    expect(looksLikePhone("(604) 444-5555")).toBe(true);
    expect(looksLikePhone("123456")).toBe(false);
    expect(looksLikePhone("a1b2c3d4e5f6")).toBe(false);
    expect(looksLikePhone("")).toBe(false);
  });
});

describe("conciliación plataforma vs. negocio", () => {
  const platform = [
    { day: "2026-09-08", campaign_name: "CTWA Pospago", spend: 1000, conversations: 100 },
    { day: "2026-09-15", campaign_name: "CTWA Pospago", spend: 1000, conversations: 50 },
    { day: "2026-09-09", campaign_name: "Solo plataforma", spend: 300, conversations: 10 },
  ];
  const business = [
    { day: "2026-09-08", channel: "WhatsApp", campaign_name: "ctwa pospago", sales: 20, revenue_cop: 2000 },
    { day: "2026-09-16", channel: "WhatsApp", campaign_name: "CTWA Pospago", sales: 60, revenue_cop: null },
    { day: "2026-09-10", channel: "Tienda", campaign_name: "", sales: 5, revenue_cop: null },
    { day: "2026-10-10", channel: "Tienda", campaign_name: "", sales: 5, revenue_cop: null },
  ];

  it("todo el rango", () => {
    const rows = reconcile(platform, business, { from: "2026-09-01", to: "2026-09-30" });
    const pos = rows.find((r) => r.campaign === "CTWA Pospago")!;
    expect(pos.side).toBe("both");
    expect(pos.conversations).toBe(150);
    expect(pos.sales).toBe(80);
    expect(pos.revenue).toBe(2000);
    expect(pos.conversationToSale).toBeCloseTo(80 / 150);
    expect(pos.realCac).toBe(25);
    expect(pos.gap).toBe(70);
    expect(pos.doubleCountRisk).toBe(false);
    expect(gapText(pos)).toBe("La plataforma atribuye 150 conversaciones, el negocio registra 80 ventas.");
    expect(rows.find((r) => r.campaign === "Sin campaña")?.side).toBe("business_only");
    expect(rows.find((r) => r.campaign === "Solo plataforma")?.realCac).toBeNull();
    const t = reconciliationTotals(rows);
    expect(t).toMatchObject({ matched: 1, sales: 80, conversations: 150, platformOnly: 1, businessOnly: 1, doubleCountRisks: 0 });
  });

  it("por semana marca el doble conteo", () => {
    const rows = reconcile(platform, business, { from: "2026-09-01", to: "2026-09-30", period: "week" });
    const risky = rows.filter((r) => r.doubleCountRisk);
    expect(risky).toHaveLength(1);
    expect(risky[0]).toMatchObject({ campaign: "CTWA Pospago", period: "2026-09-14", conversations: 50, sales: 60 });
    expect(rows[0].doubleCountRisk).toBe(true);
    expect(gapText({ conversations: 1, sales: 1 })).toBe("La plataforma atribuye 1 conversación, el negocio registra 1 venta.");
  });
});
