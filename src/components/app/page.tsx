import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { BrandIcon, type BrandIconName } from "@/components/brand/icons";
import { Mule } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rise mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-soft">{eyebrow}</div> : null}
        <h1 className="text-3xl font-extrabold text-ink">{title}</h1>
        {description ? (
          <p data-explain className="mt-1.5 max-w-3xl text-[15px] text-soft">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Estado vacío útil: qué va aquí y cuál es el siguiente paso. La mula acompaña. */
export function EmptyState({
  icon: Icon,
  art,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  /** Ilustración de la marca; sin ella aparece la mula. */
  art?: BrandIconName;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rise flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-paper px-6 py-12 text-center",
        className,
      )}
    >
      <div className="relative">
        {art ? <BrandIcon name={art} className="w-24 opacity-90" /> : <Mule className="w-24 opacity-90" />}
        {Icon ? (
          <div className="absolute -right-2 -bottom-1 flex size-8 items-center justify-center rounded-full bg-highlight text-[#111111] ring-4 ring-paper">
            <Icon aria-hidden className="size-4" />
          </div>
        ) : null}
      </div>
      <div className="max-w-md">
        <h2 className="text-lg font-bold">{title}</h2>
        <div className="mt-1 text-sm text-soft">{description}</div>
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "Ese camino no era: no pudimos cargar esta vista", message }: { title?: string; message?: string }) {
  return (
    <div role="alert" className="rounded-2xl border border-ink/20 bg-wash px-4 py-3 text-sm">
      <div className="font-semibold">{title}</div>
      {message ? <div className="mt-1 text-soft">{message}</div> : null}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl border bg-paper shadow-card", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-5 py-3.5">
          <div>
            {title ? <h2 className="text-base font-bold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-soft">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, highlight }: { label: ReactNode; value: ReactNode; hint?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("lift rounded-2xl border bg-paper p-4 shadow-card", highlight && "border-highlight bg-highlight/10")}>
      <div className="text-xs font-medium text-soft">{label}</div>
      <div className="mt-1 font-heading text-3xl font-extrabold tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-xs text-soft">{hint}</div> : null}
    </div>
  );
}

/** Advertencia que exige atención (amarillo + ícono). */
export function Callout({
  icon: Icon,
  title,
  children,
  tone = "attention",
  className,
}: {
  icon?: LucideIcon;
  title?: ReactNode;
  children?: ReactNode;
  tone?: "attention" | "neutral";
  className?: string;
}) {
  return (
    <div
      role={tone === "attention" ? "alert" : "note"}
      className={cn(
        "flex gap-3 rounded-xl border px-3.5 py-3 text-sm",
        tone === "attention" ? "border-highlight bg-highlight/15" : "border-line bg-wash",
        className,
      )}
    >
      {Icon ? <Icon aria-hidden className="mt-0.5 size-4 shrink-0" /> : null}
      <div className="min-w-0">
        {title ? <div className="font-medium">{title}</div> : null}
        {children ? <div className={cn(title && "mt-0.5", "text-ink/90")}>{children}</div> : null}
      </div>
    </div>
  );
}
