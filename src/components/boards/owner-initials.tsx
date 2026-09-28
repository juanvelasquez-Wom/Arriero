import { ownerInitials } from "@/domain/boards";
import { cn } from "@/lib/utils";

/** Avatar con las iniciales del responsable; el nombre completo queda en el title y para lectores de pantalla. */
export function OwnerInitials({ name, className }: { name: string | null; className?: string }) {
  const label = name ?? "Sin responsable";
  return (
    <span
      title={label}
      className={cn(
        "inline-flex size-6 shrink-0 items-center justify-center rounded-full border bg-wash text-[10px] font-semibold text-ink",
        !name && "border-dashed text-soft",
        className,
      )}
    >
      <span aria-hidden>{ownerInitials(name)}</span>
      <span className="sr-only">Responsable: {label}</span>
    </span>
  );
}
