import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/app/app-header";
import { PageHeader } from "@/components/app/page";
import { CreateUserDialog } from "@/components/users/create-user-dialog";
import { UsersTable } from "@/components/users/users-table";
import { requireUser } from "@/server/auth";
import { listMyPrograms } from "@/server/queries/programs";
import { listAllUsers } from "@/server/queries/users";

export const metadata: Metadata = { title: "Usuarios" };

export default async function UsersPage() {
  const user = await requireUser();
  if (!user.isAdmin) redirect("/programas");
  const [users, programs] = await Promise.all([listAllUsers(), listMyPrograms(user.id)]);

  return (
    <>
      <AppHeader user={user} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
        <PageHeader
          eyebrow="Administración"
          title="Usuarios"
          description="Aquí no entra cualquiera: las cuentas se crean desde esta pantalla. Cada persona pone su propia contraseña con el enlace de invitación. El rol en cada programa se asigna al crear la cuenta o desde la configuración del programa."
          actions={<CreateUserDialog programs={programs.map((p) => ({ id: p.id, name: p.name }))} />}
        />
        <UsersTable users={users} currentUserId={user.id} />
      </main>
    </>
  );
}
