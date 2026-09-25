import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { summarizeResults } from "@/domain/dashboards";
import type { Variant } from "@/domain/types";
import { deleteDemoProgram, findDemoProgramId, loadDemoProgram } from "@/server/demo/loader";
import { adminClient, cleanup, createTestUser, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
let A: TestUser;
let preexisting = false;

beforeAll(async () => {
  // Si ya hay un programa de ejemplo (cargado por una persona), no lo tocamos.
  preexisting = !!(await findDemoProgramId(admin));
  A = await createTestUser(admin, "demo-admin", { isAdmin: true });
  users.push(A);
});

afterAll(async () => {
  if (!preexisting) await deleteDemoProgram(admin);
  await cleanup(admin, [], users);
});

const TABLES = [
  "program_horizons",
  "program_members",
  "calendar_events",
  "business_lines",
  "metrics",
  "metric_targets",
  "metric_values",
  "funnel_stages",
  "problems",
  "experiments",
  "experiment_variants",
  "learnings",
  "attachments",
  "activity_log",
  "trash_items",
];

describe("programa de ejemplo", () => {
  it("carga tres ejercicios en sus estados, win rate 50% y se borra sin dejar nada", async (ctx) => {
    if (preexisting) ctx.skip();

    const programId = await loadDemoProgram(A.client, admin, A.id);
    const { data: program } = await A.client.from("programs").select("name, is_demo").eq("id", programId).single();
    expect(program).toMatchObject({ name: "Programa demo · Telco Andina", is_demo: true });

    const { data: exps } = await A.client.from("experiments").select("id, title, status, verdict, decision, final_score, design_locked_at").eq("program_id", programId);
    expect(exps).toHaveLength(3);
    const byTitle = Object.fromEntries(exps!.map((e) => [e.title as string, e]));
    expect(byTitle["Recordatorio de recarga con paquete sugerido por WhatsApp"]).toMatchObject({ status: "scaled", verdict: "winner", decision: "scale" });
    expect(Number(byTitle["Recordatorio de recarga con paquete sugerido por WhatsApp"].final_score)).toBe(8.7);
    expect(byTitle["Rotación de creativos en video vertical testimonial"]).toMatchObject({ status: "in_test" });
    expect(byTitle["Rotación de creativos en video vertical testimonial"].design_locked_at).toMatch(/^2026-10-05/);
    expect(byTitle["Precio en cuotas mensuales en la ficha del equipo"]).toMatchObject({ status: "decided", verdict: "loser", decision: "kill" });

    const { data: variants } = await A.client
      .from("experiment_variants")
      .select("id, experiment_id, name, is_control, sample, conversions, metric_value")
      .eq("program_id", programId);
    const summary = summarizeResults(
      exps!.map((e) => ({
        id: e.id,
        status: e.status,
        verdict: e.verdict,
        decision: e.decision,
        variants: variants!
          .filter((v) => v.experiment_id === e.id)
          .map((v) => ({ ...v, sample: v.sample == null ? null : Number(v.sample), conversions: v.conversions == null ? null : Number(v.conversions) })) as Variant[],
      })),
    );
    expect(summary.closed).toBe(2);
    expect(summary.winRate).toBe(0.5);
    expect(Math.round(summary.avgWinnerDiff! * 1000) / 10).toBe(27.8);

    const { data: learnings } = await A.client.from("learnings").select("id").eq("program_id", programId);
    expect(learnings).toHaveLength(2);
    const { data: values } = await A.client.from("metric_values").select("id").eq("program_id", programId);
    expect(values!.length).toBe(7 * 12);

    // Un adjunto real para comprobar que Storage también queda limpio.
    const exp = exps![0];
    const path = `${programId}/experiment/${exp.id}/${crypto.randomUUID()}-prueba.csv`;
    const up = await admin.storage.from("attachments").upload(path, new Blob(["a,b\n1,2\n"], { type: "text/csv" }), { contentType: "text/csv" });
    expect(up.error).toBeNull();
    await admin.from("attachments").insert({
      program_id: programId,
      entity_type: "experiment",
      experiment_id: exp.id,
      storage_path: path,
      name: "prueba.csv",
      mime_type: "text/csv",
      size_bytes: 8,
    });

    // Un segundo ejemplo no se permite.
    await expect(loadDemoProgram(A.client, admin, A.id)).rejects.toThrow(/ya existe/);

    const { data: members } = await admin.from("program_members").select("user_id").eq("program_id", programId);
    expect(await deleteDemoProgram(admin)).toBe(true);

    expect(await findDemoProgramId(admin)).toBeNull();
    for (const table of TABLES) {
      const { data } = await admin.from(table).select("id").eq("program_id", programId);
      expect(data, table).toEqual([]);
    }
    const { data: files } = await admin.storage.from("attachments").list(`${programId}/experiment/${exp.id}`);
    expect(files ?? []).toEqual([]);
    const { data: queue } = await admin.from("storage_deletion_queue").select("id").like("storage_path", `${programId}/%`);
    expect(queue).toEqual([]);
    // Los usuarios ficticios también se borran (el admin real no).
    for (const m of members!) {
      const { data } = await admin.auth.admin.getUserById(m.user_id);
      if (m.user_id === A.id) expect(data.user).not.toBeNull();
      else expect(data.user).toBeNull();
    }
  });
});
