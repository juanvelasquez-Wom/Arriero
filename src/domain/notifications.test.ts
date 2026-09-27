import { describe, expect, it } from "vitest";
import { badgeText, countUnread, isNotificationKind, relativeTime, safeHref } from "./notifications";

describe("countUnread y badgeText", () => {
  it("cuenta los no leídos y resume más de 9", () => {
    expect(countUnread([{ read_at: null }, { read_at: "2026-09-01T00:00:00Z" }, { read_at: null }])).toBe(2);
    expect(badgeText(0)).toBeNull();
    expect(badgeText(3)).toBe("3");
    expect(badgeText(12)).toBe("9+");
  });
});

describe("safeHref", () => {
  it("solo acepta rutas internas", () => {
    expect(safeHref("/programas/1")).toBe("/programas/1");
    expect(safeHref("https://malo.com")).toBeNull();
    expect(safeHref("//malo.com")).toBeNull();
    expect(safeHref(null)).toBeNull();
  });
});

describe("relativeTime", () => {
  const now = new Date("2026-09-26T15:00:00Z");
  it("escala de momento a fecha", () => {
    expect(relativeTime("2026-09-26T14:59:30Z", now)).toBe("hace un momento");
    expect(relativeTime("2026-09-26T14:40:00Z", now)).toBe("hace 20 min");
    expect(relativeTime("2026-09-26T10:00:00Z", now)).toBe("hace 5 h");
    expect(relativeTime("2026-09-25T10:00:00Z", now)).toBe("ayer");
    expect(relativeTime("2026-09-22T10:00:00Z", now)).toBe("hace 4 días");
    expect(relativeTime("2026-09-01T10:00:00Z", now)).toMatch(/1/);
    expect(relativeTime("no es fecha", now)).toBe("");
  });
  it("reconoce los tipos", () => {
    expect(isNotificationKind("mention")).toBe(true);
    expect(isNotificationKind("otro")).toBe(false);
  });
});
