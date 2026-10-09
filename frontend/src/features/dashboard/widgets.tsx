import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Bot, Briefcase, CalendarClock, Check, CheckCircle2, Gavel, Sparkles, X } from "lucide-react";
import { EmptySpot } from "@/components/brand/Spots";
import { relativeTime } from "@/features/admin/roles";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Approval, Dashboard, DashItem } from "@/types";
import { BriefingCard } from "./BriefingCard";

export type WidgetId = "briefing" | "stats" | "approvals" | "today" | "overdue" | "alerts" | "matters";
export type Size = "half" | "full";
export interface WidgetLayout { id: WidgetId; size: Size; hidden: boolean }

export const WIDGETS: Record<WidgetId, { title: string; hint: string; size: Size }> = {
  briefing: { title: "Daily briefing", hint: "Today in a few lines", size: "full" },
  stats: { title: "Overview", hint: "Key counts", size: "full" },
  approvals: { title: "Waiting for your approval", hint: "AI actions to approve", size: "full" },
  today: { title: "Today", hint: "Hearings and tasks due", size: "half" },
  overdue: { title: "Overdue", hint: "Tasks past due", size: "half" },
  alerts: { title: "Legal alerts", hint: "New matching judgments", size: "half" },
  matters: { title: "Active matters", hint: "Next hearings first", size: "half" },
};

export const DEFAULT_LAYOUT: WidgetLayout[] = (Object.keys(WIDGETS) as WidgetId[]).map((id) => ({
  id, size: WIDGETS[id].size, hidden: false,
}));

/** Count up to `value` when it arrives. */
export function useCountUp(value: number) {
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

function Stat({ label, value, tone, to, Icon }: { label: string; value: number; tone: string; to: string; Icon: typeof Sparkles }) {
  const n = useCountUp(value);
  return (
    <Link to={to} className="group flex items-center gap-3.5 rounded-2xl border border-ink-100 bg-white px-4 py-3.5 transition duration-200 hover:-translate-y-1 hover:border-ink-200 hover:shadow-[0_16px_32px_rgba(7,13,32,0.10)]">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300 transition group-hover:scale-105">
        <Icon className="size-5" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-2xl font-bold tabular-nums leading-tight", tone)}>{n}</span>
        <span className="block truncate text-xs font-medium text-ink-500">{label}</span>
      </span>
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
    case "briefing":
      return <BriefingCard />;
    case "stats":
      return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Active matters" value={data.stats.open_matters} tone="text-ink-900" to="/matters" Icon={Briefcase} />
          <Stat label="Overdue tasks" value={data.stats.overdue_tasks} tone={data.stats.overdue_tasks ? "text-red-600" : "text-ink-900"} to="/tasks" Icon={AlertTriangle} />
          <Stat label="Hearings this week" value={data.stats.hearings_week} tone="text-ink-900" to="/calendar" Icon={CalendarClock} />
          <Stat label="New alerts" value={data.stats.new_alerts} tone={data.stats.new_alerts ? "text-brass-600" : "text-ink-900"} to="/legal" Icon={Gavel} />
        </div>
      );
    case "approvals":
      return <ApprovalList />;
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

function ApprovalRow({ a, i }: { a: Approval; i: number }) {
  const qc = useQueryClient();
  const [done, setDone] = useState<"approve" | "reject" | null>(null);
  const decide = useMutation({
    mutationFn: (verb: "approve" | "reject") => api(`/approvals/${a.id}/${verb}`, { method: "POST" }),
    onMutate: (verb) => setDone(verb),
    onError: () => setDone(null),
    onSuccess: () => setTimeout(() => {
      for (const k of ["approvals", "tasks", "calendar", "dashboard", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
    }, 900),
  });
  return (
    <li style={{ animationDelay: `${i * 50}ms` }}
      className={cn("flex animate-slide-up flex-wrap items-center gap-3 rounded-xl border px-3 py-2.5 transition-all duration-500",
        done === "approve" && "border-emerald-300 bg-emerald-50",
        done === "reject" && "border-red-200 bg-red-50",
        !done && "border-ink-100 hover:border-ink-200")}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300"><Bot className="size-4" /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-ink-900">{a.label}</span>
        <span className="block truncate text-xs text-ink-500">{a.summary} · {relativeTime(a.created_at)}</span>
        {decide.isError && <span className="block text-xs text-red-600">{errorMessage(decide.error)}</span>}
      </span>
      {done ? (
        <span className={cn("flex animate-pop items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
          done === "approve" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>
          {done === "approve" ? <><Check className="size-3.5" /> Approved</> : <><X className="size-3.5" /> Rejected</>}
        </span>
      ) : (
        <span className="flex shrink-0 gap-1.5">
          <button onClick={() => decide.mutate("reject")} aria-label={`Reject: ${a.label}`} title="Reject"
            className="grid size-9 place-items-center rounded-xl border border-ink-200 text-ink-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">
            <X className="size-4" />
          </button>
          <button onClick={() => decide.mutate("approve")} aria-label={`Approve: ${a.label}`} title="Approve"
            className="grid size-9 place-items-center rounded-xl bg-ink-900 text-snow transition hover:bg-ink-800 dark:bg-brass-400 dark:text-night-950">
            <Check className="size-4" />
          </button>
        </span>
      )}
    </li>
  );
}

/** Pending AI actions, decided in place. Shares its cache with the Approvals page. */
function ApprovalList() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["approvals", "pending"],
    queryFn: () => api<Approval[]>("/approvals?status=pending"),
    refetchInterval: 20_000,
  });
  if (isLoading) return <div className="h-24 animate-pulse rounded-xl bg-ink-50" />;
  if (!data.length) {
    return (
      <div className="flex items-center gap-4 py-2">
        <EmptySpot kind="clear" className="h-20 w-28 shrink-0" />
        <div>
          <div className="font-semibold text-ink-900">All clear</div>
          <div className="text-sm text-ink-500">No AI actions are waiting for you.</div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <ul className="flex flex-col gap-2">
        {data.slice(0, 4).map((a, i) => <ApprovalRow key={a.id} a={a} i={i} />)}
      </ul>
      <Link to="/approvals" className="mt-3 inline-block text-sm font-semibold text-brass-700 hover:underline">
        {data.length > 4 ? `See all ${data.length}` : "Open approvals"}
      </Link>
    </div>
  );
}
