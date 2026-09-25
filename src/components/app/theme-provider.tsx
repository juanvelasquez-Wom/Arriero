"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";
import type { ComponentProps } from "react";

// React advierte en desarrollo cuando un componente del cliente renderiza un
// <script>. Patrón de la guía "Preventing flash before hydration" de Next 16:
// el script se ejecuta desde el HTML del servidor y en el cliente queda inerte.
const scriptProps = { type: typeof window === "undefined" ? "text/javascript" : "text/plain" };

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider scriptProps={scriptProps} {...props} />;
}
