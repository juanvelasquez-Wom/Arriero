"use client";

import type { EmailOtpType } from "@supabase/supabase-js";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";

function safeNext(next: string | null) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/programas";
}

/**
 * Recibe los enlaces de invitación y de recuperación en cualquiera de sus
 * formatos (token_hash, code PKCE o tokens en el fragmento) y deja la sesión
 * en cookies antes de redirigir.
 */
export function ConfirmClient() {
  const router = useRouter();
  const params = useSearchParams();
  const [message, setMessage] = useState("Validando el enlace…");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    const supabase = createClient();

    async function run() {
      const tokenHash = params.get("token_hash");
      const type = params.get("type") as EmailOtpType | null;
      const code = params.get("code");
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const hashType = hash.get("type");
      let next = safeNext(params.get("next"));
      const isInvite = type === "invite" || hashType === "invite";
      if (isInvite || type === "recovery" || hashType === "recovery") next = "/restablecer";
      if (isInvite) next = "/restablecer?invitacion=1";

      let error: { message: string } | null = null;
      if (tokenHash && type) {
        ({ error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type }));
      } else if (code) {
        ({ error } = await supabase.auth.exchangeCodeForSession(code));
      } else if (hash.get("access_token") && hash.get("refresh_token")) {
        ({ error } = await supabase.auth.setSession({
          access_token: hash.get("access_token")!,
          refresh_token: hash.get("refresh_token")!,
        }));
      } else if (hash.get("error_description")) {
        error = { message: hash.get("error_description")! };
      } else {
        error = { message: "missing" };
      }

      if (error) {
        setMessage("El enlace no es válido o ya venció.");
        router.replace("/login?error=enlace");
        return;
      }
      router.replace(next);
      router.refresh();
    }
    void run();
  }, [params, router]);

  return (
    <>
      <Spinner />
      <span role="status">{message}</span>
    </>
  );
}
