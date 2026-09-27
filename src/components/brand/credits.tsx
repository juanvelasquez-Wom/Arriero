import { cn } from "@/lib/utils";

export const AUTHOR = {
  name: "Juan David Velásquez",
  team: "Canales Remotos",
  email: "juan.velasquez@movilpt.co",
} as const;

/** Créditos de la app: quién la hizo y cómo escribirle. */
export function Credits({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <p className={cn("text-[11px] leading-relaxed", tone === "dark" ? "text-[#f6f6f4]/55" : "text-soft", className)}>
      Hecha con cariño (y mucho tinto) por <span className="font-semibold">{AUTHOR.name}</span> · {AUTHOR.team}
      <br />
      <a href={`mailto:${AUTHOR.email}`} className="underline-offset-2 hover:underline">
        {AUTHOR.email}
      </a>
    </p>
  );
}
