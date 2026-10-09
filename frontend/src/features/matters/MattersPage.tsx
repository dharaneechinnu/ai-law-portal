import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, CalendarClock, Lock, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, Label, control } from "@/components/ui/drawer";
import { EmptyState, PageHero, Tabs, heroButton } from "@/components/ui/page";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Client, Matter } from "@/types";

const STATUS_TABS = [["active", "Active"], ["closed", "Closed"], ["archived", "Archived"], ["all", "All"]] as const;
type StatusTab = (typeof STATUS_TABS)[number][0];

export const PRIORITY_TONE: Record<string, string> = {
  urgent: "bg-red-50 text-red-700", high: "bg-amber-50 text-amber-700", medium: "bg-sky-50 text-sky-700", low: "bg-ink-50 text-ink-500",
};
const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-700", closed: "bg-ink-50 text-ink-500", archived: "bg-ink-50 text-ink-400",
};

const fmtDay = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { day: "numeric", month: "short" }) : "";

function NewMatterDrawer({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const [form, setForm] = useState({ title: "", case_number: "", court: "", practice_area: "", priority: "medium", description: "" });
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: async () => {
      let cid = clientId;
      if (!cid) {
        const c = await api<Client>("/clients", { method: "POST", body: JSON.stringify({ name: newClient.trim() }) });
        cid = c.id;
      }
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v));
      return api<Matter>("/matters", { method: "POST", body: JSON.stringify({ ...body, client_id: cid }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matters"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      onClose();
    },
  });
  const ready = form.title.trim() && (clientId || newClient.trim());

  return (
    <Drawer title="New matter" onClose={onClose}
      footer={<>
        <Button type="submit" form="new-matter" disabled={!ready || create.isPending}>{create.isPending ? "Creating…" : "Create matter"}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>
      <form id="new-matter" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (ready) create.mutate(); }}>
        <Label text="Title"><input className={control} autoFocus required value={form.title} onChange={set("title")} placeholder="Sharma v. Kapoor Builders" /></Label>
        <Label text="Client">
          <select className={control} value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">New client…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Label>
        {!clientId && (
          <Label text="New client name"><input className={control} required value={newClient} onChange={(e) => setNewClient(e.target.value)} /></Label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Label text="Case number"><input className={control} value={form.case_number} onChange={set("case_number")} /></Label>
          <Label text="Priority">
            <select className={control} value={form.priority} onChange={set("priority")}>
              {["low", "medium", "high", "urgent"].map((p) => <option key={p} value={p} className="capitalize">{p}</option>)}
            </select>
          </Label>
        </div>
        <Label text="Court"><input className={control} value={form.court} onChange={set("court")} placeholder="Delhi High Court" /></Label>
        <Label text="Practice area"><input className={control} value={form.practice_area} onChange={set("practice_area")} placeholder="Real estate" /></Label>
        <Label text="Description"><textarea className={cn(control, "h-24 py-2")} value={form.description} onChange={set("description")} /></Label>
        {create.isError && <p className="text-sm text-red-600">{errorMessage(create.error)}</p>}
      </form>
    </Drawer>
  );
}

export function MattersPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const creating = params.get("new") === "1";
  const setCreating = (on: boolean) => setParams(on ? { new: "1" } : {}, { replace: true });
  const [status, setStatus] = useState<StatusTab>("active");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(false);
  const { data: matters = [], isLoading } = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters") });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const clientName = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const count = (s: StatusTab) => (s === "all" ? matters.length : matters.filter((m) => m.status === s).length);
  const needle = q.trim().toLowerCase();
  const list = matters.filter((m) =>
    (status === "all" || m.status === status)
    && (!mine || m.assigned_lawyer_id === user?.id)
    && (!needle || [m.title, m.matter_number, m.case_number, m.court, clientName.get(m.client_id)]
      .some((v) => v?.toLowerCase().includes(needle))));

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Briefcase} eyebrow="Work" title="Matters"
        sub={`${count("active")} active ${count("active") === 1 ? "matter" : "matters"}. Open one to see documents, tasks, hearings and AI answers.`}
        actions={<button className={heroButton} onClick={() => setCreating(true)}><Plus className="size-4" /> New matter</button>} />

      <div className="flex flex-wrap items-center gap-3">
        <Tabs label="Status" value={status} onChange={setStatus}
          items={STATUS_TABS.map(([k, label]) => [k, <>{label}<span className="text-xs opacity-60">{count(k)}</span></>] as const)} />
        <div className="relative ml-auto w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by title, client, court…" aria-label="Filter matters"
            className="h-11 w-full rounded-xl border border-ink-100 bg-white pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
        </div>
        <label className="flex h-11 cursor-pointer items-center gap-2 rounded-xl border border-ink-100 bg-white px-3 text-sm font-medium text-ink-700">
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="size-4 accent-ink-900" /> Only mine
        </label>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-ink-100 bg-white">
        {isLoading && <div className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-ink-50" />)}</div>}
        {!isLoading && list.length === 0 && (
          <EmptyState kind={matters.length ? "search" : "docs"} className="py-12"
            title={matters.length ? "No matters match" : "No matters yet"}
            hint={matters.length ? "Try another filter or status." : "Create the first matter for a client."}
            action={!matters.length && <Button onClick={() => setCreating(true)}><Plus className="size-4" /> New matter</Button>} />
        )}
        {list.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-ink-50 text-left text-xs font-semibold uppercase tracking-wider text-ink-400">
                  <th className="px-5 py-3">Matter</th><th className="px-3 py-3">Client</th><th className="px-3 py-3">Court</th>
                  <th className="px-3 py-3">Next hearing</th><th className="px-3 py-3">Priority</th><th className="px-5 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((m, i) => (
                  <tr key={m.id} style={{ animationDelay: `${i * 30}ms` }} className="group animate-slide-up border-b border-ink-50 last:border-0 transition hover:bg-ink-50/70">
                    <td className="px-5 py-3">
                      <Link to={`/matters/${m.id}`} className="flex items-center gap-3">
                        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300 transition group-hover:scale-105">
                          <Briefcase className="size-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 font-semibold text-ink-900 group-hover:text-brass-700">
                            <span className="truncate">{m.title}</span>{m.restricted && <Lock className="size-3.5 shrink-0 text-ink-400" aria-label="Restricted" />}
                          </span>
                          <span className="block text-xs text-ink-400">{m.matter_number}{m.case_number && ` · ${m.case_number}`}</span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-3 py-3 text-ink-700">{clientName.get(m.client_id) ?? "—"}</td>
                    <td className="px-3 py-3 text-ink-700">{m.court ?? "—"}</td>
                    <td className="px-3 py-3 text-ink-700">
                      {m.next_hearing ? <span className="flex items-center gap-1.5"><CalendarClock className="size-3.5 text-brass-600" />{fmtDay(m.next_hearing)}</span> : "—"}
                    </td>
                    <td className="px-3 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", PRIORITY_TONE[m.priority] ?? PRIORITY_TONE.low)}>{m.priority}</span></td>
                    <td className="px-5 py-3"><span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize", STATUS_TONE[m.status] ?? STATUS_TONE.closed)}>{m.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <NewMatterDrawer onClose={() => setCreating(false)} />}
    </div>
  );
}
