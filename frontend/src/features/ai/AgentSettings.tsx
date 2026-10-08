import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Power, ShieldAlert, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AgentControls, PolicyDecision } from "@/types";

const DECISIONS: [PolicyDecision, string, string][] = [
  ["ALLOWED", "Allow", "bg-emerald-500 text-white"],
  ["APPROVAL_REQUIRED", "Ask first", "bg-brass-500 text-white"],
  ["DISABLED", "Off", "bg-ink-700 text-white"],
];
const MODES = [["suggest", "Suggest"], ["approval", "Ask first"], ["autonomous", "Autonomous"]] as const;
const HOURS = [1, 4, 24, 72];
const control = "h-9 rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-800 outline-none transition focus:border-brass-400";

function Segmented<T extends string>({ value, options, onChange, disabled }: {
  value: T; options: readonly (readonly [T, string, string?])[]; onChange: (v: T) => void; disabled?: boolean;
}) {
  return (
    <div className={cn("inline-flex rounded-lg bg-ink-50 p-0.5", disabled && "opacity-50")}>
      {options.map(([v, label, active]) => (
        <button key={v} disabled={disabled} onClick={() => v !== value && onChange(v)}
          className={cn("rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-200",
            v === value ? (active ?? "bg-white text-ink-900 shadow-sm") : "text-ink-400 hover:text-ink-700")}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Admin controls for AI agents: kill switch, agent modes, per-action policy and temporary overrides. */
export function AgentSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["agent-controls"], queryFn: () => api<AgentControls>("/agents/controls") });
  const done = () => qc.invalidateQueries({ queryKey: ["agent-controls"] });
  const put = useMutation({ mutationFn: ({ path, body }: { path: string; body: unknown }) => api(path, { method: "PUT", body: JSON.stringify(body) }), onSuccess: done });
  const [ov, setOv] = useState({ action: "", agent_key: "", decision: "ALLOWED" as PolicyDecision, hours: 4 });
  const grant = useMutation({
    mutationFn: () => api("/agents/overrides", {
      method: "POST",
      body: JSON.stringify({ action: ov.action, agent_key: ov.agent_key || null, decision: ov.decision,
        expires_at: new Date(Date.now() + ov.hours * 3_600_000).toISOString() }),
    }),
    onSuccess: () => { done(); setOv({ ...ov, action: "" }); },
  });
  const revoke = useMutation({ mutationFn: (id: string) => api(`/agents/overrides/${id}/revoke`, { method: "POST" }), onSuccess: done });

  if (isLoading || !data) return <div className="h-48 animate-pulse rounded-2xl bg-ink-50" />;
  const kill = data.kill_switch;
  const labelOf = new Map(data.tools.map((t) => [t.action, t.label]));

  return (
    <div className="space-y-8">
      <section className={cn("flex flex-wrap items-center gap-4 rounded-2xl border p-5 transition-colors duration-300",
        kill ? "border-red-200 bg-red-50" : "border-ink-100 bg-white")}>
        <span className={cn("grid size-11 place-items-center rounded-xl transition-colors", kill ? "bg-red-600 text-white" : "bg-ink-50 text-ink-500")}>
          <Power className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-medium text-ink-900">Kill switch</h3>
          <p className="text-sm text-ink-500">{kill ? "On. AI cannot change data or contact anyone. Questions still work." : "Off. AI follows the rules below."}</p>
        </div>
        <button role="switch" aria-checked={kill} aria-label="Kill switch"
          onClick={() => put.mutate({ path: "/agents/kill-switch", body: { on: !kill } })}
          className={cn("relative h-7 w-12 rounded-full transition-colors duration-300", kill ? "bg-red-600" : "bg-ink-200")}>
          <span className={cn("absolute top-0.5 size-6 rounded-full bg-white shadow transition-all duration-300", kill ? "left-[1.375rem]" : "left-0.5")} />
        </button>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink-700">Agents</h3>
        <div className="divide-y divide-ink-50 rounded-2xl border border-ink-100 bg-white">
          {data.agents.map((a) => (
            <div key={a.key} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <label className="flex min-w-48 flex-1 items-center gap-2 text-sm text-ink-800">
                <input type="checkbox" checked={a.enabled} className="size-4 accent-brass-600"
                  onChange={(e) => put.mutate({ path: `/agents/${a.key}`, body: { enabled: e.target.checked, mode: a.mode } })} />
                {a.name}
              </label>
              <Segmented value={a.mode} options={MODES} disabled={!a.enabled}
                onChange={(mode) => put.mutate({ path: `/agents/${a.key}`, body: { enabled: a.enabled, mode } })} />
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-400">Suggest: proposes only. Ask first: changes wait for approval. Autonomous: runs what the rules below allow.</p>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-semibold text-ink-700">What AI may do</h3>
        <div className="divide-y divide-ink-50 rounded-2xl border border-ink-100 bg-white">
          {data.tools.map((t) => (
            <div key={t.action} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-48 flex-1">
                <div className="flex items-center gap-2 text-sm font-medium text-ink-900">
                  {t.label}
                  {t.is_destructive && <span className="rounded bg-red-50 px-1.5 text-[10px] font-semibold uppercase text-red-600">Destructive</span>}
                  {t.is_external && <span className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold uppercase text-amber-700">External</span>}
                  {!t.is_mutation && <span className="rounded bg-ink-50 px-1.5 text-[10px] font-semibold uppercase text-ink-400">Read only</span>}
                </div>
                <div className="text-xs text-ink-400">{t.description}</div>
              </div>
              <Segmented value={t.decision} options={DECISIONS} disabled={kill && t.is_mutation}
                onChange={(decision) => put.mutate({ path: `/agents/policies/${t.action}`, body: { decision } })} />
            </div>
          ))}
        </div>
        {put.isError && <p className="mt-2 text-xs text-red-600">{errorMessage(put.error)}</p>}
      </section>

      <section>
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-700"><Clock className="size-4" /> Temporary overrides</h3>
        <form onSubmit={(e) => { e.preventDefault(); if (ov.action) grant.mutate(); }}
          className="mb-3 flex flex-wrap gap-2 rounded-2xl border border-dashed border-ink-200 p-3">
          <select value={ov.action} onChange={(e) => setOv({ ...ov, action: e.target.value })} className={cn(control, "min-w-44 flex-1")} aria-label="Action">
            <option value="">Choose an action</option>
            {data.tools.filter((t) => t.is_mutation).map((t) => <option key={t.action} value={t.action}>{t.label}</option>)}
          </select>
          <select value={ov.agent_key} onChange={(e) => setOv({ ...ov, agent_key: e.target.value })} className={control} aria-label="Agent">
            <option value="">All agents</option>
            {data.agents.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
          </select>
          <select value={ov.decision} onChange={(e) => setOv({ ...ov, decision: e.target.value as PolicyDecision })} className={control} aria-label="Decision">
            <option value="ALLOWED">Allow</option>
            <option value="APPROVAL_REQUIRED">Ask first</option>
          </select>
          <select value={ov.hours} onChange={(e) => setOv({ ...ov, hours: Number(e.target.value) })} className={control} aria-label="Duration">
            {HOURS.map((h) => <option key={h} value={h}>for {h < 24 ? `${h} h` : `${h / 24} day${h > 24 ? "s" : ""}`}</option>)}
          </select>
          <Button size="sm" className="h-9" disabled={!ov.action || grant.isPending}>Grant</Button>
        </form>
        {grant.isError && <p className="mb-2 text-xs text-red-600">{errorMessage(grant.error)}</p>}
        {data.overrides.length ? (
          <div className="space-y-2">
            {data.overrides.map((o, i) => (
              <div key={o.id} style={{ animationDelay: `${i * 30}ms` }} className="flex animate-slide-up items-center gap-3 rounded-xl bg-ink-50 px-4 py-2.5 text-sm">
                <ShieldAlert className="size-4 shrink-0 text-brass-600" />
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-ink-900">{labelOf.get(o.action) ?? o.action}</span>
                  <span className="text-ink-500"> · {o.decision === "ALLOWED" ? "Allowed" : "Ask first"} · {o.agent_key ?? "all agents"}</span>
                </span>
                <span className="shrink-0 text-xs text-ink-400">until {new Date(o.expires_at).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span>
                <button onClick={() => revoke.mutate(o.id)} aria-label="End override" title="End now"
                  className="grid size-7 place-items-center rounded-md text-ink-300 hover:bg-white hover:text-red-600"><Trash2 className="size-3.5" /></button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-ink-300">No active overrides.</p>}
      </section>
    </div>
  );
}
