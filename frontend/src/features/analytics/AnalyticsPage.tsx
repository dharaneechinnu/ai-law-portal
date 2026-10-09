import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BarChart3 } from "lucide-react";
import { PageHero, Tabs } from "@/components/ui/page";
import { useCountUp } from "@/features/dashboard/widgets";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Analytics, Bar } from "@/types";

const RANGES = [7, 30, 90] as const;

/** Headline number. `warn` adds an icon and label, never colour alone. */
function Tile({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  const n = useCountUp(value);
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-ink-100 bg-white px-4 pb-3 pt-4 transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(7,13,32,0.08)]",
      "before:absolute before:inset-x-0 before:top-0 before:h-1", warn && value > 0 ? "before:bg-red-500" : "before:bg-gradient-to-r before:from-brass-300 before:to-brass-500")}>
      <div className="text-[1.7rem] font-bold leading-tight tabular-nums text-ink-900">{n}</div>
      <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-500">
        {warn && value > 0 && <AlertTriangle className="size-3 text-red-600" aria-label="Needs attention" />}
        {label}
      </div>
      {hint && <div className="text-[11px] text-ink-300">{hint}</div>}
    </div>
  );
}

/** Single-series horizontal bars: one hue, value labelled at the end, hover shows the exact figure. */
function BarList({ title, rows, empty, unit }: { title: string; rows: Bar[]; empty: string; unit: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="rounded-[20px] border border-ink-100 bg-white p-5">
      <h3 className="mb-3 font-serif text-base font-bold text-ink-900">{title}</h3>
      {!rows.length && <p className="py-4 text-center text-sm text-ink-300">{empty}</p>}
      <div className="space-y-2" role="list">
        {rows.map((r, i) => {
          const total = (r.value / max) * 100;
          const over = r.overdue ? (r.overdue / max) * 100 : 0;
          return (
            <div key={r.label} role="listitem" className="group" title={`${r.label}: ${r.value} ${unit}${r.overdue ? `, ${r.overdue} overdue` : ""}`}>
              <div className="mb-1 flex justify-between gap-2 text-xs">
                <span className="truncate text-ink-600 group-hover:text-ink-900">{r.label}</span>
                <span className="shrink-0 tabular-nums text-ink-900">
                  {r.value}{r.overdue ? <span className="text-ink-500"> · {r.overdue} overdue</span> : null}
                </span>
              </div>
              <div className="flex h-2 gap-[2px]">
                <div className="h-full origin-left animate-grow rounded-[4px] bg-ink-600 transition-colors group-hover:bg-ink-800"
                  style={{ width: `${Math.max(total - over, r.value ? 1.5 : 0)}%`, animationDelay: `${i * 40}ms` }} />
                {over > 0 && (
                  <div className="h-full origin-left animate-grow rounded-[4px] bg-red-500"
                    style={{ width: `${over}%`, animationDelay: `${i * 40 + 120}ms` }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Section({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="animate-fade-up space-y-3">
      <div>
        <h2 className="font-serif text-xl font-bold text-ink-900">{title}</h2>
        <p className="text-sm text-ink-400">{sub}</p>
      </div>
      {children}
    </section>
  );
}

export function AnalyticsPage() {
  const [days, setDays] = useState<(typeof RANGES)[number]>(30);
  const { data, isLoading, isError } = useQuery({ queryKey: ["analytics", days], queryFn: () => api<Analytics>(`/analytics?days=${days}`) });

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={BarChart3} eyebrow="Intelligence" title="Analytics"
        sub={`Late work, waiting alerts and how AI is used, across the matters you can open. Last ${days} days.`} />
      <Tabs label="Time range" value={String(days)} onChange={(v) => setDays(Number(v) as (typeof RANGES)[number])}
        items={RANGES.map((d) => [String(d), `${d} days`] as const)} />

      {isLoading && <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-100/60" />)}</div>}
      {isError && <p className="text-sm text-red-600">Couldn't load analytics.</p>}
      {data && (
        <div key={days} className="space-y-8">
          <Section title="Firm" sub="Where work is late or piling up.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Active matters" value={data.firm.active_matters} />
              <Tile label="Overdue tasks" value={data.firm.overdue_tasks} warn />
              <Tile label="Hearings, next 14 days" value={data.firm.hearings_next_14_days} />
              <Tile label="Avg. matter age" value={data.firm.avg_matter_age_days} hint="days" />
              <Tile label="Tasks added" value={data.firm.tasks_created} />
              <Tile label="Tasks done" value={data.firm.tasks_done} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <BarList title="Open tasks by person" rows={data.firm.workload} empty="No open tasks." unit="open tasks" />
              <BarList title="Active matters by practice area" rows={data.firm.by_practice_area} empty="No active matters." unit="matters" />
            </div>
          </Section>

          <Section title="Legal intelligence" sub="Alerts waiting for a lawyer's review.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Judgments added" value={data.legal.judgments_added} />
              <Tile label="Alerts in range" value={data.legal.alerts_in_range} />
              <Tile label="Not reviewed" value={data.legal.alerts_new} warn />
              <Tile label="High impact, not reviewed" value={data.legal.high_impact_unreviewed} hint="80%+ relevance" warn />
              <Tile label="Reviewed" value={data.legal.alerts_reviewed} />
              <Tile label="Dismissed" value={data.legal.alerts_dismissed} />
            </div>
          </Section>

          <Section title="AI" sub="How often AI is allowed, asked to wait, or blocked.">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Tile label="Ran straight away" value={data.ai.allowed} />
              <Tile label="Asked for approval" value={data.ai.asked} />
              <Tile label="Blocked" value={data.ai.blocked} />
              <Tile label="Approved" value={data.ai.approved} />
              <Tile label="Rejected" value={data.ai.rejected} />
              <Tile label="Waiting now" value={data.ai.pending} warn />
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              <BarList title="Most requested actions" rows={data.ai.top_actions} empty="No AI actions yet." unit="requests" />
              <BarList title="Requests by agent" rows={data.ai.by_agent} empty="No AI actions yet." unit="requests" />
              <BarList title="Conversations by model" rows={data.ai.models} empty="No conversations yet." unit="conversations" />
            </div>
          </Section>
        </div>
      )}
    </div>
  );
}
