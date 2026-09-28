import { describe, expect, it } from "vitest";
import {
  boardHealth,
  dropOptions,
  experimentColumn,
  filterBoardItems,
  isAging,
  ownerInitials,
  parseBoardFilters,
  pilotColumn,
  roadmapBucket,
  UNASSIGNED,
  wipState,
  type HealthInput,
} from "./boards";
import { TRANSITIONS } from "./lifecycle";
import { PILOT_STATUSES } from "./pilots/types";
import { EXPERIMENT_STATUSES } from "./types";

describe("columnas", () => {
  it("agrupa los estados de ejercicio en cinco columnas + descartado", () => {
    expect(experimentColumn("idea")).toBe("todo");
    expect(experimentColumn("prioritized")).toBe("todo");
    expect(experimentColumn("in_design")).toBe("design");
    expect(experimentColumn("in_test")).toBe("test");
    expect(experimentColumn("in_reading")).toBe("reading");
    expect(experimentColumn("decided")).toBe("closed");
    expect(experimentColumn("scaled")).toBe("closed");
    expect(experimentColumn("discarded")).toBe("discarded");
  });

  it("mapea el ciclo de pilotos a las mismas columnas", () => {
    expect(pilotColumn("draft")).toBe("todo");
    expect(pilotColumn("in_review")).toBe("todo");
    expect(pilotColumn("approved")).toBe("design");
    expect(pilotColumn("in_test")).toBe("test");
    expect(pilotColumn("in_reading")).toBe("reading");
    expect(pilotColumn("decided")).toBe("closed");
    expect(pilotColumn("cancelled")).toBe("discarded");
    for (const s of PILOT_STATUSES) expect(pilotColumn(s)).toBeTruthy();
  });

  it("todos los estados de ejercicio tienen columna", () => {
    for (const s of EXPERIMENT_STATUSES) expect(experimentColumn(s)).toBeTruthy();
  });
});

describe("dropOptions · soltar en columna agrupada respeta el ciclo de vida", () => {
  it("En diseño → Por hacer solo puede volver a Priorizado", () => {
    expect(dropOptions(TRANSITIONS.in_design, "todo")).toEqual(["prioritized"]);
  });
  it("En lectura → Cerrado solo pasa a Decidido", () => {
    expect(dropOptions(TRANSITIONS.in_reading, "closed")).toEqual(["decided"]);
  });
  it("sin transición válida no hay opciones", () => {
    expect(dropOptions(TRANSITIONS.idea, "test")).toEqual([]);
  });
  it("si caben varios destinos los devuelve todos (se pregunta)", () => {
    expect(dropOptions(["idea", "prioritized"], "todo")).toEqual(["idea", "prioritized"]);
  });
});

describe("límites WIP y envejecimiento", () => {
  it("muestra 3/4 y avisa al pasarse", () => {
    expect(wipState("test", 3)).toMatchObject({ text: "3/4", over: false });
    expect(wipState("test", 5)).toMatchObject({ text: "5/4", over: true });
    expect(wipState("todo", 12)).toMatchObject({ text: "12", limit: null, over: false });
    expect(wipState("test", 2, { test: 1 }).over).toBe(true);
  });
  it("una tarjeta se queda quieta según su columna", () => {
    expect(isAging("reading", 15)).toBe(true);
    expect(isAging("reading", 14)).toBe(false);
    expect(isAging("closed", 400)).toBe(false);
  });
});

describe("roadmapBucket · Ahora / Siguiente / Después", () => {
  it("ejercicios", () => {
    expect(roadmapBucket("test", "in_test")).toBe("now");
    expect(roadmapBucket("reading", "in_reading")).toBe("now");
    expect(roadmapBucket("design", "in_design")).toBe("next");
    expect(roadmapBucket("todo", "prioritized")).toBe("next");
    expect(roadmapBucket("todo", "idea")).toBe("later");
    expect(roadmapBucket("closed", "scaled")).toBeNull();
    expect(roadmapBucket("discarded", "discarded")).toBeNull();
  });
  it("pilotos", () => {
    expect(roadmapBucket("design", "approved")).toBe("next");
    expect(roadmapBucket("todo", "in_review")).toBe("next");
    expect(roadmapBucket("todo", "draft")).toBe("later");
    expect(roadmapBucket("discarded", "cancelled")).toBeNull();
  });
});

describe("boardHealth · semáforo", () => {
  const base: HealthInput = {
    column: "test",
    plannedStart: "2026-10-01",
    plannedEnd: "2026-10-31",
    actualStart: "2026-10-01",
    actualEnd: null,
    days: 10,
    lastDataAt: "2026-10-18",
    calendar: [],
    today: "2026-10-20",
  };

  it("al día cuando todo cuadra", () => {
    expect(boardHealth(base)).toEqual({ level: "green", reasons: [] });
  });

  it("rojo si pasó la fecha de fin planeada", () => {
    const h = boardHealth({ ...base, plannedEnd: "2026-10-15" });
    expect(h.level).toBe("red");
    expect(h.reasons[0]).toContain("5 días");
  });

  it("rojo si el arranque planeado cae en un congelamiento", () => {
    const h = boardHealth({
      ...base,
      column: "design",
      actualStart: null,
      plannedStart: "2026-11-27",
      calendar: [{ type: "freeze", name: "Black Friday", start_date: "2026-11-20", end_date: "2026-12-02" }],
    });
    expect(h.level).toBe("red");
    expect(h.reasons[0]).toContain("Black Friday");
  });

  it("amarillo si corre durante un congelamiento", () => {
    const h = boardHealth({ ...base, calendar: [{ type: "freeze", name: "Diciembre", start_date: "2026-10-25", end_date: "2026-11-05" }] });
    expect(h.level).toBe("yellow");
  });

  it("ignora eventos que no son congelamientos", () => {
    const h = boardHealth({ ...base, calendar: [{ type: "peak", name: "Pico", start_date: "2026-10-01", end_date: "2026-12-01" }] });
    expect(h.level).toBe("green");
  });

  it("amarillo si no hay datos recientes (con gracia al arrancar)", () => {
    expect(boardHealth({ ...base, lastDataAt: null }).reasons).toContain("Todavía no tiene datos cargados.");
    expect(boardHealth({ ...base, lastDataAt: "2026-10-01" }).level).toBe("yellow");
    expect(boardHealth({ ...base, actualStart: "2026-10-16", lastDataAt: null }).level).toBe("green");
  });

  it("amarillo si debía arrancar y no ha arrancado", () => {
    const h = boardHealth({ ...base, column: "design", actualStart: null, plannedStart: "2026-10-10" });
    expect(h.level).toBe("yellow");
    expect(h.reasons[0]).toContain("10 días");
  });

  it("amarillo si lleva mucho en la columna", () => {
    expect(boardHealth({ ...base, column: "reading", days: 30 }).level).toBe("yellow");
  });

  it("rojo manda sobre amarillo y junta las razones", () => {
    const h = boardHealth({ ...base, plannedEnd: "2026-10-15", lastDataAt: null });
    expect(h.level).toBe("red");
    expect(h.reasons).toHaveLength(2);
  });

  it("cerrados y descartados no se marcan", () => {
    expect(boardHealth({ ...base, column: "closed", plannedEnd: "2026-01-01" }).level).toBe("green");
  });
});

describe("filtros del tablero general", () => {
  it("lee la URL con valores por defecto seguros", () => {
    expect(parseBoardFilters({})).toEqual({ vista: "gantt", programa: null, tipo: "todo", responsable: null });
    expect(parseBoardFilters({ vista: "ruta", tipo: "pilotos", programa: "p1", responsable: ["u1", "u2"] })).toEqual({
      vista: "ruta",
      programa: "p1",
      tipo: "pilotos",
      responsable: "u1",
    });
    expect(parseBoardFilters({ vista: "otra", tipo: "x" })).toMatchObject({ vista: "gantt", tipo: "todo" });
  });

  const items = [
    { id: "e1", kind: "experiment" as const, programId: "p1", ownerId: "u1" },
    { id: "e2", kind: "experiment" as const, programId: "p2", ownerId: null },
    { id: "pl", kind: "pilot" as const, programId: null, ownerId: "u1" },
  ];
  const f = parseBoardFilters({});

  it("filtra por tipo, programa y responsable", () => {
    expect(filterBoardItems(items, { ...f, tipo: "pilotos" }).map((i) => i.id)).toEqual(["pl"]);
    expect(filterBoardItems(items, { ...f, tipo: "ejercicios" }).map((i) => i.id)).toEqual(["e1", "e2"]);
    expect(filterBoardItems(items, { ...f, programa: "p1" }).map((i) => i.id)).toEqual(["e1"]);
    expect(filterBoardItems(items, { ...f, responsable: "u1" }).map((i) => i.id)).toEqual(["e1", "pl"]);
    expect(filterBoardItems(items, { ...f, responsable: UNASSIGNED }).map((i) => i.id)).toEqual(["e2"]);
  });
});

describe("ownerInitials", () => {
  it("toma dos iniciales", () => {
    expect(ownerInitials("Ana María Gómez")).toBe("AM");
    expect(ownerInitials("juan@wom.co")).toBe("JW");
    expect(ownerInitials(null)).toBe("?");
    expect(ownerInitials("  ")).toBe("?");
  });
});
