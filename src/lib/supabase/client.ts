"use client";

import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | null = null;

/**
 * Cliente de navegador (llave publicable, respeta RLS). Se usa solo para lo que
 * necesita el navegador: subir archivos a Storage, Realtime y confirmar enlaces
 * de correo. Las escrituras de datos van por server actions.
 */
export function createClient() {
  if (!client) {
    client = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    );
  }
  return client;
}
