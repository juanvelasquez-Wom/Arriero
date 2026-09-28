import { Compass } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/app/page";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-1 items-center justify-center bg-wash px-4">
      <EmptyState
        art="mapa"
        icon={Compass}
        className="max-w-xl"
        title="Ese camino no era: esta página no existe"
        description="Puede que el enlace esté viejo, que lo hayan borrado o que no tenga acceso."
        action={
          <Button asChild>
            <Link href="/">Volver al inicio</Link>
          </Button>
        }
      />
    </main>
  );
}
