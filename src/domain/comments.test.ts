import { describe, expect, it } from "vitest";
import { canDeleteComment, relativeTime } from "./comments";

describe("relativeTime", () => {
  const now = new Date("2026-09-26T15:00:00Z");
  it("usa minutos, horas y días", () => {
    expect(relativeTime("2026-09-26T14:59:40Z", now)).toBe("hace un momento");
    expect(relativeTime("2026-09-26T14:55:00Z", now)).toBe("hace 5 min");
    expect(relativeTime("2026-09-26T12:00:00Z", now)).toBe("hace 3 h");
    expect(relativeTime("2026-09-25T12:00:00Z", now)).toBe("ayer");
    expect(relativeTime("2026-09-22T12:00:00Z", now)).toBe("hace 4 días");
  });
  it("más de un mes muestra la fecha", () => {
    expect(relativeTime("2026-07-01T12:00:00Z", now)).toMatch(/2026/);
  });
  it("una fecha futura (reloj corrido) no da negativos", () => {
    expect(relativeTime("2026-09-26T15:02:00Z", now)).toBe("hace un momento");
  });
});

describe("canDeleteComment", () => {
  it("el autor o un admin", () => {
    expect(canDeleteComment({ userId: "u1", isAdmin: false }, { created_by: "u1" })).toBe(true);
    expect(canDeleteComment({ userId: "u2", isAdmin: false }, { created_by: "u1" })).toBe(false);
    expect(canDeleteComment({ userId: "u2", isAdmin: true }, { created_by: "u1" })).toBe(true);
    expect(canDeleteComment({ userId: "u2", isAdmin: false }, { created_by: null })).toBe(false);
  });
});
