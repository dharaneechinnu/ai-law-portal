import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, ChevronDown, CircleCheck, Clock, Hand, Power, RotateCcw, ShieldAlert, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AgentControls, AgentInfo, PolicyDecision, ToolInfo } from "@/types";

const PERMS: [PolicyDecision, string, LucideIcon, string][] = [
  ["ALLOWED", "Always allow", CircleCheck, "bg-emerald-600 text-white"],
  ["APPROVAL_REQUIRED", "Needs approval", Hand, "bg-brass-500 text-white"],
  ["DISABLED", "Blocked", Ban, "bg-ink-800 text-white"],
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

type Put = (path: string, body: unknown, method?: string) => void;

function ToolGroup({ title, tools, scope, kill, put, hint }: {
  title: string; tools: ToolInfo[]; scope: string; kill: boolean; put: Put; hint?: string;
}) {
  const [open, setOpen] = useState(true);
  const decisions = new Set(tools.map((t) => t.decision));
  const all = decisions.size === 1 ? [...decisions][0] : "";
  const locked = kill && tools.some((t) => t.is_mutation);
  return (
    <div className="border-b border-ink-50 last:border-0">
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronDown className={cn("size-4 text-ink-400 transition-transform", !open && "-rotate-90")} />
          <span className="font-medium text-ink-900">{title}</span>
          <span className="rounded-md bg-ink-50 px-1.5 text-xs font-semibold text-ink-500">{tools.length}</span>
        </button>
        <select value={all} disabled={locked} aria-label={`${title}: set all`}
          onChange={(e) => e.target.value && put("/agents/policies", { actions: tools.map((t) => t.action), decision: e.target.value, agent_key: scope || null })}
          className={cn(control, "font-medium disabled:opacity-50")}>
          {!all && <option value="">Custom</option>}
          {PERMS.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
        </select>
      </div>
      {open && (
        <div className="pb-1">
          {tools.map((t) => (
            <div key={t.action} className="flex flex-wrap items-center gap-3 border-t border-ink-50 py-2.5 pl-10 pr-4">
              <div className="min-w-48 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-sm text-ink-800">
                  {t.label}
                  {t.is_destructive && <span className="rounded bg-red-50 px-1.5 text-[10px] font-semibold uppercase text-red-600">Destructive</span>}
                  {t.is_external && <span className="rounded bg-amber-50 px-1.5 text-[10px] font-semibold uppercase text-amber-700">External</span>}
                  {scope && !t.inherited && (
                    <button onClick={() => put(`/agents/policies/${t.action}?agent_key=${scope}`, undefined, "DELETE")}
                      title="Use the rule for all agents again"
                      className="inline-flex items-center gap-0.5 rounded bg-brass-100 px-1.5 text-[10px] font-semibold uppercase text-brass-700 hover:brightness-95">
                      Agent rule <RotateCcw className="size-2.5" />
                    </button>
                  )}
                </div>
                <div className="text-xs text-ink-400">{t.description}</div>
              </div>
              <div className={cn("inline-flex gap-0.5 rounded-lg bg-ink-50 p-0.5", kill && t.is_mutation && "opacity-50")} role="radiogroup" aria-label={t.label}>
                {PERMS.map(([v, label, Icon, active]) => (
                  <button key={v} role="radio" aria-checked={t.decision === v} aria-label={label} title={label}
                    disabled={kill && t.is_mutation}
                    onClick={() => v !== t.decision && put(`/agents/policies/${t.action}`, { decision: v, agent_key: scope || null })}
                    className={cn("grid size-8 place-items-center rounded-md transition-all duration-200",
                      t.decision === v ? cn(active, "shadow-sm") : "text-ink-400 hover:bg-white hover:text-ink-700")}>
                    <Icon className="size-4" />
                  </button>
                ))}
              </div>
            </div>
          ))}
          {hint && <p className="px-10 pb-2 pt-1 text-xs text-ink-400">{hint}</p>}
        </div>
      )}
    </div>
  );
}

/** Per-tool permissions, firm-wide or for one agent. The server enforces them on every agent action. */
function ToolPermissions({ agents, kill }: { agents: AgentInfo[]; kill: boolean }) {
  const qc = useQueryClient();
  const [scope, setScope] = useState("");
  const { data } = useQuery({
    queryKey: ["agent-controls", scope],
    queryFn: () => api<AgentControls>(`/agents/controls${scope ? `?agent_key=${scope}` : ""}`),
  });
  const save = useMutation({
    mutationFn: ({ path, body, method }: { path: string; body: unknown; method: string }) =>
      api(path, { method, body: body === undefined ? undefined : JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent-controls"] }),
  });
  const put: Put = (path, body, method = "PUT") => save.mutate({ path, body, method });
  const tools = data?.tools ?? [];
  const mode = agents.find((a) => a.key === scope)?.mode;

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-end gap-3">
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-ink-700">Tool permissions</h3>
          <p className="text-xs text-ink-400">Choose when AI is allowed to use these tools.</p>
        </div>
        <select value={scope} onChange={(e) => setScope(e.target.value)} className={control} aria-label="Applies to">
          <option value="">All agents</option>
          {agents.map((a) => <option key={a.key} value={a.key}>{a.name}</option>)}
        </select>
      </div>
      {!data ? <div className="h-48 animate-pulse rounded-2xl bg-ink-50" /> : (
        <div className="rounded-2xl border border-ink-100 bg-white">
          <ToolGroup title="Read-only tools" tools={tools.filter((t) => !t.is_mutation)} scope={scope} kill={kill} put={put} />
          <ToolGroup title="Write/delete tools" tools={tools.filter((t) => t.is_mutation)} scope={scope} kill={kill} put={put}
            hint={mode === "autonomous" || (!scope && agents.every((a) => a.mode === "autonomous")) ? undefined
              : `“Always allow” still asks first while ${scope ? "this agent is" : "an agent is"} in Suggest or Ask-first mode (see Agents above).`} />
        </div>
      )}
      {save.isError && <p className="mt-2 text-xs text-red-600">{errorMessage(save.error)}</p>}
      <p className="mt-2 text-xs text-ink-400">
        {scope ? "Rules set here apply to this agent only; tagged tools override the all-agents rule." : "These rules apply to every agent unless an agent has its own rule."}
      </p>
    </section>
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

      <ToolPermissions agents={data.agents} kill={kill} />

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
