import { describe, expect, it } from "vitest";
import {
  buildDigest,
  escapeHtml,
  hasDigestMaterial,
  pilotsEndingThisWeek,
  programDigestFacts,
  renderDigestHtml,
  renderDigestText,
  type DigestExperimentInput,
} from "./digest";

const TODAY = "2026-09-28"; // lunes
const program = { id: "p1", name: "Programa <Uno>", start_date: "2026-08-01" };
const horizons = [{ id: "h1", name: "H1", start_date: "2026-08-01", end_date: "2027-01-24" }];

const exp = (over: Partial<DigestExperimentInput>): DigestExperimentInput => ({
  id: "e",
  title: "Ejercicio",
  line_name: "Pospago",
  owner_id: "u1",
  status: "in_test",
  status_changed_at: "2026-09-01T00:00:00Z",
  actual_start: "2026-09-01",
  min_duration_days: 14,
  ...over,
});

function facts(role: "owner" | "collaborator" | "viewer" | "agency" | "admin", userId = "u1") {
  return programDigestFacts({
    program,
    role,
    userId,
    today: TODAY,
    metrics: [
      { id: "m1", name: "Altas" },
      { id: "m2", name: "Visitas" },
    ],
    loadedLastWeek: new Set(["m1"]),
    experiments: [
      exp({ id: "ready-mine" }),
      exp({ id: "ready-other", owner_id: "u2" }),
      exp({ id: "running", actual_start: "2026-09-25" }),
      exp({ id: "stale", status: "idea", status_changed_at: "2026-08-01T00:00:00Z" }),
    ],
    northStars: [
      {
        metric_id: "ns",
        metric_name: "Altas digitales",
        line_id: "l1",
        line_name: "Pospago",
        direction: "up",
        baseline: 100,
        targets: [{ horizon_id: "h1", target: 200 }],
        values: [{ week_start: "2026-09-21", value: 90 }],
      },
    ],
    horizons,
  });
}

describe("programDigestFacts", () => {
  it("owner: todo lo del programa", () => {
    const f = facts("owner");
    expect(f.loadWeek).toBe("2026-09-21");
    expect(f.pendingLoad).toEqual(["Visitas"]);
    expect(f.readyToRead.map((e) => e.id).sort()).toEqual(["ready-mine", "ready-other"]);
    expect(f.staleIdeas).toBe(1);
    expect(f.northStarsBehind).toHaveLength(1);
    expect(f.northStarsBehind[0].status).toBe("off_track");
    expect(hasDigestMaterial(f)).toBe(true);
  });
  it("colaborador: solo sus listos para leer", () => {
    expect(facts("collaborator").readyToRead.map((e) => e.id)).toEqual(["ready-mine"]);
  });
  it("lector: sin carga ni ideas quietas, sí la métrica norte", () => {
    const f = facts("viewer", "u9");
    expect(f.pendingLoad).toEqual([]);
    expect(f.staleIdeas).toBe(0);
    expect(f.readyToRead).toEqual([]);
    expect(f.northStarsBehind).toHaveLength(1);
  });
});

describe("pilotsEndingThisWeek", () => {
  it("en prueba y con fin entre hoy y el domingo", () => {
    const pilots = [
      { id: "a", status: "in_test", planned_end: "2026-10-02" },
      { id: "b", status: "in_test", planned_end: "2026-10-05" },
      { id: "c", status: "approved", planned_end: "2026-10-01" },
      { id: "d", status: "in_test", planned_end: "2026-09-27" },
      { id: "e", status: "in_test", planned_end: null },
    ];
    expect(pilotsEndingThisWeek(pilots, TODAY).map((p) => p.id)).toEqual(["a"]);
  });
});

describe("buildDigest", () => {
  it("null cuando no hay nada que contar", () => {
    expect(buildDigest({ userName: "Ana", today: TODAY, siteUrl: "https://x.test", programs: [], pilots: [] })).toBeNull();
  });

  it("arma secciones con enlaces absolutos y escapa el HTML", () => {
    const d = buildDigest({
      userName: "Ana María Pérez",
      today: TODAY,
      siteUrl: "https://x.test/",
      programs: [facts("owner")],
      pilots: [{ id: "pl1", name: "Piloto Meta", planned_end: "2026-10-02" }],
    })!;
    expect(d.greeting).toBe("Buenos días, Ana");
    expect(d.total).toBe(6);
    expect(d.sections.map((s) => s.key)).toEqual(["ready", "north", "load", "pilots", "stale"]);
    const load = d.sections.find((s) => s.key === "load")!.items[0];
    expect(load.href).toBe("https://x.test/programas/p1/carga?semana=2026-09-21");
    expect(d.sections.find((s) => s.key === "pilots")!.items[0].href).toBe("https://x.test/pilotos/pl1");
    expect(d.subject).toMatch(/6 cosas por mirar/);

    const html = renderDigestHtml(d);
    expect(html).toContain("Resumen semanal");
    expect(html).toContain("https://x.test/programas/p1/ejercicios/ready-mine");
    expect(html).not.toContain("<Uno>");
    const text = renderDigestText(d);
    expect(text).toContain("LISTOS PARA LEER (2)");
    expect(text).toContain("https://x.test/programas");
  });

  it("con varios programas antepone el nombre del programa", () => {
    const a = facts("owner");
    const b = { ...facts("owner"), id: "p2", name: "Otro" };
    const d = buildDigest({ userName: "", today: TODAY, siteUrl: "https://x.test", programs: [a, b], pilots: [] })!;
    expect(d.greeting).toBe("Buenos días");
    expect(d.sections[0].items.some((i) => i.text.startsWith("Otro · "))).toBe(true);
  });
});

describe("escapeHtml", () => {
  it("escapa lo peligroso", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
  });
});
