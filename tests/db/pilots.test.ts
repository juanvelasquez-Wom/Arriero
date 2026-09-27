// Pilotos de medios contra Supabase: roles, RLS, bloqueo del diseño, flujo y ejemplos.
// Se salta si la migración 012 todavía no está aplicada en el proyecto.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { countExamplePilots, loadExamplePilots } from "@/server/demo/pilots";
import { adminClient, cleanup, createTestUser, unwrap, type TestUser } from "./helpers";

const admin = adminClient();
const users: TestUser[] = [];
let ready = false;
let approver: TestUser;
let creator: TestUser;
let reader: TestUser;
let outsider: TestUser;
const pilotIds: string[] = [];
let examplesBefore = 0;

beforeAll(async () => {
  const { error } = await admin.from("pilots").select("id").limit(1);
  ready = !error;
  if (!ready) return;
  examplesBefore = await countExamplePilots(admin);
  approver = await createTestUser(admin, "pil-approver");
  creator = await createTestUser(admin, "pil-creator");
  reader = await createTestUser(admin, "pil-reader");
  outsider = await createTestUser(admin, "pil-outsider");
  users.push(approver, creator, reader, outsider);
  unwrap(
    await admin.from("pilot_roles").insert([
      { user_id: approver.id, role: "approver" },
      { user_id: creator.id, role: "creator" },
      { user_id: reader.id, role: "reader" },
    ]),
    "roles",
  );
});

afterAll(async () => {
  if (!ready) return;
  if (pilotIds.length) {
    await admin.from("pilots").delete().in("id", pilotIds);
    await admin.from("pilot_audit").delete().in("pilot_id", pilotIds);
    await admin.from("media_channels").delete().like("name", "Pantallas test %");
  }
  await cleanup(admin, [], users);
});

const id = async (table: string, name: string) =>
  (unwrap(await admin.from(table).select("id").eq("name", name).limit(1).single(), table) as { id: string }).id;

describe("pilotos de medios", () => {
  it("lector ve pero no escribe; sin rol no ve nada", async (ctx) => {
    if (!ready) ctx.skip();
    const { data: seen } = await reader.client.from("pilot_metrics").select("id");
    expect(seen!.length).toBeGreaterThan(5);
    const { data: none } = await outsider.client.from("pilot_metrics").select("id");
    expect(none).toEqual([]);
    const { error } = await reader.client.from("pilots").insert({ title: "No debería" });
    expect(error).not.toBeNull();
  });

  it("recorre el flujo completo solo con datos manuales y bloquea el diseño", async (ctx) => {
    if (!ready) ctx.skip();
    const c = creator.client;
    const pilot = unwrap(await c.from("pilots").insert({ title: "Test DOOH Medellín", problem: "No sabemos si el DOOH trae ventas" }).select("id").single(), "pilot") as { id: string };
    pilotIds.push(pilot.id);

    // Medio nuevo creado escribiendo su nombre + métrica propia del medio.
    const media = unwrap(await c.from("media_channels").insert({ name: `Pantallas test ${pilot.id.slice(0, 6)}` }).select("id").single(), "media") as { id: string };
    const ventas = await id("pilot_metrics", "Ventas");
    const cpa = await id("pilot_metrics", "Costo por venta (CPA)");
    const variable = await id("pilot_variables", "Distribución geográfica");

    unwrap(
      await c
        .from("pilots")
        .update({
          hypothesis_change: "pantallas DOOH",
          hypothesis_scope: "Medellín",
          hypothesis_metric: "las ventas",
          hypothesis_expected_pct: 8,
          hypothesis_reason: "recordación",
          variable_id: variable,
          test_type: "geo",
          primary_metric_id: ventas,
          power_inputs: { baseline: 100, planned_days: 28 },
          power_result: { mde_pct: 7, days_needed: 20, budget_days: null, warnings: [] },
          decision_rules: { scale_min_probability: 0.9, scale_min_lift_pct: 0, kill_max_probability: 0.2, guardrails_block_scale: true },
          planned_start: "2026-10-05",
          planned_end: "2026-11-01",
        })
        .eq("id", pilot.id),
      "design",
    );
    const arms = unwrap(
      await c
        .from("pilot_arms")
        .insert([
          { pilot_id: pilot.id, name: "Prueba", is_control: false, cities: ["Medellín"] },
          { pilot_id: pilot.id, name: "Control", is_control: true, cities: ["Cali", "Barranquilla"] },
        ])
        .select("id, is_control"),
      "arms",
    ) as { id: string; is_control: boolean }[];
    unwrap(await c.from("pilot_guardrails").insert({ pilot_id: pilot.id, metric_id: cpa, limit_pct: 20 }), "guardrail");
    unwrap(await c.from("pilot_media").insert({ pilot_id: pilot.id, media_id: media.id, cities: ["Medellín"] }), "pilot_media");
    unwrap(await c.from("pilot_checklist_items").insert({ pilot_id: pilot.id, platform: "other", event_name: "Códigos redimidos" }), "checklist");

    expect(unwrap(await c.rpc("pilot_missing", { p_pilot: pilot.id }), "missing")).toEqual([]);
    unwrap(await c.rpc("pilot_submit", { p_pilot: pilot.id }), "submit");
    const { error: selfApprove } = await c.rpc("pilot_approve", { p_pilot: pilot.id });
    expect(selfApprove?.message).toMatch(/aprobador/);
    unwrap(await approver.client.rpc("pilot_approve", { p_pilot: pilot.id }), "approve");

    const { error: locked } = await c.from("pilots").update({ hypothesis_expected_pct: 30 }).eq("id", pilot.id);
    expect(locked?.message).toMatch(/bloqueado/);
    const { error: lockedArm } = await c.from("pilot_arms").update({ cities: ["Bogotá"] }).eq("id", arms[0].id);
    expect(lockedArm?.message).toMatch(/bloqueado/);

    unwrap(await c.from("pilot_checklist_items").update({ status: "ok" }).eq("pilot_id", pilot.id), "check ok");
    unwrap(await c.rpc("pilot_start", { p_pilot: pilot.id, p_start: "2026-10-05" }), "start");
    unwrap(
      await c.from("pilot_measurements").insert(
        arms.map((a) => ({ arm_id: a.id, metric_id: ventas, unit_label: a.is_control ? "Cali" : "Medellín", period_start: "2026-10-05", value: 50 })),
      ),
      "measurements",
    );
    await reader.client.from("pilot_measurements").update({ value: 1 }).eq("pilot_id", pilot.id).select("id");
    const { data: after } = await admin.from("pilot_measurements").select("value").eq("pilot_id", pilot.id);
    expect(after!.every((m) => Number(m.value) === 50)).toBe(true);

    unwrap(await c.from("pilot_incidents").insert({ pilot_id: pilot.id, description: "Se apagó una pantalla un día" }), "incident");
    unwrap(await c.rpc("pilot_to_reading", { p_pilot: pilot.id, p_end: "2026-11-01" }), "to reading");
    unwrap(
      await approver.client.rpc("pilot_decide", {
        p_pilot: pilot.id,
        p_verdict: "inconclusive",
        p_decision: "adjust",
        p_justification: "Pocas ciudades de control",
        p_learning: "Con dos ciudades de control el DOOH no se lee: sumar más ciudades.",
      }),
      "decide",
    );
    const { data: learning } = await reader.client.from("pilot_learnings").select("text").eq("pilot_id", pilot.id).single();
    expect(learning!.text).toMatch(/DOOH/);
    const { data: audit } = await reader.client.from("pilot_audit").select("table_name, op").eq("pilot_id", pilot.id);
    expect(audit!.length).toBeGreaterThan(5);
  });

  it("carga y borra los ejemplos", async (ctx) => {
    if (!ready || examplesBefore > 0) ctx.skip();
    const created = await loadExamplePilots(admin, approver.id);
    expect(created).toBe(3);
    const { data: list } = await reader.client.from("pilots").select("title, status, is_example").eq("is_example", true);
    expect(list!.map((p) => p.status).sort()).toEqual(["decided", "in_reading", "in_test"]);
    const { error: notAllowed } = await creator.client.rpc("delete_example_pilots");
    expect(notAllowed).not.toBeNull();
    const deleted = unwrap(await approver.client.rpc("delete_example_pilots"), "delete examples");
    expect(Number(deleted)).toBe(3);
    expect(await countExamplePilots(admin)).toBe(0);
  });
});
