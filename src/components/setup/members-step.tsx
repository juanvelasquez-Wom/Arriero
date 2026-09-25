"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Copy, UserPlus, UserX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { ConfirmAction } from "@/components/app/confirm-action";
import { applyFieldErrors, FormError, FormField, SubmitButton } from "@/components/app/form";
import { Callout } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROLE_DESCRIPTION, ROLE_LABEL } from "@/domain/labels";
import { PROGRAM_ROLES, type ProgramRole } from "@/domain/types";
import { inviteSchema, type InviteInput } from "@/lib/validation/programs";
import { changeMemberRole, inviteMember, removeMember } from "@/server/actions/members";
import { advanceSetup } from "@/server/actions/programs";
import type { Member } from "@/server/queries/programs";

export function MembersStep({
  programId,
  members,
  currentUserId,
  canManage,
  showNav = true,
}: {
  programId: string;
  members: Member[];
  currentUserId: string;
  canManage: boolean;
  showNav?: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [link, setLink] = useState<string>();
  const [pending, startTransition] = useTransition();
  const form = useForm<InviteInput>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: "", name: "", role: "collaborator" },
  });
  const { errors } = form.formState;
  const role = useWatch({ control: form.control, name: "role" });

  const onInvite = form.handleSubmit((values) => {
    setError(undefined);
    setLink(undefined);
    startTransition(async () => {
      const r = await inviteMember(programId, values);
      if (!r.ok) {
        setError(r.error);
        applyFieldErrors(r.fieldErrors, form.setError);
        return;
      }
      if (r.data.link) setLink(r.data.link);
      toast.success(r.message ?? "Listo");
      form.reset({ email: "", name: "", role: values.role });
      router.refresh();
    });
  });

  function onRoleChange(memberId: string, role: string) {
    startTransition(async () => {
      const r = await changeMemberRole(programId, memberId, role);
      if (!r.ok) toast.error(r.error);
      else {
        toast.success("Rol actualizado");
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-xl border bg-paper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead className="w-10">
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="font-medium">{m.name}</div>
                  <div className="text-xs text-soft">{m.email}</div>
                </TableCell>
                <TableCell>
                  {canManage ? (
                    <Select value={m.role} onValueChange={(v) => onRoleChange(m.id, v)} disabled={pending}>
                      <SelectTrigger className="w-44" aria-label={`Rol de ${m.name}`}>
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
                  ) : (
                    ROLE_LABEL[m.role]
                  )}
                </TableCell>
                <TableCell>
                  {canManage && m.user_id !== currentUserId ? (
                    <ConfirmAction
                      title={`Quitar a ${m.name} del programa`}
                      description="Deja de ver el programa. Los ejercicios que tenga asignados conservan su responsable hasta que lo cambies."
                      confirmLabel="Quitar"
                      onConfirm={async () => {
                        const r = await removeMember(programId, m.id);
                        if (!r.ok) return r.error;
                        toast.success("Miembro quitado");
                        router.refresh();
                      }}
                    >
                      <Button variant="ghost" size="icon-sm" aria-label={`Quitar a ${m.name}`}>
                        <UserX aria-hidden />
                      </Button>
                    </ConfirmAction>
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {canManage ? (
        <form onSubmit={onInvite} noValidate className="rounded-xl border bg-paper p-4">
          <h3 className="text-sm font-semibold">Invitar por correo</h3>
          <p className="mt-0.5 text-xs text-soft">No hay registro abierto: solo entra quien invites. El rol se asigna al invitar.</p>
          <FormError message={error} className="mt-3" />
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_200px]">
            <FormField id="inv-email" label="Correo" required error={errors.email?.message}>
              <Input id="inv-email" type="email" autoComplete="off" {...form.register("email")} />
            </FormField>
            <FormField id="inv-name" label="Nombre" error={errors.name?.message}>
              <Input id="inv-name" autoComplete="off" {...form.register("name")} />
            </FormField>
            <FormField id="inv-role" label="Rol" error={errors.role?.message}>
              <Controller
                control={form.control}
                name="role"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="inv-role" className="w-full">
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
          </div>
          <p className="mt-2 text-xs text-soft">{ROLE_DESCRIPTION[role as ProgramRole]}</p>
          <SubmitButton pending={pending} size="sm" className="mt-3">
            <UserPlus aria-hidden /> Invitar
          </SubmitButton>
          {link ? (
            <Callout className="mt-3" title="Comparte este enlace de invitación">
              <p className="text-xs">
                El correo no se pudo enviar (Supabase necesita un SMTP propio para enviar a cualquier dirección). El enlace es personal y vence.
              </p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={link} aria-label="Enlace de invitación" className="font-mono text-xs" />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigator.clipboard.writeText(link).then(() => toast.success("Enlace copiado"))}
                >
                  <Copy aria-hidden /> Copiar
                </Button>
              </div>
            </Callout>
          ) : null}
        </form>
      ) : (
        <p className="text-sm text-soft">Solo el owner o un admin puede invitar y cambiar roles.</p>
      )}

      {showNav ? (
        <div className="flex justify-between">
          <Button variant="outline" onClick={() => router.push(`/programas/${programId}/configuracion?paso=3`)}>
            Anterior
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await advanceSetup(programId, 4);
                router.push(`/programas/${programId}/configuracion?paso=5`);
              })
            }
          >
            Siguiente
          </Button>
        </div>
      ) : null}
    </div>
  );
}
