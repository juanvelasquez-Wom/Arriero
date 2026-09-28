import { describe, expect, it } from "vitest";
import { activeRange, collisionPairs, collisionsFor, describeCollision, findCollision, type CollisionCandidate } from "./collisions";

const today = "2026-10-05";
const base: CollisionCandidate = {
  id: "a",
  title: "A",
  status: "in_test",
  line_id: "l1",
  stage_id: "s1",
  stage_name: "Conversión",
  channel: "WhatsApp",
  planned_start: "2026-10-01",
  planned_end: "2026-10-20",
  actual_start: null,
  actual_end: null,
};
const mk = (over: Partial<CollisionCandidate>): CollisionCandidate => ({ ...base, ...over });

describe("activeRange", () => {
  it("usa lo real si arrancó y, corriendo, llega al menos a hoy", () => {
    expect(activeRange(mk({ actual_start: "2026-09-01", planned_end: "2026-09-10" }), today)).toEqual({ start: "2026-09-01", end: today });
    expect(activeRange(mk({}), today)).toEqual({ start: "2026-10-01", end: "2026-10-20" });
    expect(activeRange(mk({ planned_start: null }), today)).toBeNull();
    expect(activeRange(mk({ status: "prioritized", planned_end: null }), today)).toBeNull();
  });
});

describe("findCollision", () => {
  it("misma línea, fechas cruzadas y misma etapa y canal", () => {
    const c = findCollision(mk({}), mk({ id: "b", title: "B", planned_start: "2026-10-15", planned_end: "2026-11-01" }), today)!;
    expect(c.otherId).toBe("b");
    expect(c.from).toBe("2026-10-15");
    expect(c.to).toBe("2026-10-20");
    expect(c.shared.map((s) => s.reason)).toEqual(["stage", "channel"]);
    expect(describeCollision(c)).toBe("Comparten etapa (Conversión) y canal (WhatsApp)");
  });

  it("el canal se compara sin tildes ni mayúsculas", () => {
    const c = findCollision(mk({ stage_id: "s1" }), mk({ id: "b", stage_id: "s2", channel: " whatsapp " }), today)!;
    expect(c.shared).toEqual([{ reason: "channel", value: "WhatsApp" }]);
  });

  it("no cruza: otra línea, sin fechas en común, sin nada compartido o cerrado", () => {
    expect(findCollision(mk({}), mk({ id: "b", line_id: "l2" }), today)).toBeNull();
    expect(findCollision(mk({}), mk({ id: "b", planned_start: "2026-11-01", planned_end: "2026-11-10" }), today)).toBeNull();
    expect(findCollision(mk({}), mk({ id: "b", stage_id: "s2", channel: "Email" }), today)).toBeNull();
    expect(findCollision(mk({}), mk({ id: "b", status: "decided" }), today)).toBeNull();
    expect(findCollision(mk({}), mk({ id: "b", status: "idea" }), today)).toBeNull();
    expect(findCollision(mk({}), mk({}), today)).toBeNull();
  });
});

describe("collisionsFor y collisionPairs", () => {
  const list = [mk({}), mk({ id: "b", title: "B" }), mk({ id: "c", title: "C", line_id: "l2" })];
  it("lista los cruces de uno y las parejas una sola vez", () => {
    expect(collisionsFor(list[0], list, today).map((c) => c.otherId)).toEqual(["b"]);
    const pairs = collisionPairs(list, today);
    expect(pairs).toHaveLength(1);
    expect(pairs[0].a.id).toBe("a");
    expect(pairs[0].b.id).toBe("b");
  });
});
