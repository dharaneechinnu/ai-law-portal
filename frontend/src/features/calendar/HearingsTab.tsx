import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Gavel, Plus } from "lucide-react";
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

  const list = (title: string, items: Hearing[]) => items.length > 0 && (
    <section>
      <h3 className="mb-1 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">{title}</h3>
      {items.map((h, i) => {
        const at = new Date(h.scheduled_at);
        return (
          <button key={h.id} onClick={() => setOpen(h)} style={{ animationDelay: `${i * 30}ms` }}
            className="flex w-full animate-slide-up items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-ink-50">
            <span className="grid w-12 shrink-0 text-center">
              <span className="text-[11px] uppercase text-ink-400">{at.toLocaleDateString([], { month: "short" })}</span>
              <span className="text-lg font-semibold leading-none tabular-nums text-ink-900">{at.getDate()}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{h.purpose || "Hearing"}</span>
              <span className="block truncate text-xs text-ink-400">
                {at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}{h.court_room ? ` · ${h.court_room}` : ""}
              </span>
            </span>
            <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs capitalize", TONE[h.status])}>{h.status}</span>
          </button>
        );
      })}
    </section>
  );

  return (
    <div className="max-w-3xl">
      <div className="mb-4 flex justify-end">
        <Button size="sm" onClick={() => setOpen("new")}><Plus className="size-4" /> Hearing</Button>
      </div>
      {isLoading && <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-ink-50" />)}</div>}
      {!isLoading && !hearings.length && (
        <div className="flex animate-fade-in flex-col items-center gap-2 py-12 text-ink-300">
          <Gavel className="size-6" /><span className="text-sm">No hearings yet.</span>
        </div>
      )}
      <div className="space-y-5">
        {list("Upcoming", upcoming)}
        {list("Past", past)}
      </div>
      {open && <HearingDrawer key={open === "new" ? "new" : open.id} hearing={open === "new" ? undefined : open} matterId={matterId} onClose={() => setOpen(null)} />}
    </div>
  );
}
