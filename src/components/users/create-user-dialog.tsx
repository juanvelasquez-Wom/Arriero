"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { UserPlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/domain/labels";
import { PROGRAM_ROLES } from "@/domain/types";
import { createUserSchema, type CreateUserInput } from "@/lib/validation/users";
import { createUser } from "@/server/actions/users";
import { LinkDialog } from "./link-dialog";

const NO_PROGRAM = "__none__";

export function CreateUserDialog({ programs }: { programs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const defaults: CreateUserInput = { email: "", name: "", isAdmin: false, mode: "email", programId: "", role: "collaborator" };
  const form = useForm<CreateUserInput>({ resolver: zodResolver(createUserSchema), defaultValues: defaults });
  const { errors } = form.formState;
  const programId = useWatch({ control: form.control, name: "programId" });
  const role = useWatch({ control: form.control, name: "role" });

  const onSubmit = form.handleSubmit((values) => {
    setError(undefined);
    startTransition(async () => {
      const r = await createUser({ ...values, programId: values.programId || undefined, role: values.programId ? values.role : undefined });
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      toast.success(r.message ?? "Usuario creado");
      form.reset(defaults);
      setOpen(false);
      if (r.data.link) setLink(r.data.link);
      router.refresh();
    });
  });

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button>
            <UserPlus aria-hidden /> Crear usuario
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Crear usuario</DialogTitle>
            <DialogDescription>La persona recibe un enlace para crear su contraseña. Nadie más la conoce.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <FormError message={error} />
              <FormField id="u-name" label="Nombre" required error={errors.name?.message}>
                <Input id="u-name" autoComplete="off" {...form.register("name")} />
              </FormField>
              <FormField id="u-email" label="Correo" required error={errors.email?.message}>
                <Input id="u-email" type="email" autoComplete="off" {...form.register("email")} />
              </FormField>

              <Controller
                control={form.control}
                name="isAdmin"
                render={({ field }) => (
                  <div className="flex items-start gap-3 rounded-lg border p-3">
                    <Switch id="u-admin" checked={field.value} onCheckedChange={field.onChange} />
                    <div>
                      <Label htmlFor="u-admin">Admin global</Label>
                      <p className="text-xs text-soft">
                        Ve y administra todos los programas, crea programas y usuarios, y carga el programa de ejemplo.
                      </p>
                    </div>
                  </div>
                )}
              />

              {programs.length ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField id="u-program" label="Agregar a un programa (opcional)">
                    <Controller
                      control={form.control}
                      name="programId"
                      render={({ field }) => (
                        <Select value={field.value || NO_PROGRAM} onValueChange={(v) => field.onChange(v === NO_PROGRAM ? "" : v)}>
                          <SelectTrigger id="u-program" className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NO_PROGRAM}>Ninguno por ahora</SelectItem>
                            {programs.map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  </FormField>
                  {programId ? (
                    <FormField id="u-role" label="Rol en el programa" error={errors.role?.message}>
                      <Controller
                        control={form.control}
                        name="role"
                        render={({ field }) => (
                          <Select value={field.value} onValueChange={field.onChange}>
                            <SelectTrigger id="u-role" className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {PROGRAM_ROLES.map((r) => (
                                <SelectItem key={r} value={r}>
                                  {ROLE_LABEL[r]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      />
                    </FormField>
                  ) : null}
                  {programId && role ? <p className="text-xs text-soft sm:col-span-2">{ROLE_DESCRIPTION[role]}</p> : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <div className="text-sm font-medium">¿Cómo le llega el acceso?</div>
                <Controller
                  control={form.control}
                  name="mode"
                  render={({ field }) => (
                    <RadioGroup value={field.value} onValueChange={field.onChange}>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="email" id="mode-email" />
                        <Label htmlFor="mode-email" className="flex-col items-start gap-0.5">
                          <span>Enviar invitación por correo</span>
                          <span className="text-xs font-normal text-soft">
                            Requiere un SMTP propio en Supabase. Si el correo falla, te mostramos un enlace para compartir.
                          </span>
                        </Label>
                      </div>
                      <div className="flex items-start gap-2">
                        <RadioGroupItem value="link" id="mode-link" />
                        <Label htmlFor="mode-link" className="flex-col items-start gap-0.5">
                          <span>Generar un enlace para compartir</span>
                          <span className="text-xs font-normal text-soft">No se envía correo; tú compartes el enlace de un solo uso.</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  )}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                <SubmitButton pending={pending}>Crear usuario</SubmitButton>
              </div>
            </FieldGroup>
          </form>
        </DialogContent>
      </Dialog>
      <LinkDialog
        link={link}
        title="Enlace de invitación"
        description="Con este enlace la persona entra y crea su contraseña."
        onClose={() => setLink(null)}
      />
    </>
  );
}
