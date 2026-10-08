import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, ChevronDown, History, Search, User as UserIcon } from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AuditEntry } from "@/types";

const DECISION_TONE: Record<string, string> = {
  ALLOWED: "bg-emerald-50 text-emerald-700", APPROVAL_REQUIRED: "bg-brass-100 text-brass-700", DISABLED: "bg-red-50 text-red-600",
};
const DECISION_LABEL: Record<string, string> = { ALLOWED: "Allowed", APPROVAL_REQUIRED: "Ask first", DISABLED: "Blocked" };
const control = "h-9 rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-700 outline-none transition focus:border-brass-400";

const human = (action: string) => action.toLowerCase().replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

function Row({ e, i }: { e: AuditEntry; i: number }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Object.keys(e.result ?? {}).length > 0;
  return (
    <div style={{ animationDelay: `${Math.min(i, 20) * 20}ms` }} className="animate-slide-up border-b border-ink-50 last:border-0">
      <button onClick={() => hasDetail && setOpen(!open)} className={cn("flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm", hasDetail && "hover:bg-ink-50/60")}>
        <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", e.agent_key ? "bg-ink-900 text-brass-300" : "bg-ink-50 text-ink-500")}>
          {e.agent_key ? <Bot className="size-3.5" /> : <UserIcon className="size-3.5" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-ink-900">{human(e.action)}</span>
          <span className="block truncate text-xs text-ink-400">
            {e.user_name ?? "System"}{e.agent_name ? ` · ${e.agent_name} agent` : ""}{e.matter_title ? ` · ${e.matter_title}` : ""}
            {e.approved_by_name ? ` · ${e.approved ? "approved" : "rejected"} by ${e.approved_by_name}` : ""}
          </span>
        </span>
        {e.policy_decision && <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", DECISION_TONE[e.policy_decision])}>{DECISION_LABEL[e.policy_decision]}</span>}
        {e.executed !== null && e.executed !== undefined && (
          <span className={cn("shrink-0 text-[11px]", e.executed ? "text-emerald-600" : "text-ink-300")}>{e.executed ? "Ran" : "Not run"}</span>
        )}
        <span className="w-28 shrink-0 text-right text-xs tabular-nums text-ink-400">
          {new Date(e.occurred_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
        </span>
        <ChevronDown className={cn("size-4 shrink-0 text-ink-300 transition-transform", !hasDetail && "invisible", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="mx-4 mb-3 max-h-48 animate-fade-in overflow-auto rounded-lg bg-ink-950 p-3 text-[11px] leading-relaxed text-ink-100">
          {JSON.stringify(e.result, null, 2)}
        </pre>
      )}
    </div>
  );
}

/** Read-only audit trail. With `matterId`, shows only that matter (the matter's AI Activity tab). */
export function AuditLog({ matterId }: { matterId?: string }) {
  const [q, setQ] = useState("");
  const [decision, setDecision] = useState("");
  const [who, setWho] = useState("");
  const [from, setFrom] = useState("");
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (decision) params.set("decision", decision);
  if (who) params.set("actor", who);
  if (from) params.set("since", new Date(`${from}T00:00`).toISOString());
  const path = matterId ? `/audit/matters/${matterId}?${params}` : `/audit?${params}`;
  const { data = [], isLoading } = useQuery({ queryKey: ["audit", matterId ?? "", params.toString()], queryFn: () => api<AuditEntry[]>(path) });

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actions" aria-label="Search actions" className={cn(control, "w-full pl-9")} />
        </div>
        <select value={who} onChange={(e) => setWho(e.target.value)} className={control} aria-label="Actor">
          <option value="">Agents and people</option>
          <option value="agent">Agents only</option>
          <option value="user">People only</option>
        </select>
        <select value={decision} onChange={(e) => setDecision(e.target.value)} className={control} aria-label="Decision">
          <option value="">Any decision</option>
          <option value="ALLOWED">Allowed</option>
          <option value="APPROVAL_REQUIRED">Ask first</option>
          <option value="DISABLED">Blocked</option>
        </select>
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={control} aria-label="Since" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-ink-100 bg-white">
        {isLoading && <div className="m-3 h-24 animate-pulse rounded-xl bg-ink-50" />}
        {!isLoading && !data.length && (
          <div className="flex animate-fade-in flex-col items-center gap-2 py-12 text-ink-300">
            <History className="size-6" /><span className="text-sm">No activity yet.</span>
          </div>
        )}
        {data.map((e, i) => <Row key={e.id} e={e} i={i} />)}
      </div>
      {data.length >= 200 && <p className="mt-2 text-xs text-ink-400">Showing the latest 200. Narrow the filters to see older entries.</p>}
    </div>
  );
}
