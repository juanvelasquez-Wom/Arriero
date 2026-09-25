import { requireUser } from "@/server/auth";

// Todas las vistas de la app dependen de la sesión: se renderizan por petición.
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await requireUser();
  return <div className="flex min-h-screen flex-1 flex-col bg-wash">{children}</div>;
}
