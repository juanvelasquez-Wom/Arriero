"use client";

import { Search, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { normalizeName } from "@/domain/paste-import";
import { PILOT_ROLE_LABEL } from "@/domain/pilots/labels";
import { PILOT_ROLES, type PilotRole } from "@/domain/pilots/types";
import { setPilotRole } from "@/server/actions/pilots";
import type { PilotMember } from "@/server/queries/pilots";

const NONE = "none";

export function RolesTable({ members, currentUserId }: { members: PilotMember[]; currentUserId: string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const needle = normalizeName(q);
  const visible = needle ? members.filter((m) => normalizeName(`${m.name} ${m.email}`).includes(needle)) : members;

  function change(member: PilotMember, value: string) {
    const role = value === NONE ? null : (value as PilotRole);
    if (role === member.role) return;
    setBusy(member.user_id);
    startTransition(async () => {
      const r = await setPilotRole({ user_id: member.user_id, role });
      setBusy(null);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(r.message ?? "Rol actualizado.");
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="relative max-w-sm">
        <label htmlFor="roles-search" className="sr-only">
          Buscar persona
        </label>
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-soft" />
        <Input id="roles-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre o correo" className="pl-8" />
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card" role="region" aria-label="Personas y roles en Pilotos" tabIndex={0}>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead className="w-56">Rol en Pilotos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((m) => {
              const me = m.user_id === currentUserId;
              const lockedSelf = me && m.role === "approver";
              return (
                <TableRow key={m.user_id}>
                  <TableCell className="whitespace-normal">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {m.name}
                      {me ? <span className="text-xs font-normal text-soft">(usted)</span> : null}
                    </div>
                    <div className="text-xs text-soft">{m.email}</div>
                  </TableCell>
                  <TableCell>
                    {m.is_admin ? (
                      <span className="inline-flex h-7 items-center gap-1 rounded-full border border-highlight bg-highlight/20 px-2.5 text-xs font-semibold">
                        <ShieldCheck aria-hidden className="size-3.5" /> Aprobador (admin global)
                      </span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Select value={m.role ?? NONE} onValueChange={(v) => change(m, v)} disabled={pending || lockedSelf}>
                          <SelectTrigger size="sm" className="w-44" aria-label={`Rol de ${m.name} en Pilotos`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Sin acceso</SelectItem>
                            {[...PILOT_ROLES].reverse().map((r) => (
                              <SelectItem key={r} value={r}>
                                {PILOT_ROLE_LABEL[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {busy === m.user_id ? <Spinner /> : null}
                      </div>
                    )}
                    {lockedSelf ? <div className="mt-1 text-[11px] text-soft">No puede quitarse su propio rol de aprobador.</div> : null}
                  </TableCell>
                </TableRow>
              );
            })}
            {visible.length === 0 ? (
              <TableRow>
                <TableCell colSpan={2} className="py-8 text-center text-sm text-soft">
                  Nadie coincide con «{q}». Revise el nombre o el correo.
                </TableCell>
              </TableRow>
            ) : null}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
