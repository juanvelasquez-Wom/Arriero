import { describe, expect, it } from "vitest";
import { certificateLevel, certificateNumber, gradeQuiz, PASS_MARK, QUIZZES, retryMessage, type CertificateKind } from "./certificates";

const KINDS: CertificateKind[] = ["growth", "arriero"];

describe("QUIZZES", () => {
  it.each(KINDS)("%s: 10 preguntas bien armadas", (kind) => {
    const qs = QUIZZES[kind];
    expect(qs).toHaveLength(10);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
    for (const q of qs) {
      expect(q.options.length).toBeGreaterThanOrEqual(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
      expect(q.answer).toBeLessThan(q.options.length);
      expect(q.why.length).toBeGreaterThan(10);
    }
  });
  it("no usa voseo ni tuteo", () => {
    const text = KINDS.flatMap((k) => QUIZZES[k].flatMap((q) => [q.question, q.why, ...q.options])).join(" ");
    expect(text).not.toMatch(/\b(vos|tenés|sabés|querés|tú|tienes|sabes)\b/i);
  });
});

describe("gradeQuiz", () => {
  it("cuenta las correctas y aplica el mínimo", () => {
    const all = QUIZZES.growth.map((q) => q.answer);
    expect(gradeQuiz("growth", all)).toEqual({ correct: 10, total: 10, passed: true });
    const seven = all.map((a, i) => (i < PASS_MARK ? a : null));
    expect(gradeQuiz("growth", seven).passed).toBe(true);
    const six = all.map((a, i) => (i < PASS_MARK - 1 ? a : (a + 1) % 3));
    expect(gradeQuiz("growth", six)).toMatchObject({ correct: 6, passed: false });
  });
});

describe("certificateLevel y retryMessage", () => {
  it("da un nivel por puntaje", () => {
    expect(certificateLevel(10).title).toBe("Arriero Mayor");
    expect(certificateLevel(9).title).toBe("Arriero de Confianza");
    expect(certificateLevel(8).title).toBe("Arriero Hecho y Derecho");
    expect(certificateLevel(7).title).toBe("Arriero de Pie Limpio");
  });
  it("consuela distinto según qué tan cerca quedó", () => {
    expect(retryMessage(6)).toMatch(/pelito/);
    expect(retryMessage(1)).toMatch(/nadie nace arriando/);
  });
});

describe("certificateNumber", () => {
  it("es estable y distingue tipo, persona y fecha", () => {
    const a = certificateNumber("growth", "Ana Gómez", "2026-09-28");
    expect(a).toMatch(/^ARR-GR-2026-[0-9A-Z]{7}$/);
    expect(certificateNumber("growth", " ana gómez ", "2026-09-28")).toBe(a);
    expect(certificateNumber("arriero", "Ana Gómez", "2026-09-28")).toMatch(/^ARR-HE-/);
    expect(certificateNumber("growth", "Ana Gómez", "2026-09-29")).not.toBe(a);
  });
});
