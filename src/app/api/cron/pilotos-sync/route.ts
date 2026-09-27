import { NextResponse, type NextRequest } from "next/server";
import { mcpEnabled } from "@/server/integrations/mcp";

// Sync diario de los pilotos En prueba con medios conectados (Vercel Cron).
// APAGADO: mientras PILOTS_MCP_ENABLED no sea "true", responde sin hacer nada y
// sin llamar a Claude. Cuando se prenda, aquí se recorren los pilotos en prueba
// y se llama a extractWithMcp por conexión (ver docs/pilotos/integraciones.md).
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!mcpEnabled()) return NextResponse.json({ skipped: "Integraciones apagadas: todo sigue en modo manual." });
  return NextResponse.json({ skipped: "Sync por MCP preparado; falta conectar la primera cuenta (fase de integraciones)." });
}
