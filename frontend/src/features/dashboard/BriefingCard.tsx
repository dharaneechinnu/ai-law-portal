import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Briefing } from "@/types";

function Chip({ n, label }: { n: number; label: string }) {
  if (!n) return null;
  return <span className="rounded-full bg-ink-50 px-2.5 py-1 text-xs tabular-nums text-ink-600">{n} {label}</span>;
}

/** Today's briefing: the summary fades in word by word; Refresh rebuilds it from current data. */
export function BriefingCard() {
  const qc = useQueryClient();
  const { data: b, isLoading } = useQuery({ queryKey: ["briefing"], queryFn: () => api<Briefing | null>("/briefing/today") });
  const make = useMutation({
    mutationFn: () => api<Briefing>("/briefing/today", { method: "POST" }),
    onSuccess: (fresh) => qc.setQueryData(["briefing"], fresh),
  });

  if (isLoading) return <div className="h-16 animate-pulse rounded-xl bg-ink-50" />;
  if (!b) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 py-2">
        <span className="flex items-center gap-2 text-sm text-ink-400"><Sparkles className="size-4 text-brass-500" /> No briefing yet today.</span>
        <Button size="sm" onClick={() => make.mutate()} disabled={make.isPending}>{make.isPending ? "Creating…" : "Create now"}</Button>
        {make.isError && <p className="w-full text-xs text-red-600">{errorMessage(make.error)}</p>}
      </div>
    );
  }
  const words = b.summary.split(/\s+/);
  return (
    <div>
      <p key={b.created_at + b.summary} className="text-[15px] leading-relaxed text-ink-800">
        {words.map((w, i) => (
          <span key={i} className="inline-block animate-fade-in" style={{ animationDelay: `${Math.min(i * 25, 1200)}ms` }}>{w}&nbsp;</span>
        ))}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <Chip n={b.facts.hearings.length} label={b.facts.hearings.length === 1 ? "hearing" : "hearings"} />
        <Chip n={b.facts.meetings.length} label={b.facts.meetings.length === 1 ? "meeting" : "meetings"} />
        <Chip n={b.facts.due_today.length} label="due" />
        <Chip n={b.facts.overdue_count} label="overdue" />
        <Chip n={b.facts.alert_count} label={b.facts.alert_count === 1 ? "alert" : "alerts"} />
        <span className="ml-auto flex items-center gap-2 text-xs text-ink-300">
          {new Date(b.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {b.source === "ai" ? "AI summary" : "Facts only"}
          <button onClick={() => make.mutate()} disabled={make.isPending} aria-label="Refresh briefing" title="Refresh"
            className="grid size-7 place-items-center rounded-md transition hover:bg-ink-50 hover:text-ink-600">
            <RotateCw className={cn("size-3.5", make.isPending && "animate-spin")} />
          </button>
        </span>
      </div>
    </div>
  );
}
