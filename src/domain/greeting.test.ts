import { describe, expect, it } from "vitest";
import { bogotaHour, greetingFor } from "./greeting";

describe("greetingFor", () => {
  it("saluda según la hora", () => {
    expect(greetingFor(8).hello).toBe("Buenos días");
    expect(greetingFor(13).quip).toMatch(/almuerzo/);
    expect(greetingFor(16).hello).toBe("Buenas tardes");
    expect(greetingFor(21).hello).toBe("Buenas noches");
    expect(greetingFor(2).quip).toMatch(/esta hora/);
  });
});

describe("bogotaHour", () => {
  it("usa la hora de Bogotá (UTC−5)", () => {
    expect(bogotaHour(new Date("2026-09-28T13:30:00Z"))).toBe(8);
    expect(bogotaHour(new Date("2026-09-28T04:00:00Z"))).toBe(23);
  });
});
