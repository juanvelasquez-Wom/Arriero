import { describe, expect, it } from "vitest";
import { addDays, daysBetween, isMonday, isWithin, maxDate, minDate, mondaysBetween, rangesOverlap, todayIso, weekStart } from "./dates";

describe("fechas sin hora", () => {
  it("suma días cruzando meses y años bisiestos", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("cuenta días entre fechas", () => {
    expect(daysBetween("2026-09-01", "2026-09-28")).toBe(27);
    expect(daysBetween("2026-09-28", "2026-09-01")).toBe(-27);
  });

  it("las semanas empiezan el lunes", () => {
    expect(weekStart("2026-09-27")).toBe("2026-09-21"); // domingo → lunes anterior
    expect(weekStart("2026-09-28")).toBe("2026-09-28"); // lunes
    expect(isMonday("2026-09-28")).toBe(true);
    expect(isMonday("2026-09-27")).toBe(false);
    expect(mondaysBetween("2026-09-24", "2026-10-06")).toEqual(["2026-09-21", "2026-09-28", "2026-10-05"]);
  });

  it("hoy se calcula en hora de Bogotá", () => {
    // 28 sep 03:00 UTC = 27 sep 22:00 en Bogotá (UTC−5).
    expect(todayIso(new Date("2026-09-28T03:00:00Z"))).toBe("2026-09-27");
    expect(todayIso(new Date("2026-09-28T06:00:00Z"))).toBe("2026-09-28");
  });

  it("rangos, pertenencia, mínimo y máximo", () => {
    expect(rangesOverlap("2026-10-01", "2026-10-10", "2026-10-10", "2026-10-20")).toBe(true);
    expect(rangesOverlap("2026-10-01", "2026-10-09", "2026-10-10", "2026-10-20")).toBe(false);
    expect(isWithin("2026-10-05", "2026-10-01", "2026-10-05")).toBe(true);
    expect(minDate(null, "2026-10-05", "2026-09-01", undefined)).toBe("2026-09-01");
    expect(maxDate("2026-10-05", "2026-11-01")).toBe("2026-11-01");
    expect(minDate()).toBeNull();
  });
});
