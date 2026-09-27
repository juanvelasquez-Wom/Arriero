import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Selector de dos o más opciones como enlaces (la opción vive en la URL). */
export function SegmentLinks({
  label,
  options,
}: {
  label: string;
  options: { href: string; label: string; active: boolean; icon?: LucideIcon }[];
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-xl border bg-paper p-0.5 shadow-card">
      {options.map(({ href, label: text, active, icon: Icon }) => (
        <Button key={href} asChild size="sm" variant="ghost" className={cn(active && "bg-gray-1 font-semibold")}>
          <Link href={href} aria-current={active ? "true" : undefined} scroll={false}>
            {Icon ? <Icon aria-hidden /> : null}
            {text}
          </Link>
        </Button>
      ))}
    </div>
  );
}

/** Arma el href conservando los parámetros actuales y cambiando uno. */
export function hrefWith(path: string, current: Record<string, string | string[] | undefined>, key: string, value: string | null): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(current)) {
    const one = Array.isArray(v) ? v[0] : v;
    if (one && k !== key) next.set(k, one);
  }
  if (value) next.set(key, value);
  const s = next.toString();
  return s ? `${path}?${s}` : path;
}
