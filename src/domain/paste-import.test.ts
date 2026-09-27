import { describe, expect, it } from "vitest";
import { countByStatus, normalizeName, outlierChange, parsePastedRows, parseWeekCell, splitLine } from "./paste-import";

const metrics = [
  { id: "a", name: "Altas digitales" },
  { id: "b", name: "Tasa de conversión" },
  { id: "c", name: "Sesiones" },
  { id: "d", name: "Sesiones " },
];
const WEEK = "2026-09-21";

describe("normalizeName", () => {
  it("quita tildes, mayúsculas y espacios de más", () => {
    expect(normalizeName("  Tasa  de CONVERSIÓN ")).toBe("tasa de conversion");
  });
});

describe("parseWeekCell", () => {
  it("acepta ISO y dd/mm/aaaa y lleva al lunes", () => {
    expect(parseWeekCell("2026-09-23")).toBe("2026-09-21");
    expect(parseWeekCell("23/09/2026")).toBe("2026-09-21");
    expect(parseWeekCell("31/02/2026")).toBeNull();
    expect(parseWeekCell("1234")).toBeNull();
  });
});

describe("splitLine", () => {
  it("tab, punto y coma y coma (solo la primera)", () => {
    expect(splitLine("Altas\t1.234,5")).toEqual(["Altas", "1.234,5"]);
    expect(splitLine("Altas; 1234")).toEqual(["Altas", "1234"]);
    expect(splitLine("Altas,1234,5")).toEqual(["Altas", "1234,5"]);
    expect(splitLine("2026-09-21,Altas,1234")).toEqual(["2026-09-21", "Altas", "1234"]);
  });
});

describe("parsePastedRows", () => {
  it("cruza nombres sin tildes y lee números es-CO", () => {
    const rows = parsePastedRows("Métrica\tValor\naltas digitales\t1.234\ntasa de conversion\t2,5\n\n", metrics, WEEK);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ status: "matched", metricId: "a", value: 1234, line: 2 });
    expect(rows[1]).toMatchObject({ status: "matched", metricId: "b", value: 2.5 });
  });

  it("marca no encontradas, inválidas, repetidas y ambiguas", () => {
    const rows = parsePastedRows("Otra cosa\t10\nAltas digitales\tabc\nTasa de conversión\t3\nTasa de conversión\t4\nsesiones\t9", metrics, WEEK);
    expect(rows.map((r) => r.status)).toEqual(["not_found", "invalid", "matched", "duplicate", "ambiguous"]);
    expect(countByStatus(rows)).toMatchObject({ matched: 1, not_found: 1, invalid: 1, duplicate: 1, ambiguous: 1 });
  });

  it("usa la columna de semana y separa las de otra semana", () => {
    const rows = parsePastedRows("21/09/2026\tAltas digitales\t10\n2026-09-14\tTasa de conversión\t3", metrics, WEEK);
    expect(rows[0]).toMatchObject({ status: "matched", week: "2026-09-21" });
    expect(rows[1]).toMatchObject({ status: "other_week", week: "2026-09-14", value: 3 });
  });

  it("acepta punto y coma y CRLF", () => {
    const rows = parsePastedRows("Altas digitales;120\r\nTasa de conversión;1,5\r\n", metrics, WEEK);
    expect(rows.map((r) => r.value)).toEqual([120, 1.5]);
  });
});

describe("outlierChange", () => {
  it("avisa por encima de 50 % en cualquier dirección", () => {
    expect(outlierChange(240, 100)).toBeCloseTo(1.4);
    expect(outlierChange(40, 100)).toBeCloseTo(-0.6);
    expect(outlierChange(150, 100)).toBeNull();
    expect(outlierChange(100, null)).toBeNull();
    expect(outlierChange(100, 0)).toBeNull();
    expect(outlierChange(null, 100)).toBeNull();
  });
});
