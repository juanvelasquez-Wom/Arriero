import { describe, expect, it } from "vitest";
import {
  INTEGRATION_PROVIDERS,
  READ_ONLY_TOOLS,
  allowedTools,
  buildMcpRequest,
  cleanJsonText,
  isWriteTool,
  readMcpReply,
  validateExtraction,
} from "./integrations";

describe("integraciones por MCP", () => {
  it("las listas blancas son solo de lectura", () => {
    for (const p of INTEGRATION_PROVIDERS) for (const t of READ_ONLY_TOOLS[p]) expect(isWriteTool(t)).toBe(false);
    expect(isWriteTool("ads_create_campaign")).toBe(true);
    expect(isWriteTool("ads_update_entity")).toBe(true);
    expect(isWriteTool("publish_container")).toBe(true);
  });

  it("arma la petición con todo apagado salvo la lista blanca", () => {
    const body = buildMcpRequest({
      model: "claude-sonnet-5",
      server: { provider: "meta", url: "https://mcp.facebook.com/ads", token: "t" },
      system: "s",
      prompt: "p",
    });
    expect(body.mcp_servers[0]).toEqual({ type: "url", url: "https://mcp.facebook.com/ads", name: "meta", authorization_token: "t" });
    expect(body.tools[0].default_config).toEqual({ enabled: false });
    expect(Object.keys(body.tools[0].configs)).toEqual(allowedTools("meta"));
    expect(body.temperature).toBe(0);
  });

  it("TikTok queda desacoplado: sin herramientas no hay petición", () => {
    expect(() => buildMcpRequest({ model: "m", server: { provider: "tiktok", url: "https://x", token: "t" }, system: "", prompt: "" })).toThrow();
  });

  it("separa texto, llamadas y resultados crudos, y detecta intentos de escritura", () => {
    const r = readMcpReply([
      { type: "mcp_tool_use", id: "u1", name: "ads_insights_performance_trend", input: { a: 1 } },
      { type: "mcp_tool_result", tool_use_id: "u1", content: [{ type: "text", text: "{}" }] },
      { type: "mcp_tool_use", id: "u2", name: "ads_update_entity", input: {} },
      { type: "text", text: '{"ok":1}' },
    ]);
    expect(r.toolCalls).toHaveLength(2);
    expect(r.toolResults[0]).toEqual({ tool_use_id: "u1", is_error: false, content: [{ type: "text", text: "{}" }] });
    expect(r.writeAttempts).toEqual(["ads_update_entity"]);
    expect(r.text).toBe('{"ok":1}');
  });

  it("limpia cercas de código y valida el esquema", () => {
    expect(cleanJsonText('Aquí va:\n```json\n{"a":1}\n```')).toBe('{"a":1}');
    const good = validateExtraction(
      '```json\n{"account":"act_1","date_from":"2026-10-01","date_to":"2026-10-02","rows":[{"date":"2026-10-01","entity":"CTWA","metric":"spend","value":1200}]}\n```',
    );
    expect(good.ok).toBe(true);
    const bad = validateExtraction('{"account":"act_1","date_from":"2026-10-01","date_to":"2026-10-02","rows":[{"date":"ayer","entity":"x","metric":"spend","value":-1}]}');
    expect(bad.ok).toBe(false);
    expect(validateExtraction("no hay json").ok).toBe(false);
  });
});
