import { Bell, Check, Compass, FolderKanban, LayoutDashboard, Lock, Megaphone, Paperclip, Search, Trophy } from "lucide-react";
import type { ReactNode } from "react";
import { Mule } from "@/components/brand/logo";
import type { TourMock } from "@/domain/learn-content";
import { cn } from "@/lib/utils";

// Maquetas ilustradas (divs con los tokens de la marca, no capturas). Son
// decorativas: el texto del paso explica lo mismo.

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div aria-hidden className={cn("rise overflow-hidden rounded-2xl border bg-wash p-3 text-ink select-none", className)}>
      {children}
    </div>
  );
}

function Pill({ children, active, className }: { children: ReactNode; active?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        active ? "border-highlight bg-highlight text-[#1F1F1F]" : "bg-paper",
        className,
      )}
    >
      {children}
    </span>
  );
}

function Line({ w = "w-full", className }: { w?: string; className?: string }) {
  return <span className={cn("block h-2 rounded-full bg-gray-2", w, className)} />;
}

function HeaderMock() {
  return (
    <Frame>
      <div className="flex items-center gap-2 rounded-xl border bg-paper px-2 py-2">
        <Mule className="w-6" />
        <span className="flex flex-1 items-center gap-1 rounded-lg border bg-wash px-2 py-1 text-[11px] text-soft">
          <Search className="size-3" /> Buscar… <kbd className="ml-auto rounded border bg-paper px-1 text-[10px]">Ctrl K</kbd>
        </span>
        <Bell className="size-4" />
      </div>
      <div className="stagger mt-2 flex flex-wrap gap-1.5">
        <Pill active>
          <FolderKanban className="size-3" /> Proyectos
        </Pill>
        <Pill>
          <Megaphone className="size-3" /> Pilotos
        </Pill>
        <Pill>
          <LayoutDashboard className="size-3" /> Tableros
        </Pill>
        <Pill>
          <Compass className="size-3" /> Dirección
        </Pill>
      </div>
    </Frame>
  );
}

function WizardMock() {
  return (
    <Frame>
      <div className="mb-2 flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <span key={n} className={cn("h-1.5 flex-1 rounded-full", n <= 2 ? "bg-highlight" : "bg-gray-2")} />
        ))}
      </div>
      <div className="rounded-xl border bg-paper p-3">
        <div className="text-[11px] font-semibold">Nombre del programa</div>
        <div className="mt-1 rounded-lg border px-2 py-1.5 text-[11px] text-soft">Plan digital oct 2026 – abr 2027</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Pill active>Pospago</Pill>
          <Pill active>Recargas</Pill>
          <Pill>Equipos</Pill>
          <Pill>+ Otra línea</Pill>
        </div>
        <div className="mt-3 flex justify-end">
          <span className="rounded-lg bg-highlight px-3 py-1 text-[11px] font-semibold text-[#1F1F1F]">Arme el programa</span>
        </div>
      </div>
    </Frame>
  );
}

function LineMock() {
  const rows = [
    { t: "Métrica norte y eficiencia", ok: true },
    { t: "Árbol de métricas", ok: true },
    { t: "Embudo", ok: false },
  ];
  return (
    <Frame>
      <div className="mb-2 text-[11px] font-semibold">Configurar Pospago</div>
      <div className="stagger space-y-1.5">
        {rows.map((r) => (
          <div key={r.t} className="flex items-center gap-2 rounded-xl border bg-paper px-3 py-2 text-[12px]">
            <span className={cn("flex size-4 items-center justify-center rounded-full", r.ok ? "bg-ink text-paper" : "border")}>
              {r.ok ? <Check className="size-3" /> : null}
            </span>
            <span className="flex-1">{r.t}</span>
            <span className="text-soft">▾</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function WeeklyMock() {
  const rows = [
    ["Altas digitales", "1.240", "1.310"],
    ["Conversaciones WhatsApp", "8.900", "9.450"],
    ["Costo por alta", "$58.000", "$54.500"],
  ];
  return (
    <Frame>
      <div className="mb-2 flex items-center justify-between text-[11px]">
        <span className="font-semibold">Semana del lunes 21 sep</span>
        <Pill>Pegar desde Excel</Pill>
      </div>
      <div className="overflow-hidden rounded-xl border bg-paper text-[11px] tabular-nums">
        <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-b bg-wash px-2 py-1 font-semibold text-soft">
          <span>Métrica</span>
          <span>Anterior</span>
          <span>Esta</span>
        </div>
        {rows.map(([m, a, b]) => (
          <div key={m} className="grid grid-cols-[1fr_auto_auto] gap-2 border-b px-2 py-1.5 last:border-0">
            <span className="truncate">{m}</span>
            <span className="text-soft">{a}</span>
            <span className="rounded bg-highlight/25 px-1 font-semibold">{b}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function ProblemMock() {
  return (
    <Frame>
      <div className="rounded-xl border bg-paper p-3">
        <div className="flex flex-wrap gap-1.5">
          <Pill>Portabilidad</Pill>
          <Pill>Activación</Pill>
          <Pill>WhatsApp</Pill>
        </div>
        <div className="mt-2 text-[12px] font-semibold">62 % abandona antes de dar sus datos</div>
        <div className="mt-2 space-y-1">
          <Line w="w-11/12" />
          <Line w="w-8/12" />
        </div>
        <div className="mt-2 flex items-center gap-2 text-[11px]">
          <span className="rounded-md border bg-wash px-1.5 py-0.5"><Paperclip className="mr-1 inline size-3" />evidencia-meta.csv</span>
          <Pill className="ml-auto">Por validar</Pill>
        </div>
      </div>
    </Frame>
  );
}

function BacklogMock() {
  const rows = [
    { t: "Plan recomendado en el primer mensaje", ice: "7,7", final: "8,7", top: true },
    { t: "Cuotas sin interés arriba", ice: "6,7", final: "6,7", top: false },
    { t: "Recordatorio de recarga por SMS", ice: "6,3", final: "5,3", top: false },
  ];
  return (
    <Frame>
      <div className="mb-1 grid grid-cols-[1fr_auto_auto] gap-3 px-2 text-[10px] font-semibold text-soft">
        <span>Ejercicio</span>
        <span>ICE</span>
        <span>Final</span>
      </div>
      <div className="stagger space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.t}
            className={cn(
              "grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-xl border bg-paper px-2 py-2 text-[11px] tabular-nums",
              r.top && "border-highlight",
            )}
          >
            <span className="truncate">{r.t}</span>
            <span className="text-soft">{r.ice}</span>
            <span className={cn("rounded px-1 font-bold", r.top && "bg-highlight text-[#1F1F1F]")}>{r.final}</span>
          </div>
        ))}
      </div>
    </Frame>
  );
}

function DesignMock() {
  return (
    <Frame>
      <div className="flex flex-wrap items-center gap-1 text-[11px]">
        <Pill>Priorizado</Pill>
        <span className="text-soft">→</span>
        <Pill>En diseño</Pill>
        <span className="text-soft">→</span>
        <Pill active>En prueba</Pill>
      </div>
      <div className="mt-2 rounded-xl border bg-paper p-3 text-[11px]">
        <div className="flex items-center gap-1.5 font-semibold">
          <Lock className="size-3.5" /> Diseño bloqueado
        </div>
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <span className="rounded-lg bg-wash px-2 py-1">A/B · 21 días</span>
          <span className="rounded-lg bg-wash px-2 py-1">Regla: +5 %</span>
          <span className="rounded-lg bg-wash px-2 py-1">Control ✓</span>
          <span className="rounded-lg bg-wash px-2 py-1">Variante B</span>
        </div>
      </div>
    </Frame>
  );
}

function ResultsMock() {
  return (
    <Frame>
      <div className="rounded-xl border bg-paper p-3 text-[11px]">
        {[
          { l: "Control", w: "58%", v: "4,1 %", hi: false },
          { l: "Variante B", w: "66%", v: "4,6 %", hi: true },
        ].map((b) => (
          <div key={b.l} className="mb-2 flex items-center gap-2">
            <span className="w-16 shrink-0">{b.l}</span>
            <span className="h-3 flex-1 rounded-full bg-wash">
              <span className={cn("block h-full rounded-full", b.hi ? "bg-highlight" : "bg-gray-4")} style={{ width: b.w }} />
            </span>
            <span className="w-10 text-right font-semibold tabular-nums">{b.v}</span>
          </div>
        ))}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Pill>Probabilidad de ganar 96 %</Pill>
          <Pill active>
            <Trophy className="size-3" /> Ganador
          </Pill>
          <Pill>Escalar</Pill>
        </div>
      </div>
    </Frame>
  );
}

function BoardsMock() {
  return (
    <Frame>
      <div className="mb-2 flex gap-1.5">
        <Pill active>Gantt</Pill>
        <Pill>Kanban</Pill>
        <Pill>Ruta</Pill>
      </div>
      <div className="relative space-y-1.5 rounded-xl border bg-paper p-3">
        <span className="absolute inset-y-2 left-[68%] w-0.5 bg-highlight" />
        <span className="absolute inset-y-2 left-[42%] w-[12%] bg-gray-2/70" />
        {[
          ["ml-[5%] w-[30%]", "bg-gray-4"],
          ["ml-[20%] w-[20%]", "bg-highlight"],
          ["ml-[56%] w-[30%]", "bg-gray-3"],
        ].map(([pos, color], i) => (
          <span key={i} className={cn("relative block h-3 rounded-full", pos, color)} />
        ))}
        <div className="relative flex justify-between pt-1 text-[10px] text-soft">
          <span>oct</span>
          <span>nov · congelado</span>
          <span>ene · decisión</span>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[10px]">
        {["Ahora", "Siguiente", "Después"].map((c, i) => (
          <div key={c} className="rounded-lg border bg-paper p-1.5">
            <div className="font-semibold">{c}</div>
            {Array.from({ length: 3 - i }).map((_, j) => (
              <Line key={j} className="mt-1" />
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

function PilotsMock() {
  return (
    <Frame>
      <div className="grid grid-cols-2 gap-2 text-[11px]">
        {[
          { l: "Prueba · Medellín, Cali", h: "h-20", hi: true, v: "46" },
          { l: "Control · Bogotá, B/quilla", h: "h-16", hi: false, v: "40" },
        ].map((g) => (
          <div key={g.l} className="rounded-xl border bg-paper p-2">
            <div className="flex h-20 items-end justify-center">
              <span className={cn("block w-10 rounded-t-lg", g.h, g.hi ? "bg-highlight" : "bg-gray-4")} />
            </div>
            <div className="mt-1 text-center font-semibold tabular-nums">{g.v} / 1.000</div>
            <div className="truncate text-center text-[10px] text-soft">{g.l}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill>Meta CTWA</Pill>
        <Pill active>Incrementalidad +15 %</Pill>
      </div>
    </Frame>
  );
}

function DirectionMock() {
  return (
    <Frame>
      <div className="mb-2 text-[12px] font-semibold">¿Estamos creciendo?</div>
      <div className="stagger grid grid-cols-3 gap-1.5">
        {[
          { l: "Norte vs. meta", v: "94 %", hi: true },
          { l: "En prueba", v: "6", hi: false },
          { l: "Decididos", v: "4", hi: false },
        ].map((k) => (
          <div key={k.l} className={cn("rounded-xl border bg-paper p-2", k.hi && "border-highlight")}>
            <div className="text-[10px] text-soft">{k.l}</div>
            <div className="font-heading text-lg font-extrabold tabular-nums">{k.v}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-1.5">
        <Pill>Semana</Pill>
        <Pill>Mes</Pill>
        <Pill className="ml-auto">Copiar resumen</Pill>
      </div>
    </Frame>
  );
}

function RolesMock() {
  const cols = ["Owner", "Colab.", "Agencia", "Lector"];
  const rows: [string, boolean[]][] = [
    ["Ver", [true, true, true, true]],
    ["Crear ejercicios", [true, true, true, false]],
    ["Priorizar (ICE)", [true, true, false, false]],
    ["Decidir", [true, false, false, false]],
  ];
  return (
    <Frame>
      <div className="overflow-hidden rounded-xl border bg-paper text-[10px]">
        <div className="grid grid-cols-[1fr_repeat(4,2.6rem)] border-b bg-wash px-2 py-1 font-semibold text-soft">
          <span />
          {cols.map((c) => (
            <span key={c} className="text-center">
              {c}
            </span>
          ))}
        </div>
        {rows.map(([label, can]) => (
          <div key={label} className="grid grid-cols-[1fr_repeat(4,2.6rem)] items-center border-b px-2 py-1.5 last:border-0">
            <span className="truncate">{label}</span>
            {can.map((ok, i) => (
              <span key={i} className="flex justify-center">
                {ok ? <Check className="size-3.5" /> : <span className="text-soft">·</span>}
              </span>
            ))}
          </div>
        ))}
      </div>
    </Frame>
  );
}

const MOCKS: Record<TourMock, () => ReactNode> = {
  header: HeaderMock,
  wizard: WizardMock,
  line: LineMock,
  weekly: WeeklyMock,
  problem: ProblemMock,
  backlog: BacklogMock,
  design: DesignMock,
  results: ResultsMock,
  boards: BoardsMock,
  pilots: PilotsMock,
  direction: DirectionMock,
  roles: RolesMock,
};

export function TourMockView({ mock }: { mock: TourMock }) {
  return MOCKS[mock]();
}
