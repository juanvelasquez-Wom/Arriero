import { describe, expect, it } from "vitest";
import { experimentAsLibraryItem, filterLearnings, learningDate, matchesQuery, parseLibraryFilters, type LibraryItem } from "./library";

const item = (over: Partial<LibraryItem>): LibraryItem => ({
  pilot_title: "Audiencia amplia en CTWA",
  text: "La audiencia amplia bajó el costo por conversación sin dañar la tasa de venta.",
  created_at: "2026-09-20T15:00:00Z",
  verdict: "winner",
  test_type: "ab_platform",
  variable_name: "Audiencia amplia vs. intereses",
  variable_category: "audience",
  media_names: ["Meta Ads"],
  decided_at: "2026-09-18T12:00:00Z",
  ...over,
});

describe("biblioteca de aprendizajes", () => {
  it("lee los filtros de la URL", () => {
    expect(parseLibraryFilters({ q: " costo ", resultado: "winner", tipo: "x", desde: "2026-09-01" })).toEqual({
      q: "costo",
      variable: null,
      canal: null,
      tipo: null,
      resultado: "winner",
      desde: "2026-09-01",
      hasta: null,
    });
  });

  it("busca sin tildes, sin mayúsculas y por todas las palabras", () => {
    const l = item({});
    expect(matchesQuery(l, "CONVERSACION")).toBe(true);
    expect(matchesQuery(l, "costo  conversación")).toBe(true);
    expect(matchesQuery(l, "costo tiktok")).toBe(false);
    expect(matchesQuery(l, "meta")).toBe(true); // también busca en el canal
    expect(matchesQuery(l, null)).toBe(true);
  });

  it("filtra por variable, canal, tipo, resultado y fecha de la decisión", () => {
    const items = [
      item({ pilot_title: "a" }),
      item({ pilot_title: "b", verdict: "loser", media_names: ["TikTok"], variable_category: "creative", test_type: "ab_creative" }),
      item({ pilot_title: "c", decided_at: null, created_at: "2026-10-05T00:00:00Z", test_type: "geo" }),
    ];
    const none = parseLibraryFilters({});
    const titles = (f: Partial<typeof none>) => filterLearnings(items, { ...none, ...f }).map((l) => l.pilot_title);
    expect(titles({})).toEqual(["a", "b", "c"]);
    expect(titles({ variable: "creative" })).toEqual(["b"]);
    expect(titles({ canal: "tiktok" })).toEqual(["b"]);
    expect(titles({ tipo: "geo" })).toEqual(["c"]);
    expect(titles({ resultado: "loser" })).toEqual(["b"]);
    expect(titles({ desde: "2026-10-01" })).toEqual(["c"]);
    expect(titles({ hasta: "2026-09-18" })).toEqual(["a", "b"]);
  });

  it("la fecha es la de la decisión o la de creación", () => {
    expect(learningDate(item({}))).toBe("2026-09-18");
    expect(learningDate(item({ decided_at: null }))).toBe("2026-09-20");
  });
});

describe("biblioteca unificada", () => {
  it("convierte un aprendizaje de ejercicio y lo filtra con las mismas reglas", () => {
    const e = experimentAsLibraryItem({
      id: "l1",
      text: "El botón de WhatsApp subió la conversión.",
      created_at: "2026-09-10T10:00:00Z",
      item_id: "e1",
      item_title: "Botón CTWA en la landing",
      program_id: "p1",
      program_name: "Programa 2026",
      line_name: "Pospago",
      verdict: "winner",
      decision: "scale",
      lever: "destination",
      channel: "Meta Ads, Google",
      decided_at: null,
    });
    expect(e).toMatchObject({ source: "experiment", pilot_title: "Botón CTWA en la landing", variable_category: "destination", media_names: ["Meta Ads", "Google"], test_type: null });
    const f = parseLibraryFilters({ canal: "google", variable: "destination" });
    expect(filterLearnings([e, item({})], f)).toEqual([e]);
    expect(experimentAsLibraryItem({ ...e, item_title: "x", verdict: "raro", decision: null, lever: null, channel: null, program_id: null }).verdict).toBeNull();
  });
});
