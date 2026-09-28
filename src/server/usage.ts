import "server-only";
import { after } from "next/server";
import { cache } from "react";
import { todayIso } from "@/domain/dates";
import { createClient } from "@/lib/supabase/server";

/** Zonas de la app que cuentan para la adopción (tabla `usage_days`). */
export type UsageArea = "app" | "programas" | "pilotos" | "direccion";

// Lo que ya quedó guardado en esta instancia del servidor (evita repetir el insert
// en cada petición del mismo día). Se vacía al cambiar el día.
let rememberedDay = "";
const remembered = new Set<string>();

// Un lote por petición: los layouts y la página suman su zona y se guarda todo
// con un solo insert después de responder.
const requestBatch = cache(() => ({ areas: new Set<UsageArea>(), scheduled: false }));

/**
 * Registra un día de uso de la persona en una zona. No bloquea el render (se guarda
 * con `after`, cuando la respuesta ya salió) y nunca falla: si la tabla no existe o
 * algo sale mal, se ignora.
 */
export function recordUsage(area: UsageArea, userId: string): void {
  try {
    const day = todayIso();
    if (day !== rememberedDay) {
      rememberedDay = day;
      remembered.clear();
    }
    if (remembered.has(`${userId}:${area}`)) return;
    const batch = requestBatch();
    batch.areas.add(area);
    if (batch.scheduled) return;
    batch.scheduled = true;
    // Las cookies se leen durante el render (dentro de `after` no se puede en server components).
    const client = createClient();
    client.catch(() => {});
    after(async () => {
      try {
        const rows = [...batch.areas].map((a) => ({ user_id: userId, day, area: a }));
        const supabase = await client;
        const { error } = await supabase.from("usage_days").upsert(rows, { onConflict: "user_id,day,area", ignoreDuplicates: true });
        if (!error && day === rememberedDay) for (const r of rows) remembered.add(`${userId}:${r.area}`);
      } catch {
        // La adopción es un dato de apoyo: nunca rompe la navegación.
      }
    });
  } catch {
    // Fuera de una petición (o sin `after` disponible): no se registra.
  }
}
