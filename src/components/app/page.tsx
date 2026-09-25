import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
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
    <div className={cn("mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="mb-1 text-xs font-medium uppercase tracking-wide text-soft">{eyebrow}</div> : null}
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-soft">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** Estado vacío útil: qué va aquí y cuál es el siguiente paso. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-paper px-6 py-10 text-center",
        className,
      )}
    >
      {Icon ? (
        <div className="flex size-10 items-center justify-center rounded-lg bg-wash text-ink">
          <Icon aria-hidden className="size-5" />
        </div>
      ) : null}
      <div className="max-w-md">
        <h2 className="text-base font-semibold">{title}</h2>
        <div className="mt-1 text-sm text-soft">{description}</div>
      </div>
      {action ? <div className="mt-1 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ title = "No pudimos cargar esta vista", message }: { title?: string; message?: string }) {
  return (
    <div role="alert" className="rounded-xl border border-ink/20 bg-wash px-4 py-3 text-sm">
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
    <section className={cn("rounded-xl border bg-paper", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b px-4 py-3">
          <div>
            {title ? <h2 className="text-sm font-semibold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-soft">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function Stat({ label, value, hint, highlight }: { label: string; value: ReactNode; hint?: ReactNode; highlight?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-paper p-4", highlight && "border-l-4 border-l-highlight")}>
      <div className="text-xs font-medium text-soft">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
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
        "flex gap-3 rounded-lg border px-3 py-2.5 text-sm",
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
