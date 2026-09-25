"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import {
  confirmsProgramName,
  dependencyChoice,
  describeImpact,
  ENTITY_LABEL,
  type DeletableEntity,
  type DeleteStrategy,
  type ImpactCounts,
} from "@/domain/deletion";
import { deleteEntity, getDeletionImpact } from "@/server/actions/delete";

export interface ReassignOption {
  id: string;
  label: string;
}

/**
 * Botón "Borrar" con confirmación obligatoria (regla 8): muestra qué más se
 * verá afectado, pide elegir entre reasignar o borrar dependientes y, para un
 * programa, exige escribir su nombre.
 */
export function DeleteButton({
  entity,
  id,
  programId,
  name,
  reassignOptions = [],
  redirectTo,
  size = "sm",
  variant = "outline",
  label = "Borrar",
  iconOnly,
  onDeleted,
}: {
  entity: DeletableEntity;
  id: string;
  programId: string;
  name: string;
  reassignOptions?: ReassignOption[];
  redirectTo?: string;
  size?: "sm" | "xs" | "default" | "icon-sm" | "icon-xs";
  variant?: "outline" | "ghost" | "destructive";
  label?: string;
  iconOnly?: boolean;
  onDeleted?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [impact, setImpact] = useState<ImpactCounts | null>(null);
  const [loadError, setLoadError] = useState<string>();
  const [strategy, setStrategy] = useState<DeleteStrategy>(reassignOptions.length ? "reassign" : "cascade");
  const [target, setTarget] = useState<string>();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setImpact(null);
    setLoadError(undefined);
    setError(undefined);
    setTyped("");
    getDeletionImpact(entity, id).then((r) => {
      if (r.ok) setImpact(r.data);
      else setLoadError(r.error);
    });
  }

  const choice = impact ? dependencyChoice(entity, impact) : null;
  const affected = impact ? describeImpact(impact) : [];
  const dependentsLabel = choice?.dependents === "problems" ? "problemas" : "ejercicios";
  const needsName = entity === "program";
  const canConfirm =
    !!impact &&
    (!needsName || confirmsProgramName(typed, name)) &&
    (!choice || strategy === "cascade" || (strategy === "reassign" && !!target));

  function onConfirm() {
    setError(undefined);
    startTransition(async () => {
      const result = await deleteEntity({
        entity,
        id,
        programId,
        strategy: choice ? strategy : undefined,
        target: choice && strategy === "reassign" ? target : undefined,
        confirmName: needsName ? typed : undefined,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      toast.success(`${ENTITY_LABEL[entity]} enviado a la papelera`, {
        description: "Puedes restaurarlo desde la papelera durante 30 días.",
      });
      onDeleted?.();
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant={variant} size={iconOnly ? "icon-sm" : size} aria-label={iconOnly ? `${label} ${name}` : undefined}>
          <Trash2 aria-hidden />
          {iconOnly ? null : label}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Borrar {ENTITY_LABEL[entity].toLowerCase()} “{name}”
          </DialogTitle>
          <DialogDescription>
            {entity === "program"
              ? "El programa y todo su contenido pasan a la papelera. Un owner o un admin puede restaurarlo durante 30 días."
              : "Pasa a la papelera del programa. Un owner o un admin puede restaurarlo durante 30 días; después se elimina de forma definitiva."}
          </DialogDescription>
        </DialogHeader>

        {!impact && !loadError ? (
          <div className="flex items-center gap-2 text-sm text-soft">
            <Spinner /> Calculando qué se verá afectado…
          </div>
        ) : null}
        {loadError ? <Callout title="No se pudo calcular el impacto">{loadError}</Callout> : null}

        {impact && choice ? (
          <div className="space-y-3">
            <p className="text-sm">
              Tiene <strong>{choice.count}</strong> {dependentsLabel} vinculados. Elige qué hacer con ellos:
            </p>
            <RadioGroup value={strategy} onValueChange={(v) => setStrategy(v as DeleteStrategy)}>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="reassign" id="strategy-reassign" disabled={!reassignOptions.length} />
                <Label htmlFor="strategy-reassign" className="flex-col items-start gap-1">
                  <span>Reasignarlos a otro elemento</span>
                  {!reassignOptions.length ? (
                    <span className="text-xs font-normal text-soft">No hay otro elemento de la misma línea.</span>
                  ) : null}
                </Label>
              </div>
              {strategy === "reassign" && reassignOptions.length ? (
                <Select value={target} onValueChange={setTarget}>
                  <SelectTrigger className="ml-6 w-[calc(100%-1.5rem)]" aria-label="Elemento destino">
                    <SelectValue placeholder="Elige a dónde moverlos" />
                  </SelectTrigger>
                  <SelectContent>
                    {reassignOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <div className="flex items-start gap-2">
                <RadioGroupItem value="cascade" id="strategy-cascade" />
                <Label htmlFor="strategy-cascade">Borrarlos junto con él</Label>
              </div>
            </RadioGroup>
          </div>
        ) : null}

        {impact && affected.length && (!choice || strategy === "cascade") ? (
          <Callout title="También se borrará:">
            <ul className="ml-4 list-disc">
              {affected.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        {needsName && impact ? (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-name">
              Escribe <strong className="font-semibold">{name}</strong> para confirmar
            </Label>
            <Input id="confirm-name" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        ) : null}

        {error ? <Callout title="No se pudo borrar">{error}</Callout> : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} disabled={!canConfirm || pending} className="bg-ink text-paper hover:bg-ink/85">
            {pending ? <Spinner /> : <Trash2 aria-hidden />}
            Borrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
