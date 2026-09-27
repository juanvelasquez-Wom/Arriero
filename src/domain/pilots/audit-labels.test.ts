import { describe, expect, it } from "vitest";
import { AUDIT_TABLE_LABEL, auditChanges, auditFieldLabel, formatAuditValue } from "./audit-labels";

describe("audit-labels", () => {
  it("nombra tablas y campos en español", () => {
    expect(AUDIT_TABLE_LABEL.pilot_checklist_items).toBe("Lista de chequeo");
    expect(auditFieldLabel("planned_budget_cop")).toBe("Presupuesto (COP)");
    expect(auditFieldLabel("campo_raro")).toBe("campo raro");
  });

  it("lee valores: enums, booleanos, nombres, listas y vacíos", () => {
    expect(formatAuditValue("status", "in_test")).toBe("En prueba");
    expect(formatAuditValue("status", "ok", { table: "pilot_checklist_items" })).toBe("Dispara bien");
    expect(formatAuditValue("test_type", "pre_post")).toBe("Antes / después");
    expect(formatAuditValue("is_control", true)).toBe("Sí");
    expect(formatAuditValue("owner_id", "u1", { names: { u1: "Ana" } })).toBe("Ana");
    expect(formatAuditValue("cities", ["Cali", "Medellín"])).toBe("Cali, Medellín");
    expect(formatAuditValue("value", 1250000.5)).toBe("1.250.000,5");
    expect(formatAuditValue("note", null)).toBe("—");
    expect(formatAuditValue("cities", [])).toBe("—");
  });

  it("un update muestra antes → después sin campos técnicos", () => {
    const changes = auditChanges({
      op: "update",
      old_data: { status: "draft", updated_at: "x" },
      new_data: { status: "in_review", updated_at: "y" },
    });
    expect(changes).toEqual([{ field: "status", label: "Estado", before: "Borrador", after: "En revisión" }]);
  });

  it("un insert muestra solo lo que tiene valor", () => {
    const changes = auditChanges({
      op: "insert",
      old_data: null,
      new_data: { id: "1", pilot_id: "p", occurred_on: "2026-10-01", description: "Se cayó la landing", expected_impact: "high", note: null },
    });
    expect(changes.map((c) => `${c.label}: ${c.after}`)).toEqual(["Fecha: 2026-10-01", "Descripción: Se cayó la landing", "Impacto esperado: Alto"]);
    expect(changes.every((c) => c.before === "—")).toBe(true);
  });
});
