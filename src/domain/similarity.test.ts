import { describe, expect, it } from "vitest";
import {
  findSimilar,
  hasEnoughText,
  jaccard,
  normalizeText,
  similarExperimentMessage,
  snippet,
  stem,
  tokenize,
} from "./similarity";

describe("normalización", () => {
  it("quita tildes, mayúsculas y signos", () => {
    expect(normalizeText("¡Recordatorio de RECARGA por WhatsApp, ya!")).toBe("recordatorio de recarga por whatsapp ya");
    expect(normalizeText("Cuotas más baratas")).toBe("cuotas mas baratas");
  });

  it("junta plurales y variantes de la palabra", () => {
    expect(stem("recargas")).toBe(stem("recarga"));
    expect(stem("recordatorios")).toBe(stem("recordatorio"));
    expect(stem("mensajes")).toBe(stem("mensaje"));
  });

  it("ignora palabras vacías y cortas", () => {
    expect([...tokenize("Si enviamos un recordatorio por WhatsApp")]).toEqual(["enviam", "record", "whatsa"]);
  });
});

describe("jaccard", () => {
  it("mide la parte en común", () => {
    expect(jaccard(new Set(["a", "b"]), new Set(["a", "b"]))).toBe(1);
    expect(jaccard(new Set(["a", "b"]), new Set(["b", "c"]))).toBeCloseTo(1 / 3);
    expect(jaccard(new Set(), new Set(["a"]))).toBe(0);
  });
});

describe("findSimilar", () => {
  const pool = [
    { id: "1", text: "Recordatorio de recarga con paquete sugerido por WhatsApp a los 25 días" },
    { id: "2", text: "Precio en cuotas mensuales en la ficha del equipo" },
    { id: "3", text: "Rotación de creativos en video vertical testimonial" },
  ];

  it("necesita texto suficiente", () => {
    expect(hasEnoughText("recarga")).toBe(false);
    expect(findSimilar("recarga", pool, (x) => x.text)).toEqual([]);
  });

  it("encuentra lo parecido, sin importar tildes ni plurales", () => {
    const r = findSimilar("Recordatorios de RECARGAS por WhatsApp con paquetes", pool, (x) => x.text);
    expect(r.map((m) => m.item.id)).toEqual(["1"]);
    expect(r[0].shared.length).toBeGreaterThanOrEqual(2);
  });

  it("no muestra parecidos de relleno", () => {
    expect(findSimilar("Nueva landing de portabilidad para prepago con formulario corto", pool, (x) => x.text)).toEqual([]);
  });

  it("respeta el límite y ordena por parecido", () => {
    const many = Array.from({ length: 5 }, (_, i) => ({ id: String(i), text: `cuotas mensuales ficha equipo ${"x".repeat(i + 3)}` }));
    const r = findSimilar("cuotas mensuales en la ficha del equipo", many, (x) => x.text);
    expect(r).toHaveLength(3);
    expect(r[0].score).toBeGreaterThanOrEqual(r[1].score);
  });
});

describe("mensajes", () => {
  it("cuenta cómo le fue al ejercicio parecido", () => {
    expect(
      similarExperimentMessage({ lineName: "Recargas", date: "2026-09-15T15:00:00Z", status: "decided", verdict: "loser" }),
    ).toBe("Recargas ya probó algo parecido en septiembre de 2026 (perdió). ¿Qué es diferente esta vez?");
    expect(similarExperimentMessage({ lineName: "Pospago", date: null, status: "in_test", verdict: null })).toBe(
      "Pospago ya tiene algo parecido (va en En prueba). ¿Qué es diferente esta vez?",
    );
  });

  it("recorta fragmentos largos", () => {
    expect(snippet("a".repeat(200), 10)).toBe(`${"a".repeat(9)}…`);
    expect(snippet("  corto  ")).toBe("corto");
  });
});
