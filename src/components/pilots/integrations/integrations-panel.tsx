import { CircleCheck, Clock, Plug, PlugZap, Plus, TriangleAlert, Unplug, type LucideIcon } from "lucide-react";
import { Callout, EmptyState, Section } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/domain/format";
import { CONNECTION_STATUS_LABEL, effectiveConnectionStatus, type ConnectionStatus } from "@/domain/pilots/extraction-mapping";
import { PROVIDER_LABEL } from "@/domain/pilots/integrations";
import { cn } from "@/lib/utils";
import type { IntegrationConnectionRow } from "@/server/queries/pilots";
import { DeleteConnectionButton, NewConnectionDialog, TestConnectionButton, TokenDialog } from "./connection-dialogs";

const STATUS_ICON: Record<ConnectionStatus, LucideIcon> = {
  disconnected: Unplug,
  connected: CircleCheck,
  expired: Clock,
  error: TriangleAlert,
};

export function ConnectionStatusBadge({ status }: { status: ConnectionStatus }) {
  const Icon = STATUS_ICON[status];
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full border px-2 text-xs font-medium",
        status === "connected" ? "border-line bg-paper" : status === "disconnected" ? "border-line bg-wash text-soft" : "border-highlight bg-highlight/15",
      )}
    >
      <Icon aria-hidden className="size-3.5" />
      {CONNECTION_STATUS_LABEL[status]}
    </span>
  );
}

/** Pestaña Integraciones de Catálogos. Los lectores ven el estado; el aprobador conecta y prueba. */
export function IntegrationsPanel({ connections, enabled, isApprover }: { connections: IntegrationConnectionRow[]; enabled: boolean; isApprover: boolean }) {
  const newButton = isApprover ? (
    <NewConnectionDialog
      trigger={
        <Button>
          <Plus aria-hidden /> Conectar Meta
        </Button>
      }
    />
  ) : null;

  return (
    <div className="space-y-4">
      {!enabled ? (
        <Callout tone="neutral" icon={Plug} title="Las integraciones están apagadas: todo sigue manual">
          Para prenderlas: docs/pilotos/integraciones.md. Puede dejar las cuentas listas desde ya; los datos se traen cuando se prendan.
        </Callout>
      ) : null}

      {connections.length === 0 ? (
        <EmptyState
          icon={PlugZap}
          title="Todavía no hay cuentas conectadas"
          description={
            isApprover
              ? "Conecte la cuenta publicitaria de Meta con un token de solo lectura (ads_read). Así los pilotos y la vista de campañas se llenan solos."
              : "Cuando un aprobador conecte la cuenta de Meta, aquí va a ver su estado."
          }
          action={newButton}
        />
      ) : (
        <Section title="Cuentas conectadas" description="Solo lectura. El token vive en la bóveda del servidor y no se muestra nunca." actions={newButton}>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                <TableHead>Plataforma</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Último dato</TableHead>
                {isApprover ? (
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {connections.map((c) => {
                const status = effectiveConnectionStatus(c);
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <span className="block font-medium">{c.account_label}</span>
                      <span className="text-xs text-soft">{c.account_ref ?? "Sin id de cuenta"}</span>
                    </TableCell>
                    <TableCell>{PROVIDER_LABEL[c.provider] ?? c.provider}</TableCell>
                    <TableCell>
                      <ConnectionStatusBadge status={status} />
                      {c.last_error ? <span className="mt-1 block max-w-xs text-xs text-soft">{c.last_error}</span> : null}
                      {c.expires_at ? <span className="mt-0.5 block text-xs text-soft">Vence: {formatDateTime(c.expires_at)}</span> : null}
                    </TableCell>
                    <TableCell className="text-xs text-soft">{c.last_sync_at ? formatDateTime(c.last_sync_at) : "Nunca"}</TableCell>
                    {isApprover ? (
                      <TableCell>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <TokenDialog connectionId={c.id} label={c.account_label} />
                          <TestConnectionButton connectionId={c.id} disabled={!enabled || status !== "connected"} />
                          <DeleteConnectionButton connectionId={c.id} label={c.account_label} />
                        </div>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Section>
      )}
    </div>
  );
}
