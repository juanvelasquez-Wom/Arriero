import { describe, expect, it } from "vitest";
import type { BriefItem, BriefKey, ExecutiveBrief } from "./executive";
import { buildExecutiveGlance, glanceVerdict, stablePick, type GlanceHeadline } from "./executive-glance";
import { reportPeriod } from "./report";

const today = "2026-09-28";
const period = reportPeriod("semana", today);

function brief(items: Partial<Record<BriefKey, BriefItem[]>> = {}): ExecutiveBrief {
  const keys: BriefKey[] = ["growing", "falling", "running", "results", "learned", "value", "decide", "next", "risks"];
  return {
    period,
    programs: [{ id: "p1", name: "Programa 1", is_demo: false }],
    includesDemo: false,
    sections: keys.map((key) => ({ key, question: key, items: items[key] ?? [], empty: "" })),
  };
}

const item = (subject: string, over: Partial<BriefItem> = {}): BriefItem => ({ text: subject, subject, tone: "neutral", href: `/x/${subject}`, ...over });
const head = (over: Partial<GlanceHeadline> = {}): GlanceHeadline => ({ answer: "yes", northStarsEvaluated: 3, northStarsOnTrack: 3, includesDemo: false, ...over });

describe("glanceVerdict", () => {
  it("con metas: sí con ganadores, despacio sin ellos, y respeta más o menos y no", () => {
    expect(glanceVerdict({ answer: "yes", growing: 2, falling: 0, winners: 1 })).toBe("yes");
    expect(glanceVerdict({ answer: "yes", growing: 2, falling: 0, winners: 0 })).toBe("slow");
    expect(glanceVerdict({ answer: "mixed", growing: 1, falling: 1, winners: 3 })).toBe("mixed");
    expect(glanceVerdict({ answer: "no", growing: 0, falling: 3, winners: 0 })).toBe("no");
  });

  it("sin metas lee el movimiento del periodo", () => {
    expect(glanceVerdict({ answer: "unknown", growing: 1, falling: 1, winners: 0 })).toBe("mixed");
    expect(glanceVerdict({ answer: "unknown", growing: 2, falling: 0, winners: 0 })).toBe("slow");
    expect(glanceVerdict({ answer: "unknown", growing: 0, falling: 0, winners: 0 })).toBe("unknown");
  });
});

describe("stablePick", () => {
  it("devuelve lo mismo con la misma semilla", () => {
    const list = ["a", "b", "c"];
    expect(stablePick(list, today)).toBe(stablePick(list, today));
    expect(list).toContain(stablePick(list, "otra"));
  });
});

describe("buildExecutiveGlance", () => {
  it("arma los cuatro semáforos y las acciones con lo que pide atención primero", () => {
    const g = buildExecutiveGlance({
      brief: brief({
        growing: [item("Altas · Pospago", { tone: "good" }), item("Recargas", { tone: "good" })],
        falling: [item("Costo por alta · Pospago", { tone: "bad" })],
        running: [item("Creativos verticales")],
        results: [item("Recordatorio WhatsApp", { tone: "good" }), item("Banner", { tone: "bad" })],
        value: [{ text: "$12 M al mes", tone: "good" }],
        decide: [item("Precio en cuotas", { href: "/programas/p1/ejercicios/e9" })],
        risks: [item("Se viene un congelamiento: Black Friday")],
      }),
      headline: head({ answer: "mixed", northStarsOnTrack: 1, northStarsEvaluated: 2 }),
      pilots: [
        { id: "pl1", title: "Meta CTWA", status: "decided", decision: "scale", decided_at: "2026-09-25T15:00:00Z" },
        { id: "pl2", title: "Radio", status: "decided", decision: "scale", decided_at: "2026-08-01T15:00:00Z" },
        { id: "pl3", title: "DOOH", status: "in_reading", decision: null, decided_at: null },
      ],
      seed: today,
    });
    expect(g.verdict).toBe("mixed");
    expect(g.title).toBe("Más o menos");
    expect(g.detail).toBe("1 de 2 métricas norte van en la meta.");
    const by = Object.fromEntries(g.cards.map((c) => [c.key, c]));
    expect(by.growing.value).toBe(2);
    expect(by.growing.sentence).toBe("Altas · Pospago y 1 más van bien.");
    expect(by.worrying.value).toBe(1);
    expect(by.worrying.tone).toBe("bad");
    // Un ejercicio ganador + un piloto escalado dentro del periodo (el de agosto no cuenta).
    expect(by.won.value).toBe(2);
    expect(by.won.sentence).toMatch(/^«Recordatorio WhatsApp» y 1 más le ganaron al control\. Valor: \$12 M al mes\.$/);
    expect(by.decide.value).toBe(2);
    expect(by.decide.attention).toBe(true);
    expect(g.cards.filter((c) => c.attention)).toHaveLength(1);
    expect(g.actions).toHaveLength(3);
    expect(g.actions[0]).toMatchObject({ text: "Decidir «Precio en cuotas» y 1 más", href: "/programas/p1/ejercicios/e9" });
    expect(g.actions[1].text).toBe("Convertir «Costo por alta · Pospago» en oportunidad de mejora");
    expect(g.actions[2].text).toMatch(/congelamiento/);
  });

  it("sin datos dice que no se sabe, pide cargar y nunca pasa de tres acciones", () => {
    const g = buildExecutiveGlance({ brief: brief(), headline: head({ answer: "unknown", northStarsEvaluated: 0, northStarsOnTrack: 0 }), seed: today });
    expect(g.verdict).toBe("unknown");
    expect(g.title).toBe("Todavía no se sabe");
    expect(g.cards.every((c) => c.value === 0 && !c.attention)).toBe(true);
    expect(g.cards.find((c) => c.key === "decide")!.sentence).toMatch(/Nada esperando/);
    expect(g.actions.map((a) => a.text)).toEqual(["Priorizar la siguiente idea", "Cargar los valores de la semana y las metas"]);
    expect(g.actions[1].href).toBe("/programas/p1/carga");
  });

  it("si solo hay pilotos por decidir, la tarjeta lleva a Pilotos", () => {
    const g = buildExecutiveGlance({
      brief: brief({ running: [item("Algo")] }),
      headline: head(),
      pilots: [{ id: "pl3", title: "DOOH", status: "in_reading", decision: null, decided_at: null }],
      seed: today,
    });
    expect(g.verdict).toBe("slow");
    const decide = g.cards.find((c) => c.key === "decide")!;
    expect(decide.href).toBe("/pilotos");
    expect(g.actions[0]).toMatchObject({ text: "Decidir «DOOH»", href: "/pilotos/pl3" });
  });

  it("con todo en orden deja una sola acción tranquila", () => {
    const g = buildExecutiveGlance({
      brief: brief({ running: [item("Algo")], results: [item("Ganó", { tone: "good" })] }),
      headline: head({ includesDemo: true }),
      seed: today,
    });
    expect(g.verdict).toBe("yes");
    expect(g.detail).toMatch(/programa de ejemplo/);
    expect(g.actions).toHaveLength(1);
    expect(g.actions[0].question).toBe("running");
  });
});
