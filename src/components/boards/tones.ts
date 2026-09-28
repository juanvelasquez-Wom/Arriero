import { CheckCheck, FlaskConical, ListTodo, PencilRuler, ScanSearch, XCircle, type LucideIcon } from "lucide-react";
import type { BoardColumnKey } from "@/domain/boards";

// Un tono por columna, igual para ejercicios y pilotos: grises por intensidad y
// amarillo solo para En prueba. Siempre con ícono y etiqueta.
export const COLUMN_TONE: Record<BoardColumnKey, { icon: LucideIcon; bar: string; dot: string }> = {
  todo: { icon: ListTodo, bar: "bg-paper text-ink border border-gray-3", dot: "bg-paper border border-gray-4" },
  design: { icon: PencilRuler, bar: "bg-gray-2 text-ink border border-gray-3", dot: "bg-gray-2 border border-gray-3" },
  test: { icon: FlaskConical, bar: "bg-highlight text-[#1f1f1f] border border-highlight", dot: "bg-highlight" },
  reading: { icon: ScanSearch, bar: "bg-gray-3 text-[#1f1f1f] border border-gray-3 dark:text-paper", dot: "bg-gray-3" },
  closed: { icon: CheckCheck, bar: "bg-gray-4 text-paper border border-gray-4", dot: "bg-gray-4" },
  discarded: { icon: XCircle, bar: "bg-paper text-soft border border-dashed border-gray-3", dot: "border border-dashed border-gray-3" },
};
