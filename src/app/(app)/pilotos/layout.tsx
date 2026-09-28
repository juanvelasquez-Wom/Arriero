import { Database, KeyRound } from "lucide-react";
import type { Metadata } from "next";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState } from "@/components/app/page";
import { PilotsNav } from "@/components/pilots/pilots-nav";
import { isPilotApprover } from "@/domain/pilots/flow";
import { getPilotContext, isPilotsReady } from "@/server/pilot-auth";
import { recordUsage } from "@/server/usage";

export const metadata: Metadata = { title: { template: "%s · Pilotos", default: "Pilotos de medios" } };

export default async function PilotsLayout({ children }: { children: React.ReactNode }) {
  const { user, actor } = await getPilotContext();
  const ready = await isPilotsReady();
  if (ready && actor.role) recordUsage("pilotos", user.id);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        {!ready ? (
          <EmptyState
            art="carriel-experimentos"
            icon={Database}
            title="Falta crear las tablas de Pilotos"
            description="Pegue el SQL de la migración de Pilotos en el SQL Editor de Supabase y ejecútelo. Después recargue esta página."
          />
        ) : !actor.role ? (
          <EmptyState
            art="mula-sombrero"
            icon={KeyRound}
            title="Todavía no tiene acceso a Pilotos"
            description="Pídale a un aprobador (o a un admin) que le asigne un rol: Aprobador, Creador o Lector."
          />
        ) : (
          <>
            <PilotsNav isApprover={isPilotApprover(actor)} />
            {children}
          </>
        )}
      </main>
    </>
  );
}
