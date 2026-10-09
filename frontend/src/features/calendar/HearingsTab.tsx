import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Hearing } from "@/types";
import { HearingDrawer } from "./forms";

const TONE: Record<string, string> = {
  scheduled: "bg-brass-100 text-brass-700", held: "bg-emerald-50 text-emerald-700",
  adjourned: "bg-amber-50 text-amber-700", cancelled: "bg-ink-50 text-ink-400",
};

export function HearingsTab({ matterId }: { matterId: string }) {
  const [open, setOpen] = useState<Hearing | "new" | null>(null);
  const { data: hearings = [], isLoading } = useQuery({
    queryKey: ["hearings", matterId],
    queryFn: () => api<Hearing[]>(`/hearings?matter_id=${matterId}`),
  });
  const now = Date.now();
  const upcoming = hearings.filter((h) => new Date(h.scheduled_at).getTime() >= now).reverse();
  const past = hearings.filter((h) => new Date(h.scheduled_at).getTime() < now);

  // Calendar days from today, so a hearing later today reads "Today", not "Tomorrow".
  const days = (h: Hearing) => {
    const at = new Date(h.scheduled_at); at.setHours(0, 0, 0, 0);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    return Math.round((at.getTime() - today.getTime()) / 86_400_000);
  };
  const list = (title: string, items: Hearing[], past = false) => items.length > 0 && (
    <section>
      <h3 className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">{title}</h3>
      <div className="grid gap-2 lg:grid-cols-2">
      {items.map((h, i) => {
        const at = new Date(h.scheduled_at);
        const next = !past && i === 0;
        return (
          <button key={h.id} onClick={() => setOpen(h)} style={{ animationDelay: `${i * 30}ms` }}
            className={cn("flex w-full animate-slide-up items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:shadow-md",
              next ? "border-brass-300 bg-brass-100/30" : "border-ink-100", past && "opacity-75")}>
            <span className={cn("grid w-12 shrink-0 rounded-xl py-1.5 text-center",
              past ? "bg-ink-50 text-ink-500" : "bg-gradient-to-br from-night-800 to-night-950 text-snow")}>
              <span className={cn("text-[10px] font-semibold uppercase", past ? "text-ink-400" : "text-brass-300")}>{at.toLocaleDateString([], { month: "short" })}</span>
              <span className="text-lg font-bold leading-none tabular-nums">{at.getDate()}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{h.purpose || "Hearing"}</span>
              <span className="block truncate text-xs text-ink-400">
                {at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{h.court_room ? ` · ${h.court_room}` : ""}
              </span>
            </span>
            {next && days(h) >= 0 && (
              <span className="shrink-0 text-xs font-semibold text-brass-700">{days(h) === 0 ? "Today" : days(h) === 1 ? "Tomorrow" : `In ${days(h)} days`}</span>
            )}
            <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize", TONE[h.status])}>{h.status}</span>
          </button>
        );
      })}
      </div>
    </section>
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-bold text-ink-900">Hearings</h2>
        <Button size="sm" onClick={() => setOpen("new")}><Plus className="size-4" /> Hearing</Button>
      </div>
      {isLoading && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-ink-50" />)}</div>}
      {!isLoading && !hearings.length && (
        <EmptyState kind="calendar" title="No hearings yet" hint="Add the next listing date to see it here and on the calendar." />
      )}
      <div className="space-y-5">
        {list("Upcoming", upcoming)}
        {list("Past", past, true)}
      </div>
      {open && <HearingDrawer key={open === "new" ? "new" : open.id} hearing={open === "new" ? undefined : open} matterId={matterId} onClose={() => setOpen(null)} />}
    </div>
  );
}
