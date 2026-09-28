import { describe, expect, it } from "vitest";
import {
  BADGES,
  computeScore,
  currentStreak,
  ghostLine,
  LEVELS,
  levelFor,
  nudge,
  POINT_RULES,
  positionTitle,
  rankUsers,
  type UserStats,
} from "./gamification";

const TODAY = "2026-09-28";

function stats(over: Partial<UserStats> = {}): UserStats {
  return {
    user_id: "u1",
    name: "Ana",
    days_used: 0,
    recent_days: [],
    programs_created: 0,
    programs_ready: 0,
    programs_crowned: 0,
    problems_created: 0,
    experiments_created: 0,
    experiments_decided: 0,
    winners: 0,
    losers: 0,
    scaled: 0,
    discarded: 0,
    stale_ideas: 0,
    learnings: 0,
    weeks_loaded: 0,
    comments: 0,
    pilots_created: 0,
    pilots_decided: 0,
    pilots_cancelled: 0,
    pilot_data_days: 0,
    trashed: 0,
    ...over,
  };
}

describe("currentStreak", () => {
  it("cuenta días seguidos hasta hoy o ayer", () => {
    expect(currentStreak(["2026-09-28", "2026-09-27", "2026-09-26", "2026-09-24"], TODAY)).toBe(3);
    expect(currentStreak(["2026-09-27", "2026-09-26"], TODAY)).toBe(2);
    expect(currentStreak(["2026-09-25"], TODAY)).toBe(0);
    expect(currentStreak([], TODAY)).toBe(0);
  });
  it("cruza el cambio de mes", () => {
    expect(currentStreak(["2026-10-01", "2026-09-30", "2026-09-29"], "2026-10-01")).toBe(3);
  });
});

describe("computeScore", () => {
  it("suma por regla, con topes y racha desde el tercer día", () => {
    const s = stats({
      days_used: 4,
      recent_days: ["2026-09-28", "2026-09-27", "2026-09-26", "2026-09-25"],
      experiments_decided: 1,
      winners: 1,
      comments: 100,
    });
    const r = computeScore(s, TODAY);
    expect(r.streak).toBe(4);
    // 4×5 días + 2×3 racha + 60 decidido + 80 ganador + 40×3 comentarios (tope)
    expect(r.points).toBe(20 + 6 + 60 + 80 + 120);
    expect(r.lines.find((l) => l.key === "comments")?.count).toBe(40);
  });
  it("las ideas quietas restan, pero el total nunca es negativo", () => {
    expect(computeScore(stats({ stale_ideas: 3 }), TODAY).points).toBe(0);
    expect(computeScore(stats({ days_used: 10, stale_ideas: 2 }), TODAY).points).toBe(30);
  });
});

describe("levelFor y nudge", () => {
  it("ubica el nivel y lo que falta", () => {
    expect(levelFor(0).level.title).toBe("Turista en chanclas");
    const l = levelFor(100);
    expect(l.level.title).toBe("Sangrero");
    expect(l.next?.title).toBe("Arriero de a pie");
    expect(l.missing).toBe(80);
    expect(levelFor(99999).next).toBeNull();
    expect(nudge(99999)).toMatch(/enseñarle/);
    expect(nudge(170)).toMatch(/panela/);
  });
  it("niveles en orden creciente", () => {
    for (let i = 1; i < LEVELS.length; i++) expect(LEVELS[i].min).toBeGreaterThan(LEVELS[i - 1].min);
  });
});

describe("rankUsers", () => {
  it("ordena, comparte puesto en empates y saca a quien no tiene nada", () => {
    const rows = [
      stats({ user_id: "a", name: "Ana", days_used: 2, recent_days: [TODAY] }),
      stats({ user_id: "b", name: "Beto", days_used: 2, recent_days: [TODAY] }),
      stats({ user_id: "c", name: "Caro", programs_created: 1, recent_days: ["2026-07-01"] }),
      stats({ user_id: "d", name: "Dani" }),
    ];
    const r = rankUsers(rows, TODAY);
    expect(r.map((u) => u.userId)).toEqual(["c", "a", "b"]);
    expect(r.map((u) => u.position)).toEqual([1, 2, 2]);
    expect(r[0].ghost).toBe(true);
    expect(r[1].ghost).toBe(false);
    expect(r[0].badges.map((b) => b.id)).toContain("fundador");
  });
});

describe("textos", () => {
  it("apodos de puesto", () => {
    expect(positionTitle(1, 10)).toMatch(/manda/);
    expect(positionTitle(10, 10)).toBe("El farolito rojo");
    expect(positionTitle(5, 10)).toBeNull();
  });
  it("frase de fantasma estable", () => {
    expect(ghostLine("abc")).toBe(ghostLine("abc"));
  });
  it("todo de usted: sin voseo ni tuteo", () => {
    const text = [
      ...POINT_RULES.flatMap((r) => [r.label, r.joke]),
      ...LEVELS.flatMap((l) => [l.title, l.blurb]),
      ...BADGES.flatMap((b) => [b.title, b.description]),
    ].join(" ");
    expect(text).not.toMatch(/\b(vos|tenés|sabés|querés|tú|tienes|sabes|eres)\b/i);
  });
  it("ids de insignias únicos", () => {
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
