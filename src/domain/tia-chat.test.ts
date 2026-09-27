import { describe, expect, it } from "vitest";
import {
  buildChatMessages,
  CHAT_STREAM_ERROR,
  CHAT_SUGGESTIONS,
  estimateTokens,
  normalizeTurns,
  quotaLabel,
  splitStreamError,
  trimHistory,
  type ChatTurn,
} from "./tia-chat";

const u = (content: string): ChatTurn => ({ role: "user", content });
const a = (content: string): ChatTurn => ({ role: "assistant", content });

describe("estimateTokens", () => {
  it("cuenta unos 4 caracteres por token, redondeando hacia arriba", () => {
    expect(estimateTokens("")).toBe(0);
    expect(estimateTokens("abcd")).toBe(1);
    expect(estimateTokens("abcde")).toBe(2);
  });
});

describe("normalizeTurns", () => {
  it("une turnos seguidos del mismo rol y quita los vacíos", () => {
    expect(normalizeTurns([u("hola"), u("  "), u("¿y?"), a("dígame"), a("pues")])).toEqual([u("hola\n\n¿y?"), a("dígame\n\npues")]);
  });
  it("no modifica los objetos de entrada", () => {
    const input = [u("uno"), u("dos")];
    normalizeTurns(input);
    expect(input[0].content).toBe("uno");
  });
});

describe("trimHistory", () => {
  it("deja todo si cabe", () => {
    const h = [u("a"), a("b"), u("c"), a("d")];
    expect(trimHistory(h, 100)).toEqual(h);
  });
  it("se queda con lo más reciente que cabe en el presupuesto", () => {
    const h = [u("x".repeat(400)), a("y".repeat(400)), u("z".repeat(40)), a("w".repeat(40))];
    // 100 + 100 + 10 + 10 tokens; con 30 solo caben los dos últimos
    expect(trimHistory(h, 30)).toEqual([u("z".repeat(40)), a("w".repeat(40))]);
  });
  it("siempre empieza por un turno de la persona", () => {
    const h = [u("x".repeat(400)), a("y".repeat(40)), u("z"), a("w")];
    const out = trimHistory(h, 15);
    expect(out[0].role).toBe("user");
    expect(out).toEqual([u("z"), a("w")]);
  });
  it("presupuesto cero o historial vacío → nada", () => {
    expect(trimHistory([u("hola"), a("qué más")], 0)).toEqual([]);
    expect(trimHistory([], 100)).toEqual([]);
  });
});

describe("buildChatMessages", () => {
  it("agrega la pregunta al final", () => {
    expect(buildChatMessages([u("a"), a("b")], "  ¿c?  ")).toEqual([u("a"), a("b"), u("¿c?")]);
  });
  it("sin historial, solo la pregunta", () => {
    expect(buildChatMessages([], "hola")).toEqual([u("hola")]);
  });
  it("si el historial termina en la persona (respuesta fallida), une las preguntas", () => {
    const out = buildChatMessages([u("a"), a("b"), u("sin respuesta")], "otra");
    expect(out).toEqual([u("a"), a("b"), u("sin respuesta\n\notra")]);
    expect(out[out.length - 1].role).toBe("user");
  });
  it("alterna roles y empieza por la persona aunque el historial empiece por la Tía", () => {
    const out = buildChatMessages([a("hola, soy la Tía"), u("a"), a("b")], "c");
    expect(out[0].role).toBe("user");
    for (let i = 1; i < out.length; i++) expect(out[i].role).not.toBe(out[i - 1].role);
  });
});

describe("splitStreamError", () => {
  it("sin marca, todo es texto", () => {
    expect(splitStreamError("Hola, pues")).toEqual({ text: "Hola, pues", error: null });
  });
  it("separa el error del texto parcial", () => {
    expect(splitStreamError(`Va bien la \n${CHAT_STREAM_ERROR}La Tía está ocupada.`)).toEqual({ text: "Va bien la", error: "La Tía está ocupada." });
  });
  it("marca sin mensaje → mensaje por defecto", () => {
    expect(splitStreamError(CHAT_STREAM_ERROR).error).toMatch(/no pudo terminar/);
  });
});

describe("quotaLabel", () => {
  it("dice cuántas preguntas quedan", () => {
    expect(quotaLabel(null)).toBeNull();
    expect(quotaLabel(0)).toMatch(/ya no/);
    expect(quotaLabel(1)).toBe("Le queda 1 pregunta hoy.");
    expect(quotaLabel(12)).toBe("Le quedan 12 preguntas hoy.");
  });
});

describe("CHAT_SUGGESTIONS", () => {
  it("son cuatro y de usted (sin voseo)", () => {
    expect(CHAT_SUGGESTIONS).toHaveLength(4);
    for (const s of CHAT_SUGGESTIONS) expect(s).not.toMatch(/\b(vos|parce)\b/i);
  });
});
