import Image from "next/image";
import { cn } from "@/lib/utils";

/** La mula de ARRIERO (se invierte sola en modo oscuro). */
export function Mule({ className, decorative = true }: { className?: string; decorative?: boolean }) {
  return (
    <Image
      src="/brand/arriero-mark.png"
      alt={decorative ? "" : "Arriero"}
      aria-hidden={decorative || undefined}
      width={512}
      height={512}
      className={cn("brand-ink h-auto select-none", className)}
      priority={false}
    />
  );
}

/** Marca para el header: mula + nombre. */
export function LogoLockup({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <Mule className="size-8 w-8" />
      <span className="flex flex-col leading-none">
        <span className="font-heading text-[17px] font-extrabold tracking-tight">Arriero</span>
        {compact ? null : <span className="mt-0.5 text-[9px] font-semibold tracking-[0.2em] text-soft uppercase">Growth Engine</span>}
      </span>
    </span>
  );
}

/** Logo completo (mula, montaña y nombre). */
export function LogoFull({ className, onDark = false }: { className?: string; onDark?: boolean }) {
  return (
    <Image
      src="/brand/arriero-logo.png"
      alt="Arriero Growth Engine"
      width={1024}
      height={896}
      className={cn(onDark ? "brand-on-dark" : "brand-ink", "h-auto select-none", className)}
      priority
    />
  );
}
