import { describe, expect, it } from "vitest";
import {
  canonicalize,
  channelNames,
  isOn,
  learningHref,
  learningTokens,
  matchesTaxonomy,
  similarLearnings,
  taxonomyOptions,
  type SearchableLearning,
} from "./learning-search";

const L = (id: string, text: string, extra: Partial<SearchableLearning> = {}): SearchableLearning => ({ source: "experiment", id, text, ...extra });

describe("canonicalize", () => {
  it("unifica sinónimos telco, también en frases", () => {
    expect(canonicalize("Campaña CTWA para Postpago")).toBe("campana whatsapp para pospago");
    expect(canonicalize("Click to WhatsApp en portabilidad")).toBe("whatsapp en portabilidad");
    expect(canonicalize("La porta y los paquetes")).toBe("la portabilidad y los recarga");
    // No toca palabras que solo contienen la variante.
    expect(canonicalize("portada wafle")).toBe("portada wafle");
  });

  it("deja las palabras en raíz y sin palabras vacías", () => {
    expect([...learningTokens("Las recargas por WhatsApp")].sort()).toEqual(["recarg", "whatsa"]);
  });
});

describe("similarLearnings", () => {
  const items: SearchableLearning[] = [
    L("a", "En pospago, el botón de WhatsApp en la landing subió la conversión de portabilidad."),
    L("b", "El descuento en recargas no movió la frecuencia de compra.", { source: "pilot", channel: "Meta" }),
    L("c", "Cambiar el color del botón del checkout de equipos no hizo diferencia."),
  ];

  it("encuentra aprendizajes de ambas fuentes con sinónimos", () => {
    const r = similarLearnings("Probar CTWA para portas en postpago", items);
    expect(r.map((m) => m.item.id)).toEqual(["a"]);
    expect(r[0].shared.sort()).toEqual(["portab", "pospag", "whatsa"]);
    expect(similarLearnings("paquetes", items).map((m) => m.item.id)).toEqual(["b"]);
  });

  it("no devuelve nada sin palabras en común", () => {
    expect(similarLearnings("", items)).toEqual([]);
    expect(similarLearnings("televisión satelital hogar", items)).toEqual([]);
  });

  it("respeta el límite y ordena por parecido", () => {
    const many = [L("x", "whatsapp pospago"), L("y", "whatsapp pospago portabilidad landing conversión botón"), L("z", "whatsapp")];
    const r = similarLearnings("whatsapp pospago", many, { limit: 2 });
    expect(r.map((m) => m.item.id)).toEqual(["x", "z"]);
  });
});

describe("taxonomía", () => {
  const items = [
    { lever: "creative", channel: "Meta, Google" },
    { lever: "offer", channel: null },
    { lever: null, channel: "WhatsApp" },
  ];
  it("arma opciones y filtra por palanca y canal", () => {
    expect(channelNames(" Meta ,Google,, ")).toEqual(["Meta", "Google"]);
    expect(taxonomyOptions(items)).toEqual({ levers: ["creative", "offer"], channels: ["Google", "Meta", "WhatsApp"] });
    expect(items.filter((i) => matchesTaxonomy(i, { canal: "google" }))).toEqual([items[0]]);
    expect(items.filter((i) => matchesTaxonomy(i, { palanca: "offer" }))).toEqual([items[1]]);
    expect(items.filter((i) => matchesTaxonomy(i, {}))).toHaveLength(3);
  });
  it("lee interruptores de la URL", () => {
    expect(isOn("1")).toBe(true);
    expect(isOn(["si"])).toBe(true);
    expect(isOn("0")).toBe(false);
    expect(isOn(undefined)).toBe(false);
  });
});

describe("learningHref", () => {
  it("lleva al ejercicio o al piloto", () => {
    expect(learningHref({ source: "experiment", item_id: "e1", program_id: "p1" })).toBe("/programas/p1/ejercicios/e1");
    expect(learningHref({ source: "pilot", item_id: "pi1", program_id: "p1" })).toBe("/pilotos/pi1");
  });
});
