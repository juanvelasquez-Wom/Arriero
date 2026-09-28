import { NextResponse, type NextRequest } from "next/server";
import { addDays, todayIso } from "@/domain/dates";
import { pickConnection, sameAccount } from "@/domain/pilots/extraction-mapping";
import { isCronAuthorized } from "@/lib/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractWithMcp, mcpEnabled, providerReady } from "@/server/integrations/mcp";
import { applyExtractionToPilot, dailySyncRange, metaMediaOf, suggestedMapFor, upsertAdFacts } from "@/server/integrations/pilot-sync";
import { loadPilotCatalogs, loadPilotDetail } from "@/server/queries/pilots";

// Sync diario (Vercel Cron, ver vercel.json). APAGADO mientras PILOTS_MCP_ENABLED
// no sea "true": responde sin llamar a Claude.
// 1. Por cada conexión de Meta conectada: los hechos de ayer por campaña → ad_facts.
// 2. Por cada piloto En prueba con un medio de Meta en esa cuenta: los datos de ayer,
//    con el último mapeo que aplicó una persona (o el sugerido por nombre).
// Acotado: máximo MAX_PILOTS pilotos por corrida y se detiene antes del límite de tiempo.
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_PILOTS = 15;
const TIME_BUDGET_MS = 240_000;

export async function GET(request: NextRequest) {
  if (!isCronAuthorized(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!mcpEnabled() || !providerReady("meta")) return NextResponse.json({ skipped: "Integraciones apagadas: todo sigue en modo manual." });

  const started = Date.now();
  const outOfTime = () => Date.now() - started > TIME_BUDGET_MS;
  const admin = createAdminClient();
  const yesterday = addDays(todayIso(), -1);
  const report = { accounts: 0, adFacts: 0, pilots: 0, measurements: 0, errors: 0, stoppedEarly: false };

  const { data: connections, error } = await admin
    .from("pilot_integration_connections")
    .select("id, provider, account_ref, status")
    .eq("provider", "meta")
    .eq("status", "connected");
  if (error) {
    console.error("[cron] pilotos-sync: conexiones", error.code);
    return NextResponse.json({ error: "No se pudieron leer las conexiones" }, { status: 500 });
  }
  const live = (connections ?? []).filter((c) => !!c.account_ref) as { id: string; provider: string; account_ref: string; status: string }[];

  for (const c of live) {
    if (outOfTime()) {
      report.stoppedEarly = true;
      break;
    }
    const out = await extractWithMcp(admin, {
      pilotId: null,
      connectionId: c.id,
      provider: "meta",
      account: c.account_ref,
      campaigns: [],
      dateFrom: yesterday,
      dateTo: yesterday,
    });
    report.accounts++;
    if (out.status !== "ok" || !out.data) {
      report.errors++;
      continue;
    }
    try {
      report.adFacts += await upsertAdFacts(admin, { connectionId: c.id, provider: "meta", accountRef: c.account_ref, extraction: out.data, snapshotId: out.snapshotId });
    } catch (e) {
      report.errors++;
      console.error("[cron] pilotos-sync: ad_facts", e instanceof Error ? e.message : e);
    }
  }

  // Pilotos en prueba con un medio de Meta en una cuenta conectada.
  if (live.length && !outOfTime()) {
    const { data: pilots } = await admin.from("pilots").select("id").eq("status", "in_test").is("deleted_at", null).limit(MAX_PILOTS);
    const catalogs = await loadPilotCatalogs(admin);
    const integration = new Map(catalogs.media.map((m) => [m.id, m.integration]));
    for (const { id } of pilots ?? []) {
      if (outOfTime()) {
        report.stoppedEarly = true;
        break;
      }
      const detail = await loadPilotDetail(id, admin);
      if (!detail) continue;
      const meta = metaMediaOf(detail, integration);
      if (!meta.length) continue;
      const connection = pickConnection(meta.map((m) => m.account), live);
      if (!connection || !meta.some((m) => !m.account || sameAccount(m.account, connection.account_ref))) continue;
      const range = dailySyncRange(detail);
      if (!range) continue;
      const out = await extractWithMcp(admin, {
        pilotId: id,
        connectionId: connection.id,
        provider: "meta",
        account: connection.account_ref,
        campaigns: [...new Set(meta.map((m) => m.campaign).filter((x): x is string => !!x))],
        dateFrom: range.from,
        dateTo: range.to,
      });
      report.pilots++;
      if (out.status !== "ok" || !out.data || !out.snapshotId) {
        report.errors++;
        continue;
      }
      try {
        const map = await suggestedMapFor(admin, detail, out.data);
        const res = await applyExtractionToPilot(admin, detail, catalogs.metrics, out.data, out.snapshotId, map);
        report.measurements += res.written;
      } catch (e) {
        report.errors++;
        console.error("[cron] pilotos-sync: piloto", id, e instanceof Error ? e.message : e);
      }
    }
  }

  return NextResponse.json(report);
}
