import { describe, expect, it } from "vitest";
import { checkPostScale } from "./post-scale";

// Decidido el miércoles 2 sep 2026 → semana del lunes 31 ago.
const decidedAt = "2026-09-02T15:00:00Z";
const before = [
  { week_start: "2026-08-03", value: 100 },
  { week_start: "2026-08-10", value: 100 },
  { week_start: "2026-08-17", value: 100 },
  { week_start: "2026-08-24", value: 100 },
];
const after4 = [
  { week_start: "2026-09-07", value: 110 },
  { week_start: "2026-09-14", value: 110 },
  { week_start: "2026-09-21", value: 110 },
  { week_start: "2026-09-28", value: 110 },
];
const after8 = [
  { week_start: "2026-10-05", value: 95 },
  { week_start: "2026-10-12", value: 95 },
];

describe("checkPostScale", () => {
  it("sostuvo el lift en las semanas 1 a 4", () => {
    const r = checkPostScale({ decidedAt, direction: "up", values: [...before, ...after4], today: "2026-10-01" });
    expect(r.status).toBe("held");
    expect(r.after4.change).toBeCloseTo(0.1, 6);
    expect(r.before.weeks).toBe(4);
    expect(r.evidence).toBe("Evidencia direccional");
  });

  it("usa la ventana más reciente con datos (5 a 8) y ahí no se sostuvo", () => {
    const r = checkPostScale({ decidedAt, direction: "up", values: [...before, ...after4, ...after8], today: "2026-10-20" });
    expect(r.status).toBe("not_held");
    expect(r.after8.change).toBeCloseTo(-0.05, 6);
    expect(r.message).toMatch(/semanas 5 a 8/);
  });

  it("respeta la dirección: si menos es mejor, bajar es sostener", () => {
    const r = checkPostScale({ decidedAt, direction: "down", values: [...before, ...after4, ...after8], today: "2026-10-20" });
    expect(r.status).toBe("held");
  });

  it("faltan datos antes, después o la fecha", () => {
    expect(checkPostScale({ decidedAt, direction: "up", values: after4, today: "2026-10-01" }).status).toBe("missing");
    const early = checkPostScale({ decidedAt, direction: "up", values: before, today: "2026-09-08" });
    expect(early.status).toBe("missing");
    expect(early.message).toMatch(/temprano/);
    const late = checkPostScale({ decidedAt, direction: "up", values: before, today: "2026-11-30" });
    expect(late.message).toMatch(/carga semanal/);
    expect(checkPostScale({ decidedAt: null, direction: "up", values: before, today: "2026-10-01" }).status).toBe("missing");
  });
});
