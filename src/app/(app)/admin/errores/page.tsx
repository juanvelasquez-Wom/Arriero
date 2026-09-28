import { Bug } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { EmptyState, PageHeader } from "@/components/app/page";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/domain/format";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/server/auth";

export const metadata: Metadata = { title: "Errores del servidor" };

interface ErrorRow {
  id: number;
  occurred_at: string;
  source: string;
  message: string;
  digest: string | null;
  detail: string | null;
}

export default async function ErrorsPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("error_log")
    .select("id, occurred_at, source, message, digest, detail")
    .order("occurred_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as ErrorRow[];

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader
          eyebrow="Administración"
          title="Errores del servidor"
          description="Lo que falló en producción, del más reciente al más viejo. Se guardan sin cabeceras, cookies ni datos del formulario, y con las llaves tapadas."
          actions={
            <Button asChild variant="outline">
              <Link href="/admin/usuarios">Volver a Usuarios</Link>
            </Button>
          }
        />
        {error ? (
          <EmptyState
            icon={Bug}
            title="Todavía no está la tabla de errores"
            description="Aplique la migración 014 en Supabase para empezar a registrar los errores."
          />
        ) : rows.length === 0 ? (
          <EmptyState art="mula-sombrero" icon={Bug} title="Sin errores registrados" description="Por aquí todo anda derecho. Si algo falla, aparece en esta lista." />
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-paper shadow-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-5">Cuándo</TableHead>
                  <TableHead>Dónde</TableHead>
                  <TableHead className="pr-5">Qué pasó</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id} className="align-top">
                    <TableCell className="pl-5 text-xs whitespace-nowrap text-soft tabular-nums">{formatDateTime(r.occurred_at)}</TableCell>
                    <TableCell className="max-w-56 text-xs break-words">{r.source}</TableCell>
                    <TableCell className="pr-5 text-sm">
                      <div className="font-medium break-words">{r.message}</div>
                      {r.digest ? <div className="text-xs text-soft">Código: {r.digest}</div> : null}
                      {r.detail ? (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs text-soft">Ver detalle técnico</summary>
                          <pre className="mt-1 max-w-full overflow-x-auto rounded-lg bg-wash p-2 text-[11px] leading-snug">{r.detail}</pre>
                        </details>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </>
  );
}
