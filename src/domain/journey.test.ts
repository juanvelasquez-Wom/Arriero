import { describe, expect, it } from "vitest";
import { journeyStages } from "./journey";

describe("journeyStages", () => {
  it("cuenta cada etapa del camino según el estado de los ejercicios", () => {
    const stages = journeyStages({
      metrics: 12,
      problems: 4,
      experiments: [
        { status: "idea" },
        { status: "prioritized" },
        { status: "in_design" },
        { status: "in_test" },
        { status: "in_reading" },
        { status: "decided" },
        { status: "scaled" },
        { status: "discarded" },
      ],
    });
    expect(stages.map((s) => [s.key, s.count])).toEqual([
      ["ver", 12],
      ["entender", 4],
      ["decidir", 2],
      ["experimentar", 1],
      ["ejecutar", 2],
      ["aprender", 1],
      ["crecer", 1],
    ]);
  });
  it("solo resalta Ejecutar cuando hay algo en prueba", () => {
    expect(journeyStages({ metrics: 0, problems: 0, experiments: [] }).some((s) => s.attention)).toBe(false);
    const s = journeyStages({ metrics: 0, problems: 0, experiments: [{ status: "in_test" }] });
    expect(s.filter((x) => x.attention).map((x) => x.key)).toEqual(["ejecutar"]);
  });
});
