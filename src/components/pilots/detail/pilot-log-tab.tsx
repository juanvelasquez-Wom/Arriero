import { Ban, CheckCheck, FlaskConical, Gavel, History, RotateCcw, ScanSearch, Send, Trash2, Undo2, type LucideIcon } from "lucide-react";
import { Section } from "@/components/app/page";
import { formatDateTime } from "@/domain/format";
import { AUDIT_OP_LABEL, AUDIT_TABLE_LABEL, auditChanges } from "@/domain/pilots/audit-labels";
import type { PilotCatalogs, PilotDetail, ReviewRow } from "@/server/queries/pilots";
import { loadPeople, loadPilotAudit } from "@/server/queries/pilots";

const REVIEW: Record<ReviewRow["action"], { label: string; icon: LucideIcon }> = {
  submitted: { label: "Envió a revisión", icon: Send },
  returned: { label: "Devolvió a borrador", icon: Undo2 },
  approved: { label: "Aprobó y bloqueó el diseño", icon: CheckCheck },
  started: { label: "Lanzó el piloto", icon: FlaskConical },
  to_reading: { label: "Pasó a lectura", icon: ScanSearch },
  decided: { label: "Firmó la decisión", icon: Gavel },
  cancelled: { label: "Canceló el piloto", icon: Ban },
  deleted: { label: "Borró el piloto", icon: Trash2 },
  restored: { label: "Restauró el piloto", icon: RotateCcw },
};

/** Bitácora: línea de tiempo del flujo y auditoría de cada cambio con su valor anterior. */
export async function PilotLogTab({ detail, catalogs }: { detail: PilotDetail; catalogs: PilotCatalogs }) {
  const audit = await loadPilotAudit(detail.pilot.id, 300);
  const people = { ...detail.people, ...(await loadPeople(audit.map((a) => a.actor_id))) };
  const names: Record<string, string> = {
    ...people,
    ...Object.fromEntries(catalogs.metrics.map((m) => [m.id, m.name])),
    ...Object.fromEntries(catalogs.media.map((m) => [m.id, m.name])),
    ...Object.fromEntries(catalogs.variables.map((v) => [v.id, v.name])),
    ...Object.fromEntries(detail.arms.map((a) => [a.id, a.name])),
  };
  const reviews = [...detail.reviews].reverse();

  return (
    <div className="space-y-6">
      <Section title="Línea de tiempo" description="Cada paso del flujo, con quién lo dio.">
        {reviews.length ? (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {reviews.map((r) => {
              const { label, icon: Icon } = REVIEW[r.action];
              return (
                <li key={r.id} className="relative">
                  <span className="absolute top-0.5 -left-[1.95rem] flex size-6 items-center justify-center rounded-full border bg-paper">
                    <Icon aria-hidden className="size-3.5" />
                  </span>
                  <div className="text-sm">
                    <span className="font-medium">{r.actor_id ? (people[r.actor_id] ?? "Alguien") : "Arriero"}</span> {label.toLowerCase()}
                  </div>
                  <div className="text-xs text-soft">{formatDateTime(r.created_at)}</div>
                  {r.comment ? <p className="mt-1 rounded-lg bg-wash px-2.5 py-1.5 text-sm">{r.comment}</p> : null}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-sm text-soft">Todavía no ha pasado nada: el piloto está en borrador.</p>
        )}
      </Section>

      <Section
        title={
          <span className="inline-flex items-center gap-1.5">
            <History aria-hidden className="size-4" /> Auditoría
          </span>
        }
        description="Quién cambió qué, cuándo y cuál era el valor anterior. Solo la escriben los triggers de la base."
      >
        {audit.length ? (
          <ul className="divide-y">
            {audit.map((a) => {
              const changes = auditChanges(a, { names, table: a.table_name });
              return (
                <li key={a.id} className="py-3">
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{a.actor_id ? (people[a.actor_id] ?? "Alguien") : "Arriero"}</span>
                    <span className="text-soft">
                      {AUDIT_OP_LABEL[a.op] ?? a.op} · {AUDIT_TABLE_LABEL[a.table_name] ?? a.table_name}
                    </span>
                    <span className="ml-auto text-xs text-soft">{formatDateTime(a.changed_at)}</span>
                  </div>
                  {changes.length ? (
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {changes.slice(0, 12).map((c) => (
                        <li key={c.field} className="break-words">
                          <span className="text-soft">{c.label}:</span>{" "}
                          {a.op === "update" ? (
                            <>
                              <span className="line-through decoration-gray-3">{c.before}</span> → <span className="font-medium">{c.after}</span>
                            </>
                          ) : (
                            <span>{a.op === "delete" ? c.before : c.after}</span>
                          )}
                        </li>
                      ))}
                      {changes.length > 12 ? <li className="text-soft">…y {changes.length - 12} campo(s) más.</li> : null}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-soft">Sin cambios registrados todavía.</p>
        )}
        {audit.length >= 300 ? <p className="mt-2 text-xs text-soft">Se muestran los últimos 300 cambios.</p> : null}
      </Section>
    </div>
  );
}
