import {
  Award,
  BookOpenText,
  Crown,
  Flag,
  Flame,
  Gavel,
  Ghost,
  Landmark,
  Lock,
  MessagesSquare,
  Mountain,
  Plane,
  Rocket,
  Shovel,
  Skull,
  Sparkles,
  Swords,
  Cross,
  Eye,
  Megaphone,
  Package,
  WandSparkles,
  CloudRain,
  CloudLightning,
  Sprout,
  Feather,
  type LucideIcon,
} from "lucide-react";
import { BADGES, ghostLine, levelFor, LEVELS, nudge, positionTitle, type Badge, type RankedUser } from "@/domain/gamification";
import { cn } from "@/lib/utils";

const BADGE_ICON: Record<string, LucideIcon> = {
  fundador: Landmark,
  terco: Flame,
  madrugador: Flag,
  midas: Sparkles,
  escalador: Mountain,
  cronista: BookOpenText,
  juez: Gavel,
  piloto: Plane,
  coronado: Crown,
  chismoso: MessagesSquare,
  matarife: Swords,
  sepulturero: Shovel,
  cementerio: Cross,
  kamikaze: Rocket,
  ojo: Eye,
  profeta: WandSparkles,
  influencer: Megaphone,
  acumulador: Package,
  nube: CloudRain,
  hacedor: CloudLightning,
  cosecha: Sprout,
  poeta: Feather,
};

export const initials = (name: string) =>
  name
    .split(/[\s.@_-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("") || "?";

export function Avatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-full bg-highlight font-bold text-[#111111]", className)}>
      {initials(name)}
    </span>
  );
}

export function BadgeChip({ badge, locked = false }: { badge: Badge; locked?: boolean }) {
  const Icon = locked ? Lock : (BADGE_ICON[badge.id] ?? Award);
  return (
    <div
      className={cn(
        "flex h-full gap-3 rounded-2xl border p-3",
        locked ? "border-dashed text-soft" : badge.dark ? "bg-[#111111] text-[#F6F6F4] dark:bg-gray-1 dark:text-ink" : "bg-paper",
      )}
    >
      <span
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          locked ? "bg-wash" : badge.dark ? "bg-[#F6F6F4]/10" : "bg-highlight text-[#111111]",
        )}
      >
        <Icon aria-hidden className="size-5" />
      </span>
      <div className="min-w-0">
        <div className="font-semibold leading-tight">{badge.title}</div>
        <p className={cn("mt-0.5 text-xs", locked ? "" : badge.dark ? "text-[#F6F6F4]/70 dark:text-soft" : "text-soft")}>{badge.description}</p>
      </div>
    </div>
  );
}

/** Tarjeta de la persona: nivel, puntos y cuánto le falta. */
export function MyCard({ me, total }: { me: RankedUser | null; total: number }) {
  const points = me?.points ?? 0;
  const lv = levelFor(points);
  return (
    <section className="rise overflow-hidden rounded-3xl bg-[#111111] p-5 text-[#F6F6F4] shadow-card sm:p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full bg-highlight">
          {/* Sobre amarillo va siempre negra: sin la inversión del modo oscuro. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/arriero-mark.png" alt="" aria-hidden className="mule-walk w-11" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-[0.14em] text-[#F6F6F4]/60">
            {me ? `Puesto ${me.position} de ${total}` : "Todavía sin puesto"}
          </div>
          <div className="font-heading text-2xl leading-tight font-extrabold sm:text-3xl">{lv.level.title}</div>
          <p className="text-sm text-[#F6F6F4]/70">{lv.level.blurb}</p>
        </div>
        <div className="text-right">
          <div className="font-heading text-4xl font-extrabold tabular-nums text-highlight">{points.toLocaleString("es-CO")}</div>
          <div className="text-xs text-[#F6F6F4]/60">puntos</div>
        </div>
      </div>
      <div className="mt-4">
        <div className="relative h-3 overflow-hidden rounded-full bg-[#F6F6F4]/15">
          <div className="fill-in h-full rounded-full bg-highlight" style={{ width: `${Math.round(lv.progress * 100)}%` }} />
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[#F6F6F4]/80">{nudge(points)}</span>
          {me && me.streak >= 2 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-[#F6F6F4]/10 px-2.5 py-0.5 text-xs font-semibold">
              <Flame aria-hidden className="size-3.5 text-highlight" /> Racha de {me.streak} días
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** El podio: 2 · 1 · 3, como en las competencias de la vereda. */
export function Podium({ top, meId }: { top: RankedUser[]; meId: string }) {
  const order = [top[1], top[0], top[2]].filter(Boolean) as RankedUser[];
  const height: Record<number, string> = { 1: "h-28 sm:h-36", 2: "h-20 sm:h-28", 3: "h-14 sm:h-20" };
  return (
    <section aria-label="Podio" className="grid grid-cols-3 items-end gap-2 sm:gap-4">
      {order.map((u) => (
        <div key={u.userId} className="pop-in flex min-w-0 flex-col items-center text-center">
          {u.position === 1 ? <Crown aria-hidden className="float-soft mb-1 size-7 text-highlight" /> : null}
          <Avatar name={u.name} className={cn(u.position === 1 ? "size-14 text-lg" : "size-11 text-sm", u.userId === meId && "ring-4 ring-ink/20")} />
          <div className="mt-1.5 w-full truncate text-sm font-semibold">{u.name}</div>
          <div className="w-full truncate text-xs text-soft">{u.level.title}</div>
          <div
            className={cn(
              "mt-2 flex w-full flex-col items-center justify-start rounded-t-2xl pt-2",
              height[u.position] ?? "h-14",
              u.position === 1 ? "bg-highlight text-[#111111]" : "bg-gray-1",
            )}
          >
            <span className="font-heading text-2xl font-extrabold">{u.position}</span>
            <span className="text-xs font-semibold tabular-nums">{u.points.toLocaleString("es-CO")} pts</span>
          </div>
          <div className="mt-1 hidden text-[11px] text-soft sm:block">{positionTitle(u.position, 99)}</div>
        </div>
      ))}
    </section>
  );
}

/** La tabla completa del escalafón. */
export function RankTable({ ranked, meId }: { ranked: RankedUser[]; meId: string }) {
  return (
    <ol className="divide-y overflow-hidden rounded-2xl border bg-paper">
      {ranked.map((u) => {
        const nick = positionTitle(u.position, ranked.length);
        const me = u.userId === meId;
        return (
          <li key={u.userId} className={cn("flex items-center gap-3 px-4 py-3", me && "bg-highlight/15")}>
            <span className="w-7 shrink-0 text-center font-heading text-lg font-extrabold tabular-nums">{u.position}</span>
            <Avatar name={u.name} className="size-9 text-xs" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2">
                <span className="truncate font-semibold">{u.name}</span>
                {me ? <span className="rounded-full bg-ink px-2 text-[11px] font-semibold text-paper">Usted</span> : null}
                {u.ghost ? (
                  <span className="inline-flex items-center gap-1 text-[11px] text-soft">
                    <Ghost aria-hidden className="size-3" /> fantasma
                  </span>
                ) : null}
              </div>
              <div className="truncate text-xs text-soft">
                {u.level.title}
                {nick ? ` · ${nick}` : ""}
                {u.badges.length ? ` · ${u.badges.length} ${u.badges.length === 1 ? "insignia" : "insignias"}` : ""}
              </div>
            </div>
            {u.streak >= 3 ? (
              <span title={`Racha de ${u.streak} días`} className="hidden items-center gap-0.5 text-xs font-semibold sm:inline-flex">
                <Flame aria-hidden className="size-3.5" /> {u.streak}
              </span>
            ) : null}
            <span className="shrink-0 text-right font-heading text-lg font-extrabold tabular-nums">{u.points.toLocaleString("es-CO")}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Humor negro con cariño: los fantasmas y las insignias oscuras. */
export function WallOfShame({ ranked }: { ranked: RankedUser[] }) {
  const ghosts = ranked.filter((u) => u.ghost);
  const dark = BADGES.filter((b) => b.dark).map((b) => ({ badge: b, holders: ranked.filter((u) => u.badges.some((x) => x.id === b.id)) }));
  const cemetery = [...ranked].filter((u) => u.stats.stale_ideas > 0).sort((a, b) => b.stats.stale_ideas - a.stats.stale_ideas).slice(0, 5);
  return (
    <div className="space-y-8">
      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Ghost aria-hidden className="size-5" /> Se buscan
        </h2>
        <p className="mt-1 text-sm text-soft">No entran hace más de un mes. Si los ve, avíseles que la mula pregunta por ellos.</p>
        {ghosts.length ? (
          <ul className="stagger mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ghosts.map((u) => (
              <li key={u.userId} className="pop-in rotate-[-1deg] rounded-xl border-2 border-dashed border-ink bg-[#F7EBC8] p-4 text-center text-[#111111] odd:rotate-[1deg]">
                <div className="font-heading text-2xl font-extrabold tracking-widest">SE BUSCA</div>
                <Avatar name={u.name} className="mx-auto my-2 size-14 text-lg grayscale" />
                <div className="font-semibold">{u.name}</div>
                <p className="mt-1 text-xs">{ghostLine(u.userId)}</p>
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wider">Recompensa: un tinto</div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-wash px-4 py-3 text-sm">Nadie desaparecido. La recua completa. Milagro.</p>
        )}
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-xl font-extrabold">
          <Cross aria-hidden className="size-5" /> Cementerio de ideas
        </h2>
        <p className="mt-1 text-sm text-soft">Ideas que llevan más de 30 días quietas. Cada una resta 10 puntos. Revívalas o entiérrelas con dignidad.</p>
        {cemetery.length ? (
          <ul className="mt-3 space-y-2">
            {cemetery.map((u) => (
              <li key={u.userId} className="flex items-center gap-3 rounded-2xl border bg-paper px-4 py-3">
                <Skull aria-hidden className="size-5 shrink-0" />
                <span className="min-w-0 flex-1 truncate font-medium">{u.name}</span>
                <span className="text-sm tabular-nums">
                  {u.stats.stale_ideas} {u.stats.stale_ideas === 1 ? "idea difunta" : "ideas difuntas"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl bg-wash px-4 py-3 text-sm">El cementerio está vacío. Las ideas están vivas, o nadie tiene ideas. Preferimos creer lo primero.</p>
        )}
      </section>

      <section>
        <h2 className="text-xl font-extrabold">Insignias oscuras</h2>
        <p className="mt-1 text-sm text-soft">Nadie las pide, pero alguien se las gana.</p>
        <ul className="mt-3 grid gap-3 sm:grid-cols-2">
          {dark.map(({ badge, holders }) => (
            <li key={badge.id} className="space-y-1.5">
              <BadgeChip badge={badge} />
              <p className="px-1 text-xs text-soft">
                {holders.length ? `La tienen: ${holders.map((h) => h.name).join(", ")}.` : "Nadie todavía. Dele tiempo."}
              </p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function LevelLadder({ points }: { points: number }) {
  const current = levelFor(points).level.rank;
  return (
    <ol className="space-y-2">
      {LEVELS.map((l) => (
        <li
          key={l.rank}
          className={cn(
            "flex items-center gap-3 rounded-2xl border px-4 py-3",
            l.rank === current ? "border-transparent bg-highlight text-[#111111]" : l.rank < current ? "bg-paper" : "border-dashed text-soft",
          )}
        >
          <span className="w-6 shrink-0 text-center font-heading text-lg font-extrabold">{l.rank}</span>
          <div className="min-w-0 flex-1">
            <div className="font-semibold">
              {l.title}
              {l.rank === current ? " · usted va aquí" : ""}
            </div>
            <p className={cn("text-xs", l.rank === current ? "text-[#111111]/75" : "text-soft")}>{l.blurb}</p>
          </div>
          <span className="shrink-0 text-sm font-semibold tabular-nums">{l.min.toLocaleString("es-CO")}+</span>
        </li>
      ))}
    </ol>
  );
}
