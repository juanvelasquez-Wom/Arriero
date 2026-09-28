import { describe, expect, it } from "vitest";
import {
  groupResults,
  isSearchable,
  likePattern,
  normalizeText,
  rankResults,
  resolveShortcut,
  scoreMatch,
  snippetAround,
  tokenize,
  type SearchCandidate,
} from "./search";

const c = (over: Partial<SearchCandidate>): SearchCandidate => ({
  kind: "experiment",
  id: over.id ?? Math.random().toString(36).slice(2),
  programId: "p1",
  programName: "Programa uno",
  title: "Sin título",
  href: "/x",
  ...over,
});

describe("normalizeText / tokenize", () => {
  it("quita tildes, eñes y mayúsculas", () => {
    expect(normalizeText("  Campaña  ÉXITO pingüino ")).toBe("campana exito pinguino");
  });
  it("separa en palabras alfanuméricas", () => {
    expect(tokenize("¿Portabilidad, pos-pago?")).toEqual(["portabilidad", "pos", "pago"]);
  });
  it("exige al menos dos caracteres", () => {
    expect(isSearchable("a")).toBe(false);
    expect(isSearchable(" ¿? ")).toBe(false);
    expect(isSearchable("ab")).toBe(true);
  });
});

describe("likePattern", () => {
  it("usa la palabra más larga con comodines en letras acentuables", () => {
    expect(likePattern("la campaña")).toBe("%c_mp___%");
  });
  it("no deja caracteres peligrosos para PostgREST", () => {
    const p = likePattern("a,b) or(x.eq.1")!;
    expect(p).toMatch(/^[a-z0-9_%]+$/);
  });
  it("devuelve null si la consulta es muy corta", () => {
    expect(likePattern("x")).toBeNull();
  });
});

describe("scoreMatch", () => {
  it("es insensible a tildes y mayúsculas", () => {
    expect(scoreMatch("CAMPANA", [{ text: "Campaña de portabilidad", weight: 1 }])).toBeGreaterThan(0);
  });
  it("exige todas las palabras", () => {
    expect(scoreMatch("portabilidad recargas", [{ text: "Portabilidad pospago", weight: 1 }])).toBe(0);
  });
  it("las palabras pueden estar en campos distintos", () => {
    expect(
      scoreMatch("portabilidad chat", [
        { text: "Portabilidad", weight: 1 },
        { text: "Abandono en el chat", weight: 0.5 },
      ]),
    ).toBeGreaterThan(0);
  });
  it("exacto > prefijo > inicio de palabra > en medio", () => {
    const s = (t: string) => scoreMatch("pago", [{ text: t, weight: 1 }]);
    expect(s("pago")).toBeGreaterThan(s("pagos web"));
    expect(s("pagos web")).toBeGreaterThan(s("error de pagos"));
    expect(s("error de pagos")).toBeGreaterThan(s("pospago"));
    expect(s("pospago")).toBeGreaterThan(0);
  });
});

describe("rankResults", () => {
  it("ordena por puntaje, filtra lo que no coincide y sube el programa actual", () => {
    const hits = rankResults(
      [
        c({ id: "a", title: "Checkout más corto", programId: "p2" }),
        c({ id: "b", title: "Checkout más corto", programId: "p1" }),
        c({ id: "c", title: "Otra cosa" }),
        c({ id: "d", title: "Mensaje", detail: "Reducir pasos del checkout" }),
      ],
      "checkout",
      { currentProgramId: "p1" },
    );
    expect(hits.map((h) => h.id)).toEqual(["b", "a", "d"]);
    expect(hits[2].snippet).toContain("checkout");
    expect(hits[0].snippet).toBeNull();
  });
  it("limita por tipo", () => {
    const many = Array.from({ length: 10 }, (_, i) => c({ id: String(i), title: `Prueba ${i}` }));
    expect(rankResults(many, "prueba", { limitPerKind: 3 })).toHaveLength(3);
  });
});

describe("groupResults", () => {
  it("agrupa en orden fijo y omite grupos vacíos", () => {
    const hits = rankResults(
      [c({ kind: "metric", title: "Tasa de pago" }), c({ kind: "problem", title: "Pago rechazado" })],
      "pago",
    );
    expect(groupResults(hits).map((g) => g.label)).toEqual(["Oportunidades de mejora", "Métricas"]);
  });
});

describe("snippetAround", () => {
  it("recorta alrededor de la coincidencia sin perder las tildes", () => {
    const text = `${"x ".repeat(60)}la campaña funcionó ${"y ".repeat(60)}`;
    const s = snippetAround(text, "campana", 10)!;
    expect(s).toContain("campaña");
    expect(s.startsWith("…")).toBe(true);
    expect(s.endsWith("…")).toBe(true);
  });
  it("null si no hay texto o coincidencia", () => {
    expect(snippetAround(null, "x")).toBeNull();
    expect(snippetAround("hola", "chao")).toBeNull();
  });
});

describe("resolveShortcut", () => {
  const idle = { pendingG: false };
  const inProgram = { inProgram: true, typing: false };
  it("Ctrl+K y ⌘+K abren la búsqueda incluso escribiendo", () => {
    expect(resolveShortcut(idle, { key: "k", ctrlKey: true }, { inProgram: false, typing: true }).action).toBe("open-search");
    expect(resolveShortcut(idle, { key: "K", metaKey: true }, inProgram).action).toBe("open-search");
  });
  it("? abre la ayuda; ignorado mientras se escribe", () => {
    expect(resolveShortcut(idle, { key: "?" }, inProgram).action).toBe("open-help");
    expect(resolveShortcut(idle, { key: "?" }, { inProgram: true, typing: true }).action).toBeNull();
  });
  it("G luego B / K navega dentro de un programa", () => {
    const g = resolveShortcut(idle, { key: "g" }, inProgram);
    expect(g).toEqual({ action: null, state: { pendingG: true } });
    expect(resolveShortcut(g.state, { key: "b" }, inProgram).action).toBe("go-backlog");
    expect(resolveShortcut(g.state, { key: "k" }, inProgram).action).toBe("go-kanban");
    expect(resolveShortcut(g.state, { key: "x" }, inProgram)).toEqual({ action: null, state: { pendingG: false } });
  });
  it("N y G no aplican fuera de un programa", () => {
    const out = { inProgram: false, typing: false };
    expect(resolveShortcut(idle, { key: "n" }, out).action).toBeNull();
    expect(resolveShortcut(idle, { key: "g" }, out).state.pendingG).toBe(false);
    expect(resolveShortcut(idle, { key: "n" }, inProgram).action).toBe("new-experiment");
  });
});
