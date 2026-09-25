import { describe, expect, it } from "vitest";
import {
  buildMetricTree,
  changeVsBaseline,
  countByBranch,
  createsCycle,
  descendantIds,
  diffWeeklyLoad,
  flattenTree,
  funnelStats,
  funnelWidths,
  moveWithinSiblings,
  nextSortOrder,
  parentCandidates,
  parseDecimal,
  pendingMetricIds,
  sortSiblings,
  toInputValue,
  type TreeMetric,
} from "./metric-tree";

const m = (id: string, parent_id: string | null, extra: Partial<TreeMetric> = {}): TreeMetric => ({
  id,
  parent_id,
  type: parent_id ? "input" : "north_star",
  branch: parent_id ? "conversion" : null,
  sort_order: 0,
  ...extra,
});

// ns
// ├─ a (1)
// │  └─ a1
// └─ b (0)
// eff (raíz de eficiencia)
const metrics: TreeMetric[] = [
  m("a", "ns", { sort_order: 1, branch: "demand_volume" }),
  m("eff", null, { type: "efficiency" }),
  m("ns", null),
  m("a1", "a"),
  m("b", "ns", { sort_order: 0 }),
];

describe("árbol de métricas", () => {
  it("pone la métrica norte primero y ordena hijos por sort_order", () => {
    const tree = buildMetricTree(metrics);
    expect(tree.map((n) => n.id)).toEqual(["ns", "eff"]);
    expect(tree[0].children.map((n) => n.id)).toEqual(["b", "a"]);
    expect(tree[0].children[1].children[0]).toMatchObject({ id: "a1", depth: 2 });
    expect(flattenTree(tree).map((n) => n.id)).toEqual(["ns", "b", "a", "a1", "eff"]);
  });

  it("trata como raíz una métrica cuyo padre no está (borrado)", () => {
    const tree = buildMetricTree([m("ns", null), m("x", "gone")]);
    expect(tree.map((n) => n.id)).toEqual(["ns", "x"]);
  });

  it("no se cuelga con ciclos", () => {
    const tree = buildMetricTree([m("ns", null), m("p", "q"), m("q", "p")]);
    expect(flattenTree(tree).map((n) => n.id)).toEqual(["ns"]);
  });

  it("calcula descendientes y candidatos a padre sin ciclos", () => {
    expect([...descendantIds(metrics, "ns")].sort()).toEqual(["a", "a1", "b"]);
    expect([...descendantIds(metrics, "a1")]).toEqual([]);
    expect(parentCandidates(metrics, "a").map((x) => x.id).sort()).toEqual(["b", "eff", "ns"]);
    expect(parentCandidates(metrics, null)).toHaveLength(metrics.length);
    expect(createsCycle(metrics, "a", "a1")).toBe(true);
    expect(createsCycle(metrics, "a", "a")).toBe(true);
    expect(createsCycle(metrics, "a", "b")).toBe(false);
    expect(createsCycle(metrics, "a", null)).toBe(false);
  });

  it("cuenta entradas por rama", () => {
    expect(countByBranch(metrics)).toEqual({ demand_volume: 1, conversion: 2, efficiency: 0, recovery_recurrence: 0 });
  });
});

describe("orden entre hermanos", () => {
  const sib = [
    { id: "x", sort_order: 0 },
    { id: "y", sort_order: 1 },
    { id: "z", sort_order: 2 },
  ];

  it("intercambia con el vecino y devuelve solo lo que cambia", () => {
    expect(moveWithinSiblings(sib, "y", "up")).toEqual([
      { id: "y", sort_order: 0 },
      { id: "x", sort_order: 1 },
    ]);
    expect(moveWithinSiblings(sib, "y", "down")).toEqual([
      { id: "z", sort_order: 1 },
      { id: "y", sort_order: 2 },
    ]);
  });

  it("no mueve fuera de los extremos ni ids ajenos", () => {
    expect(moveWithinSiblings(sib, "x", "up")).toBeNull();
    expect(moveWithinSiblings(sib, "z", "down")).toBeNull();
    expect(moveWithinSiblings(sib, "nope", "up")).toBeNull();
  });

  it("normaliza órdenes repetidos", () => {
    const dup = [
      { id: "x", sort_order: 0 },
      { id: "y", sort_order: 0 },
      { id: "z", sort_order: 0 },
    ];
    expect(moveWithinSiblings(dup, "z", "up")).toEqual([
      { id: "z", sort_order: 1 },
      { id: "y", sort_order: 2 },
    ]);
  });

  it("ordena de forma estable y calcula el siguiente orden", () => {
    expect(sortSiblings([{ id: "b", sort_order: 1 }, { id: "a", sort_order: 0 }, { id: "c", sort_order: 1 }]).map((s) => s.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(nextSortOrder([])).toBe(0);
    expect(nextSortOrder(sib)).toBe(3);
  });
});

describe("embudo", () => {
  const stages = [{ id: "s1" }, { id: "s2" }, { id: "s3" }];
  const problems = [
    { id: "p1", stage_id: "s1", status: "validated" as const },
    { id: "p2", stage_id: "s2", status: "validated" as const },
    { id: "p3", stage_id: "s2", status: "discarded" as const },
    { id: "p4", stage_id: "s1", status: "to_validate" as const },
  ];
  const experiments = [
    { problem_id: "p1", status: "in_test" as const },
    { problem_id: "p1", status: "discarded" as const },
    { problem_id: "p4", stage_id: "s1", status: "idea" as const },
  ];

  it("cuenta problemas y ejercicios por etapa y marca lo que exige atención", () => {
    const stats = funnelStats(stages, problems, experiments);
    expect(stats[0]).toMatchObject({ problems: 2, validatedProblems: 1, experiments: 2, empty: false, needsAttention: false });
    expect(stats[1]).toMatchObject({ problems: 1, validatedProblems: 1, experiments: 0, empty: false, needsAttention: true });
    expect(stats[2]).toMatchObject({ problems: 0, experiments: 0, empty: true, needsAttention: false });
  });

  it("anchos decrecientes", () => {
    expect(funnelWidths(0)).toEqual([]);
    expect(funnelWidths(1)).toEqual([1]);
    const w = funnelWidths(4, 0.4);
    expect(w[0]).toBe(1);
    expect(w[3]).toBeCloseTo(0.4);
    expect(w[1]).toBeGreaterThan(w[2]);
  });
});

describe("carga semanal", () => {
  it("lee números escritos a mano", () => {
    expect(parseDecimal("")).toBeNull();
    expect(parseDecimal("  ")).toBeNull();
    expect(parseDecimal(null)).toBeNull();
    expect(parseDecimal("1234,5")).toBe(1234.5);
    expect(parseDecimal("1234.5")).toBe(1234.5);
    expect(parseDecimal("1.234,5")).toBe(1234.5);
    expect(parseDecimal("1,234.5")).toBe(1234.5);
    expect(parseDecimal("1.234.567")).toBe(1234567);
    expect(parseDecimal("-3,2")).toBe(-3.2);
    expect(parseDecimal("12 %")).toBe(12);
    expect(parseDecimal("$ 25.000,50")).toBe(25000.5);
    expect(parseDecimal(7)).toBe(7);
    expect(parseDecimal("abc")).toBeNaN();
    expect(parseDecimal("1,2,3a")).toBeNaN();
    expect(toInputValue(1234.5)).toBe("1234,5");
    expect(toInputValue(null)).toBe("");
  });

  it("envía solo lo que cambió y explica los errores", () => {
    const saved = new Map([
      ["a", { value: 10, note: null }],
      ["b", { value: 5, note: "ok" }],
      ["e", { value: 1, note: null }],
    ]);
    const draft = new Map([
      ["a", { value: "10", note: "" }], // sin cambios
      ["b", { value: "5", note: "nueva nota" }], // cambia la nota
      ["c", { value: "3,5", note: "" }], // nuevo
      ["d", { value: "", note: "" }], // vacío y sin guardar: se ignora
      ["e", { value: "", note: "" }], // vaciar un guardado: error
      ["f", { value: "x", note: "" }], // inválido
      ["g", { value: "", note: "solo nota" }], // nota sin valor
    ]);
    const { rows, errors } = diffWeeklyLoad(["a", "b", "c", "d", "e", "f", "g"], saved, draft);
    expect(rows).toEqual([
      { metric_id: "b", value: 5, note: "nueva nota" },
      { metric_id: "c", value: 3.5, note: null },
    ]);
    expect([...errors.keys()]).toEqual(["e", "f", "g"]);
  });

  it("lista las métricas pendientes", () => {
    expect(pendingMetricIds(["a", "b", "c"], new Map([["b", 1]]))).toEqual(["a", "c"]);
  });
});

describe("avance frente a la línea base", () => {
  it("calcula el cambio y si es favorable según la dirección", () => {
    expect(changeVsBaseline(110, 100, "up")).toEqual({ ratio: 0.1, favorable: true });
    expect(changeVsBaseline(110, 100, "down")).toEqual({ ratio: 0.1, favorable: false });
    expect(changeVsBaseline(90, 100, "down")).toEqual({ ratio: -0.1, favorable: true });
    expect(changeVsBaseline(100, 100, "up")).toEqual({ ratio: 0, favorable: null });
    expect(changeVsBaseline(5, 0, "up")).toEqual({ ratio: null, favorable: true });
    expect(changeVsBaseline(null, 100, "up")).toEqual({ ratio: null, favorable: null });
  });
});
