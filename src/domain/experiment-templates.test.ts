import { describe, expect, it } from "vitest";
import {
  applyTemplate,
  decisionRuleTemplate,
  EXPERIMENT_TEMPLATES,
  findTemplate,
  variantsAreDefault,
  type TemplateTarget,
} from "./experiment-templates";

function empty(overrides: Partial<TemplateTarget> = {}): TemplateTarget {
  return {
    title: "",
    hypothesis_if: "",
    hypothesis_then: "",
    hypothesis_because: "",
    test_type: null,
    min_duration_days: null,
    decision_rule: "",
    variants: [
      { name: "Control", is_control: true, description: "" },
      { name: "Variante A", is_control: false, description: "" },
    ],
    ...overrides,
  };
}

describe("catálogo de plantillas", () => {
  it("tiene seis palancas con claves únicas y control primero", () => {
    expect(EXPERIMENT_TEMPLATES).toHaveLength(6);
    expect(new Set(EXPERIMENT_TEMPLATES.map((t) => t.key)).size).toBe(6);
    for (const t of EXPERIMENT_TEMPLATES) {
      expect(t.variants.length).toBeGreaterThanOrEqual(2);
      expect(t.min_duration_days).toBeGreaterThan(0);
    }
  });
});

describe("decisionRuleTemplate", () => {
  it("usa la dirección de la métrica", () => {
    expect(decisionRuleTemplate("Altas digitales", "up", 10)).toBe(
      "Gana si Altas digitales sube al menos 10 % frente al control, sin empeorar las métricas de control.",
    );
    expect(decisionRuleTemplate("Costo por conversación", "down", 7.5)).toMatch(/baja al menos 7,5 %/);
    expect(decisionRuleTemplate(null)).toMatch(/^Gana si la métrica principal sube al menos 10 %/);
  });
});

describe("applyTemplate", () => {
  const creative = findTemplate("creative")!;

  it("llena todo cuando está vacío, con el nombre de la métrica", () => {
    const r = applyTemplate(empty(), creative, { metricName: "Altas", direction: "up" });
    expect(r.values.title).toBe("Creatividad nueva en pauta para Altas");
    expect(r.values.hypothesis_then).toBe("mejora Altas");
    expect(r.values.test_type).toBe("ab");
    expect(r.values.min_duration_days).toBe(14);
    expect(r.values.decision_rule).toMatch(/Gana si Altas sube/);
    expect(r.values.variants.map((v) => v.name)).toEqual(["Creativos actuales", "Creativos nuevos"]);
    expect(r.values.variants[0].is_control).toBe(true);
    expect(r.filled).toHaveLength(8);
  });

  it("no pisa lo que ya está escrito", () => {
    const r = applyTemplate(
      empty({ title: "Mi título", hypothesis_if: "hacemos X", test_type: "before_after", min_duration_days: 7, decision_rule: "Mi regla" }),
      creative,
    );
    expect(r.values.title).toBe("Mi título");
    expect(r.values.hypothesis_if).toBe("hacemos X");
    expect(r.values.test_type).toBe("before_after");
    expect(r.values.min_duration_days).toBe(7);
    expect(r.values.decision_rule).toBe("Mi regla");
    expect(r.filled).toEqual(["hypothesis_then", "hypothesis_because", "variants"]);
  });

  it("respeta las variantes personalizadas y conserva los ids", () => {
    const custom = empty({ variants: [{ id: "v1", name: "Hoy", is_control: true, description: "" }] });
    expect(variantsAreDefault(custom.variants)).toBe(false);
    expect(applyTemplate(custom, creative).values.variants).toEqual(custom.variants);

    const withIds = empty({
      variants: [
        { id: "a", name: "Control", is_control: true, description: "" },
        { id: "b", name: "Variante A", is_control: false, description: "" },
        { id: "c", name: "Variante B", is_control: false, description: "" },
      ],
    });
    const r = applyTemplate(withIds, creative);
    expect(r.values.variants.map((v) => [v.id, v.name])).toEqual([
      ["a", "Creativos actuales"],
      ["b", "Creativos nuevos"],
      ["c", "Variante B"],
    ]);
  });
});
