import { DatabaseNotReady } from "@/components/app/database-not-ready";
import { isDatabaseReady, requireUser } from "@/server/auth";
import { recordUsage } from "@/server/usage";

// Todas las vistas de la app dependen de la sesión: se renderizan por petición.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  if (!(await isDatabaseReady())) return <DatabaseNotReady />;
  recordUsage("app", user.id);
  return <div className="flex min-h-screen flex-1 flex-col bg-wash">{children}</div>;
}
