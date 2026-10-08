import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Briefcase, CalendarClock, FileWarning, Gavel, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Dashboard, DashCardId, DashMatter } from "@/types";

const PRIORITY_DOT: Record<string, string> = {
  urgent: "bg-red-500", high: "bg-amber-500", medium: "bg-ink-300", low: "bg-ink-100",
};

const dayLabel = (iso: string) => {
  const d = new Date(iso);
  const days = Math.round((new Date(d.toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / 86_400_000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days === 0) return `Today, ${time}`;
  if (days === 1) return `Tomorrow, ${time}`;
  return d.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) + `, ${time}`;
};

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-sm text-ink-400">{children}</p>;
}

function Row({ to, children, delay }: { to: string; children: ReactNode; delay: number }) {
  return (
    <li className="animate-fade-up" style={{ animationDelay: `${delay * 40}ms` }}>
      <Link to={to} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-ink-50">{children}</Link>
    </li>
  );
}

function MatterRow({ m, i, when }: { m: DashMatter; i: number; when?: boolean }) {
  return (
    <Row to={`/matters/${m.id}`} delay={i}>
      <span className={cn("size-2 shrink-0 rounded-full", PRIORITY_DOT[m.priority] ?? "bg-ink-200")} title={`${m.priority} priority`} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-sm font-medium text-ink-900">
          {m.title}{m.restricted && <Lock className="size-3 shrink-0 text-ink-300" aria-label="Restricted" />}
        </span>
        <span className="block truncate text-xs text-ink-400">{[m.matter_number, m.court].filter(Boolean).join(" · ")}</span>
      </span>
      {when && m.next_hearing && <span className="shrink-0 text-xs font-medium text-ink-600">{dayLabel(m.next_hearing)}</span>}
    </Row>
  );
}

function Stat({ to, icon, label, value, tone }: { to: string; icon: ReactNode; label: string; value: number; tone: string }) {
  return (
    <Link to={to} className="group rounded-xl border border-ink-100 bg-white p-4 transition hover:-translate-y-0.5 hover:shadow-md">
      <div className={cn("mb-3 grid size-9 place-items-center rounded-lg", tone)}>{icon}</div>
      <div className="text-2xl font-semibold tabular-nums text-ink-900">{value}</div>
      <div className="text-xs text-ink-400 group-hover:text-ink-600">{label}</div>
    </Link>
  );
}

export interface CardDef {
  title: string;
  wide?: boolean;
  render: (d: Dashboard) => ReactNode;
}

export const CARDS: Record<DashCardId, CardDef> = {
  stats: {
    title: "At a glance",
    wide: true,
    render: (d) => (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat to="/matters" icon={<Briefcase className="size-4" />} label="My open matters" value={d.stats.my_matters} tone="bg-ink-50 text-ink-600" />
        <Stat to="/matters" icon={<CalendarClock className="size-4" />} label="Hearings, next 14 days" value={d.stats.hearings} tone="bg-sky-50 text-sky-700" />
        <Stat to="/legal" icon={<Gavel className="size-4" />} label="New legal alerts" value={d.stats.alerts} tone="bg-brass-100 text-brass-700" />
        <Stat to="/matters" icon={<FileWarning className="size-4" />} label="Documents to check" value={d.stats.documents} tone="bg-red-50 text-red-600" />
      </div>
    ),
  },
  hearings: {
    title: "Upcoming hearings",
    render: (d) => d.hearings.length
      ? <ul>{d.hearings.map((m, i) => <MatterRow key={m.id} m={m} i={i} when />)}</ul>
      : <Empty>No hearings in the next 14 days.</Empty>,
  },
  alerts: {
    title: "Legal alerts",
    render: (d) => d.alerts.length ? (
      <ul>
        {d.alerts.map((a, i) => (
          <Row key={a.id} to={`/matters/${a.matter_id}`} delay={i}>
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brass-100 text-xs font-semibold text-brass-700">
              {Math.round(a.relevance * 100)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{a.title}</span>
              <span className="block truncate text-xs text-ink-400">{a.matter_title}{a.court_name ? ` · ${a.court_name}` : ""}</span>
            </span>
          </Row>
        ))}
        <li className="pt-2"><Link to="/legal" className="text-xs font-medium text-ink-600 hover:underline">Review all alerts</Link></li>
      </ul>
    ) : <Empty>No new alerts.</Empty>,
  },
  my_matters: {
    title: "My matters",
    render: (d) => d.my_matters.length
      ? <ul>{d.my_matters.map((m, i) => <MatterRow key={m.id} m={m} i={i} />)}</ul>
      : <Empty>You have no open matters.</Empty>,
  },
  documents: {
    title: "Documents to check",
    render: (d) => d.documents.length ? (
      <ul>
        {d.documents.map((doc, i) => (
          <Row key={doc.id} to={`/matters/${doc.matter_id}`} delay={i}>
            {doc.status === "failed"
              ? <AlertTriangle className="size-4 shrink-0 text-red-500" />
              : <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-ink-100 border-t-ink-500" />}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink-900">{doc.filename}</span>
              <span className="block truncate text-xs text-ink-400">
                {doc.status === "failed" ? `Failed: ${doc.error ?? "could not read file"}` : "Processing"} · {doc.matter_title}
              </span>
            </span>
          </Row>
        ))}
      </ul>
    ) : <Empty>All documents are ready.</Empty>,
  },
};
