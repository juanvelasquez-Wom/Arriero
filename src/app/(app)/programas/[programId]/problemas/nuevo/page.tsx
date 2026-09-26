import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PageHeader, Section } from "@/components/app/page";
import { ProblemForm } from "@/components/problems/problem-form";
import { can } from "@/domain/permissions";
import { getProgramContext } from "@/server/auth";
import { listLines } from "@/server/queries/programs";
import { listStages } from "@/server/queries/structure";

export const metadata: Metadata = { title: "Nuevo problema" };

export default async function NewProblemPage({ params, searchParams }: PageProps<"/programas/[programId]/problemas/nuevo">) {
  const { programId } = await params;
  const sp = await searchParams;
  const ctx = await getProgramContext(programId);
  if (!can.createProblem(ctx.actor)) redirect(`/programas/${programId}/problemas`);
  const [lines, stages] = await Promise.all([listLines(programId), listStages({ programId })]);
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nuevo problema"
        description="Cargue lo que importa: dónde se pierde valor, con qué datos y por qué creemos que pasa. De aquí nacen los ejercicios."
      />
      <Section>
        <ProblemForm
          programId={programId}
          lines={lines}
          stages={stages}
          defaultLineId={typeof sp.linea === "string" ? sp.linea : undefined}
        />
      </Section>
    </div>
  );
}
