import { describe, expect, it } from "vitest";
import {
  DEFAULT_STAGES,
  GENERIC_TEMPLATE,
  horizonProblems,
  proposeHorizons,
  suggestFreeze,
  TELCO_TEMPLATES,
  templateForLine,
} from "./growth-templates";

describe("proposeHorizons", () => {
  it("parte el programa en el punto de decisión", () => {
    expect(proposeHorizons("2026-08-01", "2027-04-30", "2027-01-18")).toEqual([
      { name: "H1", start_date: "2026-08-01", end_date: "2027-01-18" },
      { name: "H2", start_date: "2027-01-19", end_date: "2027-04-30" },
    ]);
  });
  it("sin punto de decisión (o fuera de rango) propone un solo horizonte", () => {
    expect(proposeHorizons("2026-08-01", "2027-04-30", null)).toHaveLength(1);
    expect(proposeHorizons("2026-08-01", "2027-04-30", "2027-06-01")).toHaveLength(1);
  });
});

describe("horizonProblems", () => {
  const program = { start: "2026-08-01", end: "2027-04-30" };
  it("acepta horizontes válidos", () => {
    expect(horizonProblems(program, proposeHorizons(program.start, program.end, "2027-01-18"))).toEqual([]);
  });
  it("detecta cruces y salidas del programa", () => {
    const p = horizonProblems(program, [
      { name: "H1", start_date: "2026-07-01", end_date: "2027-01-20" },
      { name: "H2", start_date: "2027-01-18", end_date: "2027-04-30" },
    ]);
    expect(p.some((x) => x.includes("se sale"))).toBe(true);
    expect(p.some((x) => x.includes("se cruzan"))).toBe(true);
  });
});

describe("suggestFreeze", () => {
  it("propone días antes y después del pico", () => {
    expect(suggestFreeze({ start_date: "2026-11-27", end_date: "2026-11-30" })).toEqual({
      start_date: "2026-11-23",
      end_date: "2026-12-06",
    });
    expect(suggestFreeze({ start_date: "2026-12-14", end_date: "2026-12-31" }, 0, 3)).toEqual({
      start_date: "2026-12-14",
      end_date: "2027-01-03",
    });
  });
});

describe("plantillas", () => {
  it("encuentra la plantilla por nombre, sin importar acentos ni mayúsculas", () => {
    expect(templateForLine("pospago").key).toBe("pospago");
    expect(templateForLine("Equipos Moviles").key).toBe("equipos");
    expect(templateForLine("Otra línea")).toBe(GENERIC_TEMPLATE);
  });
  it("cada plantilla describe las cuatro etapas y sugiere al menos una métrica por rama", () => {
    for (const t of [...TELCO_TEMPLATES, GENERIC_TEMPLATE]) {
      for (const s of DEFAULT_STAGES) expect(t.funnel[s].description.length).toBeGreaterThan(5);
      for (const branch of Object.values(t.tree)) expect(branch.length).toBeGreaterThan(0);
    }
  });
  it("las métricas sugeridas del embudo existen en el árbol de la plantilla", () => {
    for (const t of TELCO_TEMPLATES) {
      const names = Object.values(t.tree).flat().map((x) => x.name);
      for (const s of DEFAULT_STAGES) {
        const metric = t.funnel[s].metric;
        if (metric) expect(names).toContain(metric);
      }
    }
  });
});
