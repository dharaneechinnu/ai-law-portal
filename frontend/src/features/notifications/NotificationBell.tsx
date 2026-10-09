import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlarmClock, Bell, CalendarClock, CheckCheck, CheckCircle2, Gavel, ShieldQuestion, Sparkles } from "lucide-react";
import { relativeTime } from "@/features/admin/roles";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AppNotification } from "@/types";

const ICON: Record<string, typeof Bell> = {
  briefing: Sparkles, hearing: Gavel, meeting: CalendarClock, deadline: AlarmClock, overdue: AlarmClock,
  task: CheckCircle2, legal: Gavel, approval: ShieldQuestion,
};
const TONE: Record<string, string> = {
  overdue: "bg-red-50 text-red-600", deadline: "bg-amber-50 text-amber-600", legal: "bg-brass-100 text-brass-700",
  hearing: "bg-brass-100 text-brass-700", briefing: "bg-ink-100 text-ink-600",
};

/** Top-bar bell with unread badge and a panel of recent notifications. Polls every 30 seconds. */
export function NotificationBell() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: count = 0 } = useQuery({
    queryKey: ["notifications", "count"],
    queryFn: () => api<{ unread: number }>("/notifications/unread-count").then((r) => r.unread),
    refetchInterval: 30_000,
  });
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api<AppNotification[]>("/notifications"),
    enabled: open,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["notifications"] });
  const read = useMutation({ mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: "POST" }), onSuccess: refresh });
  const readAll = useMutation({ mutationFn: () => api("/notifications/read-all", { method: "POST" }), onSuccess: refresh });

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  const go = (n: AppNotification) => {
    if (!n.read_at) read.mutate(n.id);
    setOpen(false);
    if (n.link) nav(n.link);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Notifications${count ? `, ${count} unread` : ""}`} title="Notifications"
        className={cn("group relative grid size-9 place-items-center rounded-xl text-ink-500 transition hover:bg-ink-50 hover:text-ink-900", open && "bg-ink-50 text-ink-900")}>
        <Bell className={cn("size-[18px] transition", count > 0 && "animate-sway text-brass-600")} />
        {count > 0 && (
          <span key={count} className="absolute right-0.5 top-0.5 grid h-4 min-w-4 animate-pop place-items-center rounded-full bg-brass-400 px-1 text-[10px] font-semibold tabular-nums text-night-950 ring-2 ring-slate-50">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[24rem] max-w-[calc(100vw-2rem)] origin-top-right animate-palette overflow-hidden rounded-2xl border border-ink-100 bg-white text-ink-900 shadow-2xl">
          <header className="flex items-center justify-between border-b border-ink-50 px-4 py-3">
            <span className="text-sm font-semibold">Notifications</span>
            {count > 0 && (
              <button onClick={() => readAll.mutate()} className="flex items-center gap-1 text-xs text-brass-700 hover:underline">
                <CheckCheck className="size-3.5" /> Mark all read
              </button>
            )}
          </header>
          <div className="max-h-[26rem] overflow-y-auto">
            {isLoading && <div className="m-3 h-16 animate-pulse rounded-xl bg-ink-50" />}
            {!isLoading && !items.length && <p className="py-10 text-center text-sm text-ink-300">You're all caught up.</p>}
            {items.map((n, i) => {
              const Icon = ICON[n.kind] ?? Bell;
              return (
                <button key={n.id} onClick={() => go(n)} style={{ animationDelay: `${i * 25}ms` }}
                  className={cn("flex w-full animate-slide-up items-start gap-3 px-4 py-3 text-left transition hover:bg-ink-50", !n.read_at && "bg-brass-100/25")}>
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", TONE[n.kind] ?? "bg-ink-100 text-ink-600")}><Icon className="size-4" /></span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", n.read_at ? "text-ink-600" : "font-medium text-ink-900")}>{n.title}</span>
                    {n.body && <span className="line-clamp-2 block text-xs text-ink-400">{n.body}</span>}
                    <span className="mt-0.5 block text-[11px] text-ink-300">{relativeTime(n.created_at)}</span>
                  </span>
                  {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brass-500" aria-label="Unread" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
