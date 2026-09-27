import { redirect } from "next/navigation";
import { listLines } from "@/server/queries/programs";

/** `/lineas` no tiene vista propia: lleva a la primera línea o, si no hay, al paso «Líneas» del asistente. */
export default async function LinesIndexPage({ params }: { params: Promise<{ programId: string }> }) {
  const { programId } = await params;
  const lines = await listLines(programId);
  if (lines.length > 0) redirect(`/programas/${programId}/lineas/${lines[0].id}`);
  redirect(`/programas/${programId}/configuracion?paso=lineas`);
}
