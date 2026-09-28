import { describe, expect, it } from "vitest";
import {
  filterInsights,
  heat,
  INSIGHT_EXAMPLES,
  INSIGHT_SOURCES,
  insightActions,
  insightCounts,
  lineHints,
  parseTags,
  problemPrefillFromInsight,
  savedLine,
  similarInsights,
  type InsightRow,
} from "./insights";

const NOW = new Date("2026-09-28T12:00:00Z").getTime();

function row(over: Partial<InsightRow> = {}): InsightRow {
  return {
    id: "i1",
    title: "La gente pregunta el precio antes de saludar en WhatsApp",
    detail: null,
    source: "customer",
    source_ref: null,
    line_hint: "Pospago",
    stage: "conversion",
    channel: "WhatsApp",
    tags: [],
    status: "new",
    program_id: null,
    problem_id: null,
    pilot_id: null,
    created_by: "u1",
    author_name: "Ana",
    created_at: "2026-09-27T12:00:00Z",
    votes: 0,
    voted_by_me: false,
    ...over,
  };
}

describe("parseTags", () => {
  it("separa por coma o #, sin repetir y con tope", () => {
    expect(parseTags("#precio, WhatsApp,precio  , ")).toEqual(["precio", "whatsapp"]);
    expect(parseTags("a,b,c,d,e,f,g,h,i,j")).toHaveLength(8);
  });
});

describe("heat", () => {
  it("los votos y lo fresco calientan; lo archivado enfría", () => {
    const fresh = heat(row({ votes: 2 }), NOW);
    const old = heat(row({ votes: 2, created_at: "2026-05-01T00:00:00Z" }), NOW);
    expect(fresh).toBeGreaterThan(old);
    expect(heat(row({ status: "archived" }), NOW)).toBeLessThan(heat(row(), NOW));
  });
});

describe("filterInsights", () => {
  const list = [
    row({ id: "a", created_at: "2026-09-20T00:00:00Z", votes: 5 }),
    row({ id: "b", title: "Recargas de noche traen paquetes grandes", source: "data", line_hint: "Recargas", created_by: "me" }),
    row({ id: "c", status: "planted" }),
    row({ id: "d", status: "archived" }),
  ];
  it("vistas", () => {
    expect(filterInsights(list, { view: "todos" }, "me", NOW).map((i) => i.id)).toEqual(["b", "c", "a"]);
    expect(filterInsights(list, { view: "sin-sembrar" }, "me", NOW).map((i) => i.id)).toEqual(["b", "a"]);
    expect(filterInsights(list, { view: "sembrados" }, "me", NOW).map((i) => i.id)).toEqual(["c"]);
    expect(filterInsights(list, { view: "mios" }, "me", NOW).map((i) => i.id)).toEqual(["b"]);
    expect(filterInsights(list, { view: "archivados" }, "me", NOW).map((i) => i.id)).toEqual(["d"]);
    expect(filterInsights(list, { view: "calientes" }, "me", NOW)[0].id).toBe("a");
  });
  it("busca sin tildes y filtra por fuente y línea", () => {
    expect(filterInsights(list, { view: "todos", q: "PAQUETES" }, "me", NOW).map((i) => i.id)).toEqual(["b"]);
    expect(filterInsights(list, { view: "todos", source: "data" }, "me", NOW).map((i) => i.id)).toEqual(["b"]);
    expect(filterInsights(list, { view: "todos", line: "pospago" }, "me", NOW).map((i) => i.id)).toEqual(["c", "a"]);
  });
  it("líneas mencionadas, de la más usada", () => {
    expect(lineHints(list)).toEqual(["Pospago", "Recargas"]);
  });
  it("conteos de arriba", () => {
    expect(insightCounts(list, "me", NOW)).toEqual({ total: 3, fresh: 3, planted: 1, mine: 1 });
  });
});

describe("similarInsights", () => {
  it("encuentra el parecido y se ignora a sí mismo", () => {
    const a = row({ id: "a" });
    const b = row({ id: "b", title: "Los clientes preguntan el precio en WhatsApp antes de saludar" });
    const c = row({ id: "c", title: "Portabilidad se cae con la foto de la cédula" });
    const r = similarInsights(a, [a, b, c]);
    expect(r.map((m) => m.item.id)).toEqual(["b"]);
  });
});

describe("problemPrefillFromInsight", () => {
  it("lleva el título y la fuente a la evidencia", () => {
    const p = problemPrefillFromInsight(row({ detail: "Visto en 40 chats.", source_ref: "Muestra de chats de agosto" }));
    expect(p.titulo).toMatch(/precio/);
    expect(p.evidencia).toMatch(/Visto en 40 chats/);
    expect(p.evidencia).toMatch(/un cliente \(Muestra de chats de agosto\)/);
  });
});

describe("insightActions", () => {
  it("el autor valida y archiva; el admin arma programa; con rol en pilotos, piloto", () => {
    const me = { id: "u1", isAdmin: false, canPilot: false };
    expect(insightActions(row(), me)).toMatchObject({ validate: true, archive: true, toProgram: false, toPilot: false, toProblem: true });
    expect(insightActions(row({ created_by: "otro" }), me)).toMatchObject({ validate: false, edit: false });
    expect(insightActions(row(), { id: "x", isAdmin: true, canPilot: true })).toMatchObject({ toProgram: true, toPilot: true, edit: true });
    expect(insightActions(row({ status: "archived" }), me)).toMatchObject({ toProblem: false, reopen: true });
  });
});

describe("textos", () => {
  it("fuentes, ejemplos y frases de guardado", () => {
    expect(new Set(INSIGHT_SOURCES.map((s) => s.key)).size).toBe(6);
    expect(INSIGHT_EXAMPLES.length).toBeGreaterThanOrEqual(3);
    expect(savedLine("x")).toBe(savedLine("x"));
  });
});
