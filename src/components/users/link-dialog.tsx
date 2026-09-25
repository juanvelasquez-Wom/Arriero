"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

/** Muestra un enlace de un solo uso para compartir a mano. */
export function LinkDialog({
  link,
  title,
  description,
  onClose,
}: {
  link: string | null;
  title: string;
  description: string;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!link} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input readOnly value={link ?? ""} aria-label="Enlace" className="font-mono text-xs" onFocus={(e) => e.target.select()} />
          <Button
            variant="outline"
            onClick={() => link && navigator.clipboard.writeText(link).then(() => toast.success("Enlace copiado"))}
          >
            <Copy aria-hidden /> Copiar
          </Button>
        </div>
        <p className="text-xs text-soft">
          El enlace es personal, de un solo uso y vence. Compártelo por un canal privado. Si vence, genera otro desde la lista de usuarios.
        </p>
        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
