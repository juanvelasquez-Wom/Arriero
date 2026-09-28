import { describe, expect, it } from "vitest";
import {
  authorLabel,
  canMovePhase,
  favoritesLeft,
  filterSessions,
  ideaActions,
  isOverdue,
  pendingToScore,
  phaseMoves,
  pilotPrefillFromIdea,
  rankIdeas,
  RIP_LINES,
  ripLine,
  sessionActions,
  sessionCounts,
  SHY_AUTHOR,
  type IdeaRow,
  type IdeaScore,
  type IdeaSessionRow,
} from "./ideas";

function idea(id: string, over: Partial<IdeaRow> = {}): IdeaRow {
  return {
    id,
    session_id: "s1",
    title: `Idea ${id}`,
    detail: null,
    anonymous: false,
    author_name: "Ana",
    mine: false,
    decision: null,
    decision_note: null,
    decided_at: null,
    program_id: null,
    pilot_id: null,
    insight_id: null,
    linked_at: null,
    created_at: `2026-09-28T10:00:0${id.length}Z`,
    ...over,
  };
}
const score = (idea_id: string, impact: number | null, ease: number | null, favorite = false, mine = false): IdeaScore => ({
  idea_id,
  impact,
  ease,
  favorite,
  mine,
});
function session(over: Partial<IdeaSessionRow> = {}): IdeaSessionRow {
  return {
    id: "s1",
    title: "¿Cómo subimos las portabilidades?",
    context: null,
    line_hint: null,
    deadline: null,
    phase: "open",
    phase_changed_at: "2026-09-28T10:00:00Z",
    closed_at: null,
    created_at: "2026-09-28T10:00:00Z",
    owner_name: "Ana",
    mine: false,
    idea_count: 0,
    chosen_count: 0,
    buried_count: 0,
    ...over,
  };
}

describe("fases del aguacero", () => {
  it("solo deja los saltos de la RPC", () => {
    expect(canMovePhase("open", "voting")).toBe(true);
    expect(canMovePhase("open", "closed")).toBe(false);
    expect(canMovePhase("voting", "open")).toBe(true);
    expect(canMovePhase("voting", "closed")).toBe(true);
    expect(canMovePhase("closed", "voting")).toBe(true);
    expect(canMovePhase("closed", "open")).toBe(false);
  });
  it("sin ideas no hay votación y lo convertido no se reabre", () => {
    expect(phaseMoves("open", { hasIdeas: false, hasLinked: false })).toHaveLength(0);
    expect(phaseMoves("open", { hasIdeas: true, hasLinked: false })[0]).toMatchObject({ to: "voting", primary: true });
    expect(phaseMoves("voting", { hasIdeas: true, hasLinked: false }).map((m) => m.to)).toEqual(["closed", "open"]);
    expect(phaseMoves("closed", { hasIdeas: true, hasLinked: true })).toHaveLength(0);
  });
});

describe("permisos para la UI", () => {
  it("el dueño o un admin mueven y deciden; los demás anotan y puntúan", () => {
    const guest = { isOwner: false, isAdmin: false };
    const owner = { isOwner: true, isAdmin: false };
    expect(sessionActions(session(), guest)).toMatchObject({ addIdea: true, score: false, movePhase: false, decide: false });
    expect(sessionActions(session({ phase: "voting" }), guest)).toMatchObject({ addIdea: false, score: true });
    expect(sessionActions(session({ phase: "closed" }), owner)).toMatchObject({ decide: true, movePhase: true });
    expect(sessionActions(session({ phase: "closed" }), { isOwner: false, isAdmin: true }).decide).toBe(true);
  });
  it("la idea propia no se puntúa y lo convertido no se borra ni se re-decide", () => {
    const owner = { isOwner: true, isAdmin: false };
    expect(ideaActions(idea("a", { mine: true }), session({ phase: "voting" }), owner).score).toBe(false);
    expect(ideaActions(idea("a"), session({ phase: "voting" }), owner).score).toBe(true);
    expect(ideaActions(idea("a", { mine: true }), session({ phase: "voting" }), owner).edit).toBe(false);
    const linked = idea("a", { linked_at: "2026-09-28T12:00:00Z", decision: "project" });
    expect(ideaActions(linked, session({ phase: "closed" }), owner)).toMatchObject({ remove: false, decide: false });
  });
});

describe("rankIdeas", () => {
  it("ordena por impacto × facilidad, luego favoritas, y deja al final las sin puntaje", () => {
    const ideas = [idea("a"), idea("bb"), idea("ccc"), idea("dddd")];
    const scores = [
      score("a", 3, 3),
      score("a", 5, 5, true),
      score("bb", 5, 4),
      score("bb", 3, 4, true),
      score("ccc", 4, 4, true),
      score("dddd", null, null, true),
    ];
    const r = rankIdeas(ideas, scores);
    expect(r.map((x) => x.idea.id)).toEqual(["a", "bb", "ccc", "dddd"]);
    expect(r[0]).toMatchObject({ impact: 4, ease: 4, score: 16, voters: 2, favorites: 1, position: 1 });
    expect(r[1].score).toBe(16);
    expect(r[1].position).toBe(1); // empate: mismo puntaje, favoritas y votantes
    expect(r[2].position).toBe(3); // mismo puntaje, pero con menos votantes
    expect(r[3]).toMatchObject({ score: null, voters: 0, favorites: 1, position: 4 });
  });
  it("con puntaje parcial no cuenta como votante", () => {
    const r = rankIdeas([idea("a")], [score("a", 5, null)]);
    expect(r[0]).toMatchObject({ voters: 0, score: null });
  });
});

describe("favoritas y pendientes", () => {
  it("máximo 3 «¡Esta!» por persona", () => {
    expect(favoritesLeft([])).toBe(3);
    expect(favoritesLeft([score("a", 1, 1, true, true), score("b", 1, 1, true, true), score("c", 1, 1, true, false)])).toBe(1);
  });
  it("cuenta solo las ideas ajenas sin puntaje completo", () => {
    const ideas = [idea("a"), idea("b", { mine: true }), idea("c")];
    expect(pendingToScore(ideas, [score("a", 3, 3, false, true), score("c", 3, null, false, true)])).toBe(1);
  });
});

describe("anonimato y frases", () => {
  it("la idea anónima firma como arriero tímido, salvo para su autor", () => {
    expect(authorLabel({ anonymous: true, author_name: null, mine: false })).toBe(SHY_AUTHOR);
    expect(authorLabel({ anonymous: true, author_name: null, mine: true })).toBe("Usted (en anónimo)");
    expect(authorLabel({ anonymous: false, author_name: "Ana", mine: false })).toBe("Ana");
  });
  it("la lápida es estable por idea", () => {
    expect(ripLine("x1")).toBe(ripLine("x1"));
    expect(RIP_LINES).toContain(ripLine("otra"));
  });
  it("prellena el piloto con la idea y su aguacero", () => {
    const p = pilotPrefillFromIdea({ title: "Regalar el primer mes", detail: null, sessionTitle: "Portas", author: SHY_AUTHOR });
    expect(p.problem).toBe("Regalar el primer mes");
    expect(p.problem_evidence).toContain("un arriero tímido");
  });
});

describe("lista de aguaceros", () => {
  it("filtra por fase y cuenta", () => {
    const list = [
      session({ id: "1", phase: "open", mine: true, idea_count: 4 }),
      session({ id: "2", phase: "voting", idea_count: 2, chosen_count: 0 }),
      session({ id: "3", phase: "closed", idea_count: 5, chosen_count: 2, buried_count: 3 }),
    ];
    expect(filterSessions(list, "abiertas").map((s) => s.id)).toEqual(["1"]);
    expect(filterSessions(list, "mios").map((s) => s.id)).toEqual(["1"]);
    expect(filterSessions(list, "cerradas").map((s) => s.id)).toEqual(["3"]);
    expect(sessionCounts(list)).toMatchObject({ open: 1, voting: 1, closed: 1, mine: 1, ideas: 11, chosen: 2, buried: 3 });
  });
  it("fecha límite vencida", () => {
    expect(isOverdue("2026-09-27", "2026-09-28")).toBe(true);
    expect(isOverdue("2026-09-28", "2026-09-28")).toBe(false);
    expect(isOverdue(null, "2026-09-28")).toBe(false);
  });
});
