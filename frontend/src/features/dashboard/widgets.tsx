import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Briefcase, CalendarClock, CheckCircle2, Gavel, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dashboard, DashItem } from "@/types";

export type WidgetId = "stats" | "today" | "overdue" | "alerts" | "matters";
export type Size = "half" | "full";
export interface WidgetLayout { id: WidgetId; size: Size; hidden: boolean }

export const WIDGETS: Record<WidgetId, { title: string; hint: string; size: Size }> = {
  stats: { title: "Overview", hint: "Key counts", size: "full" },
  today: { title: "Today", hint: "Hearings and tasks due", size: "half" },
  overdue: { title: "Overdue", hint: "Tasks past due", size: "half" },
  alerts: { title: "Legal alerts", hint: "New matching judgments", size: "half" },
  matters: { title: "Active matters", hint: "Next hearings first", size: "half" },
};

export const DEFAULT_LAYOUT: WidgetLayout[] = (Object.keys(WIDGETS) as WidgetId[]).map((id) => ({
  id, size: WIDGETS[id].size, hidden: false,
}));

/** Count up to `value` when it arrives. */
function useCountUp(value: number) {
  const [n, setN] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 700);
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value]);
  return n;
}

function Stat({ label, value, tone, to }: { label: string; value: number; tone: string; to: string }) {
  const n = useCountUp(value);
  return (
    <Link to={to} className="group rounded-xl border border-ink-100 bg-white/70 px-4 py-3 transition hover:-translate-y-0.5 hover:border-brass-300 hover:shadow-md">
      <div className={cn("text-3xl font-semibold tabular-nums", tone)}>{n}</div>
      <div className="mt-0.5 text-xs text-ink-400 transition group-hover:text-ink-600">{label}</div>
    </Link>
  );
}

const fmtTime = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";
const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : "";

function Empty({ icon: Icon, text }: { icon: typeof Sparkles; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-ink-300">
      <Icon className="size-6" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

function Row({ to, children, i }: { to: string; children: React.ReactNode; i: number }) {
  return (
    <Link to={to} style={{ animationDelay: `${i * 40}ms` }}
      className="flex animate-slide-up items-center gap-3 rounded-lg px-2 py-2 text-sm transition hover:bg-ink-50">
      {children}
    </Link>
  );
}

function ItemList({ items, empty, showDay }: { items: DashItem[]; empty: string; showDay?: boolean }) {
  if (!items.length) return <Empty icon={CheckCircle2} text={empty} />;
  return (
    <div className="-mx-2">
      {items.map((it, i) => (
        <Row key={it.id} i={i} to={it.matter_id ? `/matters/${it.matter_id}` : "/tasks"}>
          <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", it.kind === "hearing" ? "bg-brass-100 text-brass-700" : "bg-ink-100 text-ink-600")}>
            {it.kind === "hearing" ? <Gavel className="size-4" /> : <CheckCircle2 className="size-4" />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium text-ink-900">{it.title}</span>
            {it.matter_title && <span className="block truncate text-xs text-ink-400">{it.matter_title}</span>}
          </span>
          <span className="shrink-0 text-xs tabular-nums text-ink-400">{showDay ? fmtDay(it.at) : fmtTime(it.at)}</span>
        </Row>
      ))}
    </div>
  );
}

export function WidgetBody({ id, data }: { id: WidgetId; data: Dashboard }) {
  switch (id) {
    case "stats":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active matters" value={data.stats.open_matters} tone="text-ink-900" to="/matters" />
          <Stat label="Overdue tasks" value={data.stats.overdue_tasks} tone={data.stats.overdue_tasks ? "text-red-600" : "text-ink-900"} to="/tasks" />
          <Stat label="Hearings this week" value={data.stats.hearings_week} tone="text-ink-900" to="/calendar" />
          <Stat label="New alerts" value={data.stats.new_alerts} tone={data.stats.new_alerts ? "text-brass-600" : "text-ink-900"} to="/legal" />
        </div>
      );
    case "today":
      return <ItemList items={data.today} empty="Nothing due today." />;
    case "overdue":
      return <ItemList items={data.overdue} empty="All caught up." showDay />;
    case "alerts":
      return data.alerts.length ? (
        <div className="-mx-2">
          {data.alerts.map((a, i) => (
            <Row key={a.id} i={i} to={`/matters/${a.matter_id}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brass-100 text-brass-700"><AlertTriangle className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{a.title ?? "New judgment"}</span>
                <span className="block truncate text-xs text-ink-400">{a.matter_title}</span>
              </span>
              <span className="shrink-0 rounded-full bg-brass-100 px-2 py-0.5 text-xs font-medium tabular-nums text-brass-700">{Math.round(a.relevance * 100)}%</span>
            </Row>
          ))}
        </div>
      ) : <Empty icon={Sparkles} text="No new alerts." />;
    case "matters":
      return data.matters.length ? (
        <div className="-mx-2">
          {data.matters.map((m, i) => (
            <Row key={m.id} i={i} to={`/matters/${m.id}`}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink-100 text-ink-600"><Briefcase className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-ink-900">{m.title}</span>
                <span className="block truncate text-xs text-ink-400">{m.matter_number}</span>
              </span>
              {m.next_hearing && (
                <span className="flex shrink-0 items-center gap-1 text-xs text-ink-400"><CalendarClock className="size-3.5" />{fmtDay(m.next_hearing)}</span>
              )}
            </Row>
          ))}
        </div>
      ) : <Empty icon={Briefcase} text="No active matters." />;
  }
}
