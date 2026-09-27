import { describe, expect, it } from "vitest";
import { suggestChecklist } from "./checklist-suggestions";

describe("suggestChecklist", () => {
  it("Meta sugiere píxel y CAPI (Lead, Purchase) y la conversación iniciada, más GTM", () => {
    const s = suggestChecklist([{ name: "Meta Ads" }]);
    expect(s.map((x) => `${x.platform}:${x.event_name}`)).toEqual([
      "pixel:Lead",
      "capi:Lead",
      "pixel:Purchase",
      "capi:Purchase",
      "other:Conversación iniciada",
      "gtm:Etiquetas del piloto publicadas",
    ]);
  });

  it("Google sugiere los eventos de GA4; el proveedor también cuenta", () => {
    const s = suggestChecklist([{ name: "Búsqueda", provider: "Google" }]);
    expect(s.map((x) => x.event_name)).toEqual(["generate_lead", "purchase", "Etiquetas del piloto publicadas"]);
  });

  it("sin medios conocidos queda solo la revisión de GTM", () => {
    expect(suggestChecklist([{ name: "Radio local" }]).map((x) => x.platform)).toEqual(["gtm"]);
    expect(suggestChecklist([])).toHaveLength(1);
  });

  it("no repite lo que ya está (sin importar mayúsculas ni tildes)", () => {
    const s = suggestChecklist(
      [{ name: "WhatsApp" }, { name: "Instagram" }],
      [
        { platform: "pixel", event_name: "lead" },
        { platform: "other", event_name: "Conversacion iniciada" },
      ],
    );
    expect(s.some((x) => x.platform === "pixel" && x.event_name === "Lead")).toBe(false);
    expect(s.some((x) => x.event_name === "Conversación iniciada")).toBe(false);
    expect(s.filter((x) => x.platform === "capi")).toHaveLength(2);
  });
});
