// Biblioteca de aprendizajes de pilotos: búsqueda sin tildes y filtros de la URL.
import { normalizeName } from "../paste-import";
import { VERDICTS, type IsoDate, type Verdict } from "../types";
import { PILOT_TEST_TYPES, VARIABLE_CATEGORIES, type PilotTestType, type VariableCategory } from "./types";

export interface LibraryItem {
  pilot_title: string;
  text: string;
  created_at: string;
  verdict: Verdict | null;
  test_type: PilotTestType | null;
  variable_name: string | null;
  variable_category: string | null;
  media_names: string[];
  decided_at: string | null;
}

export interface LibraryFilters {
  q: string | null;
  variable: VariableCategory | null;
  canal: string | null;
  tipo: PilotTestType | null;
  resultado: Verdict | null;
  desde: IsoDate | null;
  hasta: IsoDate | null;
}

type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;
const isoOrNull = (v: string | null): IsoDate | null => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
function oneOf<T extends string>(list: readonly T[], v: string | null): T | null {
  return v && (list as readonly string[]).includes(v) ? (v as T) : null;
}

export function parseLibraryFilters(sp: Params): LibraryFilters {
  return {
    q: first(sp.q),
    variable: oneOf(VARIABLE_CATEGORIES, first(sp.variable)),
    canal: first(sp.canal),
    tipo: oneOf(PILOT_TEST_TYPES, first(sp.tipo)),
    resultado: oneOf(VERDICTS, first(sp.resultado)),
    desde: isoOrNull(first(sp.desde)),
    hasta: isoOrNull(first(sp.hasta)),
  };
}

/** Fecha del aprendizaje: la de la decisión o, si falta, la de creación (YYYY-MM-DD). */
export function learningDate(item: Pick<LibraryItem, "decided_at" | "created_at">): IsoDate {
  return (item.decided_at ?? item.created_at).slice(0, 10);
}

/** ¿Todas las palabras de la búsqueda aparecen (sin tildes ni mayúsculas)? */
export function matchesQuery(item: LibraryItem, q: string | null): boolean {
  if (!q) return true;
  const haystack = normalizeName([item.text, item.pilot_title, item.variable_name ?? "", ...item.media_names].join(" "));
  return normalizeName(q)
    .split(" ")
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function filterLearnings<T extends LibraryItem>(items: T[], f: LibraryFilters): T[] {
  const canal = f.canal ? normalizeName(f.canal) : null;
  return items.filter((l) => {
    const date = learningDate(l);
    return (
      matchesQuery(l, f.q) &&
      (!f.variable || l.variable_category === f.variable) &&
      (!canal || l.media_names.some((m) => normalizeName(m) === canal)) &&
      (!f.tipo || l.test_type === f.tipo) &&
      (!f.resultado || l.verdict === f.resultado) &&
      (!f.desde || date >= f.desde) &&
      (!f.hasta || date <= f.hasta)
    );
  });
}
