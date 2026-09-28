import { describe, expect, it } from "vitest";
import { formatDate, formatDateRange, formatMetricValue, formatNumber, formatPercent, formatScore, formatSignedPercent } from "./format";

// Intl puede usar espacios especiales (U+00A0 / U+202F): se normalizan para comparar.
const n = (s: string) => s.replace(/[  ]/g, " ");

describe("formato es-CO", () => {
  it("números con separador de miles y coma decimal", () => {
    expect(n(formatNumber(1234567.891))).toBe("1.234.567,89");
    expect(formatNumber(null)).toBe("—");
    expect(formatNumber(Number.NaN)).toBe("—");
    expect(formatScore(7.25)).toMatch(/^7,[23]$/);
  });

  it("porcentajes", () => {
    expect(n(formatPercent(0.278))).toBe("27,8 %");
    expect(n(formatSignedPercent(0.05))).toBe("+5,0 %");
    expect(n(formatSignedPercent(-0.125))).toBe("−12,5 %");
    expect(formatSignedPercent(null)).toBe("—");
  });

  it("valores de métrica por unidad", () => {
    expect(n(formatMetricValue(1500000, "COP"))).toBe("$ 1.500.000");
    expect(n(formatMetricValue(4.2, "%"))).toBe("4,2 %");
    expect(n(formatMetricValue(12, "altas"))).toBe("12 altas");
    expect(formatMetricValue(null, "COP")).toBe("—");
  });

  it("fechas sin corrimiento de zona horaria", () => {
    expect(n(formatDate("2026-10-01"))).toMatch(/^1 (de )?oct\.? (de )?2026$/);
    expect(formatDateRange(null, null)).toBe("Sin fechas");
    expect(n(formatDateRange("2026-10-01", null))).toMatch(/– \?$/);
  });
});
