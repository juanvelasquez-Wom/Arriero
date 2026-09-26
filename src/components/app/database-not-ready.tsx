import { Database } from "lucide-react";
import { EmptyState } from "@/components/app/page";

export function DatabaseNotReady() {
  return (
    <div className="flex min-h-screen flex-1 items-center justify-center bg-wash px-4">
      <EmptyState
        icon={Database}
        className="max-w-xl"
        title="¡Ave María! La base de datos todavía no está creada"
        description={
          <>
            Su sesión funciona, pero faltan las tablas de la app. Aplique las migraciones: pegue el SQL en el SQL Editor de Supabase y
            ejecútelo, o corra <code className="rounded bg-wash px-1">npm run db:push</code>. Después recargue esta página.
          </>
        }
      />
    </div>
  );
}
