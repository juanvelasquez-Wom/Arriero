"use client";

import { Ban, KeyRound, MoreHorizontal, ShieldCheck, ShieldOff, UserCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/domain/format";
import { ROLE_LABEL } from "@/domain/labels";
import { cn } from "@/lib/utils";
import { createPasswordLink, setAdmin, setBlocked } from "@/server/actions/users";
import type { UserRow } from "@/server/queries/users";
import { LinkDialog } from "./link-dialog";

const STATUS: Record<UserRow["status"], { label: string; className: string }> = {
  active: { label: "Activo", className: "border-ink/30 bg-gray-1 text-ink" },
  pending: { label: "Invitación pendiente", className: "border-dashed border-gray-4 text-soft" },
  blocked: { label: "Bloqueado", className: "border-ink bg-ink text-paper" },
};

export function UsersTable({ users, currentUserId }: { users: UserRow[]; currentUserId: string }) {
  const router = useRouter();
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: unknown }>) {
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      if (r.message) toast.success(r.message);
      const maybeLink = (r.data as { link?: string } | undefined)?.link;
      if (maybeLink) setLink(maybeLink);
      router.refresh();
    });
  }

  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-paper">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Programas</TableHead>
              <TableHead>Último ingreso</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const me = u.id === currentUserId;
              return (
                <TableRow key={u.id}>
                  <TableCell>
                    <div className="flex items-center gap-2 font-medium">
                      {u.name}
                      {me ? <span className="text-xs font-normal text-soft">(tú)</span> : null}
                      {u.isAdmin ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-highlight bg-highlight/20 px-2 py-0.5 text-[11px] font-semibold">
                          <ShieldCheck className="size-3" aria-hidden /> Admin global
                        </span>
                      ) : null}
                    </div>
                    <div className="text-xs text-soft">{u.email}</div>
                  </TableCell>
                  <TableCell>
                    <span className={cn("inline-flex h-6 items-center rounded-full border px-2 text-xs", STATUS[u.status].className)}>
                      {STATUS[u.status].label}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {u.programs.length ? (
                      <ul className="space-y-0.5">
                        {u.programs.map((p) => (
                          <li key={p.id}>
                            <Link href={`/programas/${p.id}`} className="hover:underline">
                              {p.name}
                            </Link>{" "}
                            <span className="text-xs text-soft">· {ROLE_LABEL[p.role]}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-soft">{u.isAdmin ? "Todos (admin)" : "Ninguno"}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">{u.lastSignInAt ? formatDateTime(u.lastSignInAt) : <span className="text-soft">Nunca</span>}</TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Acciones para ${u.name}`} disabled={pending}>
                          <MoreHorizontal aria-hidden />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => run(() => createPasswordLink(u.id))}>
                          <KeyRound aria-hidden /> {u.status === "pending" ? "Generar enlace de invitación" : "Generar enlace de contraseña"}
                        </DropdownMenuItem>
                        {!me ? (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => run(() => setAdmin(u.id, !u.isAdmin))}>
                              {u.isAdmin ? <ShieldOff aria-hidden /> : <ShieldCheck aria-hidden />}
                              {u.isAdmin ? "Quitar admin global" : "Hacer admin global"}
                            </DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => run(() => setBlocked(u.id, u.status !== "blocked"))}>
                              {u.status === "blocked" ? <UserCheck aria-hidden /> : <Ban aria-hidden />}
                              {u.status === "blocked" ? "Desbloquear acceso" : "Bloquear acceso"}
                            </DropdownMenuItem>
                          </>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
      <LinkDialog
        link={link}
        title="Enlace de contraseña"
        description="Con este enlace la persona entra y crea (o cambia) su contraseña."
        onClose={() => setLink(null)}
      />
    </>
  );
}
