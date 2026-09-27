import { describe, expect, it } from "vitest";
import { csvFileName, toCsv } from "./csv";

describe("toCsv", () => {
  it("usa punto y coma, coma decimal, BOM y escapa comillas y separadores", () => {
    const csv = toCsv(
      [
        { a: "Hola; mundo", b: 7.5, c: true },
        { a: 'Dice "sí"', b: null, c: false },
      ],
      [
        { header: "Texto", value: (r) => r.a },
        { header: "Número", value: (r) => r.b },
        { header: "Listo", value: (r) => r.c },
      ],
    );
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["Texto;Número;Listo", '"Hola; mundo";7,5;Sí', '"Dice ""sí""";;No']);
  });
});

describe("csvFileName", () => {
  it("quita tildes y símbolos", () => {
    expect(csvFileName("Backlog", "Pospago · Líneas", "2026-09-26")).toBe("backlog-pospago-lineas-2026-09-26.csv");
  });
});
