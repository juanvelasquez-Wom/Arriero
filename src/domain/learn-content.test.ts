import { describe, expect, it } from "vitest";
import {
  HYPOTHESIS_SLOTS,
  isOrderCorrect,
  LESSONS,
  lessonIce,
  lessonLift,
  parseDeckProgress,
  serializeDeckProgress,
  shuffleForOrder,
  TOUR_STEPS,
} from "./learn-content";

const filled = (s: string) => s.trim().length > 0;
const VOSEO = /\b(tenés|querés|podés|sabés|hacé|mirá|elegí|tocá|vos)\b/i;
const TUTEO = /\b(tú|puedes|quieres|elige|mira|toca)\b/i;

describe("LESSONS", () => {
  it("tiene entre 8 y 12 lecciones con ids únicos", () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(8);
    expect(LESSONS.length).toBeLessThanOrEqual(12);
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("cada lección tiene título, cuerpo corto, ejemplo e interacción", () => {
    for (const l of LESSONS) {
      expect(filled(l.title), l.id).toBe(true);
      expect(filled(l.kicker), l.id).toBe(true);
      expect(l.body.length, l.id).toBeGreaterThanOrEqual(1);
      expect(l.body.length, l.id).toBeLessThanOrEqual(3);
      expect(l.body.every(filled), l.id).toBe(true);
      expect(filled(l.example.line) && filled(l.example.text), l.id).toBe(true);
      expect(filled(l.interaction.question), l.id).toBe(true);
    }
  });

  it("las preguntas de opción tienen exactamente una correcta, ids únicos y retroalimentación", () => {
    for (const l of LESSONS) {
      if (l.interaction.kind !== "choice") continue;
      const opts = l.interaction.options;
      expect(opts.length, l.id).toBeGreaterThanOrEqual(2);
      expect(opts.filter((o) => o.correct).length, l.id).toBe(1);
      expect(new Set(opts.map((o) => o.id)).size, l.id).toBe(opts.length);
      expect(opts.every((o) => filled(o.label) && filled(o.feedback)), l.id).toBe(true);
    }
  });

  it("las demás interacciones están bien armadas", () => {
    for (const l of LESSONS) {
      const x = l.interaction;
      if (x.kind === "order") {
        expect(new Set(x.items.map((i) => i.id)).size).toBe(x.items.length);
        expect(x.items.length).toBeGreaterThanOrEqual(3);
      }
      if (x.kind === "hypothesis") {
        expect(x.parts.map((p) => p.slot).sort()).toEqual(HYPOTHESIS_SLOTS.map((s) => s.slot).sort());
      }
      if (x.kind === "ice") {
        for (const v of Object.values(x.initial)) expect(v >= 1 && v <= 10).toBe(true);
      }
      if (x.kind === "lift") {
        expect(x.min <= x.initial && x.initial <= x.max).toBe(true);
        expect(x.control).toBeGreaterThan(0);
      }
    }
  });

  it("cubre los temas del modelo", () => {
    const ids = LESSONS.map((l) => l.id);
    for (const id of ["growth", "norte", "arbol", "embudo", "problema", "ejercicio", "ice", "calendario", "decision", "aprendizaje", "piloto"]) {
      expect(ids).toContain(id);
    }
  });

  it("habla de usted: sin voseo ni tuteo", () => {
    const texts = LESSONS.flatMap((l) => [
      l.title,
      ...l.body,
      l.example.text,
      l.interaction.question,
      ...(l.interaction.kind === "choice" ? l.interaction.options.flatMap((o) => [o.label, o.feedback]) : []),
    ]);
    for (const t of texts) {
      expect(VOSEO.test(t), t).toBe(false);
      expect(TUTEO.test(t), t).toBe(false);
    }
  });
});

describe("TOUR_STEPS", () => {
  it("tiene 12 pasos con ids únicos y contenido", () => {
    expect(TOUR_STEPS).toHaveLength(12);
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of TOUR_STEPS) {
      expect(filled(s.title), s.id).toBe(true);
      expect(s.body.every(filled) && s.body.length > 0, s.id).toBe(true);
      expect(s.points.every(filled), s.id).toBe(true);
      expect(s.href.startsWith("/"), s.id).toBe(true);
      expect(filled(s.hrefLabel), s.id).toBe(true);
    }
  });

  it("los pasos de un programa llevan a Mis programas o a crear uno", () => {
    for (const s of TOUR_STEPS.filter((x) => x.scope === "program")) {
      expect(s.href).toBe("/programas");
    }
  });
});

describe("cálculos de las interacciones", () => {
  it("ICE reutiliza la regla del dominio", () => {
    expect(lessonIce(8, 7, 8)).toBe(7.7);
    expect(lessonIce(7, 5, 9)).toBe(7);
  });

  it("incrementalidad frente al control", () => {
    expect(lessonLift(40, 46)).toBeCloseTo(0.15);
    expect(lessonLift(40, 40)).toBe(0);
    expect(lessonLift(0, 10)).toBeNull();
  });

  it("revuelve sin dejar el orden correcto", () => {
    for (const n of [2, 3, 4, 5]) {
      const items = Array.from({ length: n }, (_, i) => `x${i}`);
      const shuffled = shuffleForOrder(items);
      expect([...shuffled].sort()).toEqual([...items].sort());
      expect(isOrderCorrect(items, shuffled)).toBe(false);
    }
    expect(isOrderCorrect(["a", "b"], ["a", "b"])).toBe(true);
  });

  it("lee el progreso guardado con tolerancia", () => {
    expect(parseDeckProgress(null, 5)).toEqual({ index: 0, finished: false });
    expect(parseDeckProgress("no es json", 5)).toEqual({ index: 0, finished: false });
    expect(parseDeckProgress('{"index":99,"finished":true}', 5)).toEqual({ index: 4, finished: true });
    expect(parseDeckProgress('{"index":-3}', 5)).toEqual({ index: 0, finished: false });
    const p = { index: 2, finished: false };
    expect(parseDeckProgress(serializeDeckProgress(p), 5)).toEqual(p);
  });
});
