"use client";

import {
  AtSign,
  Bell,
  BookOpenCheck,
  CalendarClock,
  CheckCheck,
  ClipboardList,
  Hourglass,
  MessageSquare,
  RefreshCw,
  Snowflake,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { BrandIcon } from "@/components/brand/icons";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { badgeText, relativeTime, safeHref, type NotificationItem } from "@/domain/notifications";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "@/server/actions/notifications";

const KIND_ICON: Record<string, LucideIcon> = {
  assigned: UserPlus,
  status: RefreshCw,
  comment: MessageSquare,
  mention: AtSign,
  ready_to_read: BookOpenCheck,
  stale: Hourglass,
  freeze: Snowflake,
  load_reminder: ClipboardList,
};

/**
 * Campana de avisos del header. Lee los últimos 20 al montar, se actualiza con
 * Realtime cuando llega uno nuevo y marca como leído al abrirlo. Si la tabla de
 * avisos todavía no existe en la base, no muestra nada.
 */
export function NotificationsBell({ userId }: { userId: string }) {
  const router = useRouter();
  const [ready, setReady] = useState<boolean | null>(null);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    void fetchNotifications().then((res) => {
      if (!res.ok) return;
      setReady(res.data.ready);
      setItems(res.data.items);
      setUnread(res.data.unread);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!ready) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` }, (payload: { eventType: string; new: unknown }) => {
        if (payload.eventType === "INSERT") {
          const n = payload.new as Partial<NotificationItem>;
          if (n.title) toast(n.title, { description: n.body ?? undefined });
        }
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(load, 400);
      })
      .subscribe();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      if (timer.current) clearTimeout(timer.current);
      void supabase.removeChannel(channel);
    };
  }, [ready, userId, load]);

  if (!ready) return null;

  const badge = badgeText(unread);

  function openItem(n: NotificationItem) {
    const href = safeHref(n.href);
    if (!n.read_at) {
      const now = new Date().toISOString();
      setItems((list) => list.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
      setUnread((u) => Math.max(0, u - 1));
      void markNotificationRead(n.id);
    }
    setOpen(false);
    if (href) router.push(href);
  }

  function readAll() {
    startTransition(async () => {
      const res = await markAllNotificationsRead();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const now = new Date().toISOString();
      setItems((list) => list.map((x) => (x.read_at ? x : { ...x, read_at: now })));
      setUnread(0);
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="relative"
          aria-label={unread ? `Avisos: ${unread} sin leer` : "Avisos"}
        >
          <Bell className="size-4" aria-hidden />
          {badge ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-highlight px-1 text-[10px] leading-none font-bold text-[#1F1F1F] tabular-nums ring-2 ring-paper"
            >
              {badge}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
          <div className="text-sm font-bold">Avisos</div>
          <Button variant="ghost" size="xs" onClick={readAll} disabled={!unread || pending}>
            <CheckCheck aria-hidden /> Marcar todo como leído
          </Button>
        </div>
        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-6 py-8 text-center">
            <BrandIcon name="tinto" className="w-16 opacity-90" />
            <div className="text-sm font-semibold">Todo en orden. Tómese un tinto, que la mula descansa.</div>
            <p className="text-xs text-soft">Aquí le avisamos cuando le asignen algo, lo mencionen o haya un ejercicio listo para leer.</p>
          </div>
        ) : (
          <ul className="max-h-[min(70vh,440px)] divide-y overflow-y-auto" aria-label="Últimos avisos">
            {items.map((n) => {
              const Icon = KIND_ICON[n.kind] ?? CalendarClock;
              const unreadItem = !n.read_at;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => openItem(n)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-wash focus-visible:bg-wash focus-visible:outline-none",
                      unreadItem && "bg-highlight/5",
                    )}
                  >
                    <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border bg-paper text-soft">
                      <Icon aria-hidden className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", unreadItem ? "font-semibold text-ink" : "text-ink/85")}>{n.title}</span>
                      {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-soft">{n.body}</span> : null}
                      <span className="mt-1 block text-[11px] text-soft">{relativeTime(n.created_at)}</span>
                    </span>
                    {unreadItem ? (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-highlight ring-1 ring-ink/20">
                        <span className="sr-only">Sin leer</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
