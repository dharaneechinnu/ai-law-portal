import { useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Briefcase, CalendarClock, FileText, Lock, Pencil, Send, Sparkles, Trash2, Upload, UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, control } from "@/components/ui/drawer";
import { EmptyState, PageHero } from "@/components/ui/page";
import { initials, roleMeta } from "@/features/admin/roles";
import { PRIORITY_TONE } from "./MattersPage";
import { cn } from "@/lib/utils";
import { api, apiFetch, errorMessage } from "@/services/api";
import type { AskResult, Client, DocumentRow, Matter, Member, TimelineEvent, UserBrief } from "@/types";
import { AuditLog } from "@/features/ai/AuditLog";
import { HearingsTab } from "@/features/calendar/HearingsTab";
import { TaskList } from "@/features/tasks/TaskList";
import { MatterLegalTab } from "@/features/legal-intelligence/LegalPage";

const TABS = [
  "Overview", "Documents", "Ask AI", "Timeline", "Team",
  "Tasks", "Hearings", "Legal Intelligence", "Communications", "AI Activity",
] as const;
type Tab = (typeof TABS)[number];

// Tabs whose backing feature lands in a later sprint.
const LATER: Partial<Record<Tab, string>> = {
  Communications: "Emails and meeting notes tied to this matter will show here.",
};

const card = "rounded-[20px] border border-ink-100 bg-white p-5";
const STATUSES = ["active", "closed", "archived"];
const PRIORITIES = ["low", "medium", "high", "urgent"];

function Overview({ m }: { m: Matter }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<UserBrief[]>("/auth/users") });
  const [f, setF] = useState({
    title: m.title, case_number: m.case_number ?? "", court: m.court ?? "", jurisdiction: m.jurisdiction ?? "",
    practice_area: m.practice_area ?? "", status: m.status, priority: m.priority,
    assigned_lawyer_id: m.assigned_lawyer_id ?? "", description: m.description ?? "",
    legal_issues: m.legal_issues.join(", "),
    restricted: m.restricted,
  });
  const set = (k: Exclude<keyof typeof f, "restricted">) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () =>
      api<Matter>(`/matters/${m.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          ...f,
          assigned_lawyer_id: f.assigned_lawyer_id || null,
          legal_issues: f.legal_issues.split(",").map((x) => x.trim()).filter(Boolean),
        }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matter", m.id] });
      qc.invalidateQueries({ queryKey: ["matters"] });
      qc.invalidateQueries({ queryKey: ["timeline", m.id] });
      setEditing(false);
    },
  });
  const lawyer = users.find((u) => u.id === m.assigned_lawyer_id)?.name;

  if (editing) {
    return (
      <form className={cn(card, "grid gap-4 animate-fade-up")} onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Label text="Title"><input className={control} required value={f.title} onChange={set("title")} /></Label>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Label text="Case number"><input className={control} value={f.case_number} onChange={set("case_number")} /></Label>
          <Label text="Court"><input className={control} value={f.court} onChange={set("court")} /></Label>
          <Label text="Jurisdiction"><input className={control} value={f.jurisdiction} onChange={set("jurisdiction")} /></Label>
          <Label text="Practice area"><input className={control} value={f.practice_area} onChange={set("practice_area")} /></Label>
          <Label text="Status"><select className={cn(control, "capitalize")} value={f.status} onChange={set("status")}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select></Label>
          <Label text="Priority"><select className={cn(control, "capitalize")} value={f.priority} onChange={set("priority")}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select></Label>
          <Label text="Assigned lawyer">
            <select className={control} value={f.assigned_lawyer_id} onChange={set("assigned_lawyer_id")}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </Label>
          <Label text="Legal issues (comma separated)" className="sm:col-span-2"><input className={control} value={f.legal_issues} onChange={set("legal_issues")} /></Label>
        </div>
        <Label text="Description"><textarea className={cn(control, "h-24 py-2")} value={f.description} onChange={set("description")} /></Label>
        <label className="flex items-start gap-2.5 rounded-xl bg-ink-50 p-3 text-sm">
          <input type="checkbox" className="mt-0.5 size-4 accent-ink-900" checked={f.restricted} onChange={(e) => setF({ ...f, restricted: e.target.checked })} />
          <span>
            <span className="font-semibold text-ink-900">Restricted</span>
            <span className="block text-ink-500">Only admins, the assigned lawyer and team members can open this matter.</span>
          </span>
        </label>
        {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    );
  }
  const rows: [string, string | null | undefined][] = [
    ["Matter ID", m.matter_number], ["Case number", m.case_number], ["Court", m.court],
    ["Jurisdiction", m.jurisdiction], ["Practice area", m.practice_area], ["Priority", m.priority],
    ["Status", m.status], ["Assigned lawyer", lawyer], ["Legal issues", m.legal_issues.join(", ")],
    ["Access", m.restricted ? "Restricted to team" : "Firm (partners and team)"],
  ];
  return (
    <div className="grid animate-fade-up gap-4 lg:grid-cols-[1.4fr_1fr]">
      <section className={card}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-serif text-lg font-bold text-ink-900">Details</h2>
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}><Pencil className="size-3.5" /> Edit</Button>
        </div>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {rows.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs font-medium text-ink-400">{k}</dt>
              <dd className="mt-0.5 font-medium text-ink-900 first-letter:uppercase">{v || "—"}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={card}>
        <h2 className="mb-3 font-serif text-lg font-bold text-ink-900">Summary</h2>
        {m.description ? <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-700">{m.description}</p>
          : <p className="text-sm text-ink-400">No description yet. Use Edit to add one.</p>}
        {m.legal_issues.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {m.legal_issues.map((x) => <span key={x} className="rounded-full bg-brass-100 px-2.5 py-1 text-xs font-medium text-brass-700">{x}</span>)}
          </div>
        )}
      </section>
    </div>
  );
}

function Team({ id }: { id: string }) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState("");
  const { data: members = [] } = useQuery({ queryKey: ["members", id], queryFn: () => api<Member[]>(`/matters/${id}/members`) });
  const { data: users = [] } = useQuery({ queryKey: ["users"], queryFn: () => api<UserBrief[]>("/auth/users") });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["members", id] }); qc.invalidateQueries({ queryKey: ["timeline", id] }); };
  const add = useMutation({
    mutationFn: () => api<Member>(`/matters/${id}/members`, { method: "POST", body: JSON.stringify({ user_id: userId }) }),
    onSuccess: () => { setUserId(""); refresh(); },
  });
  const remove = useMutation({
    mutationFn: (mid: string) => apiFetch(`/matters/${id}/members/${mid}`, { method: "DELETE" }),
    onSuccess: refresh,
  });
  const available = users.filter((u) => !members.some((m) => m.user_id === u.id));
  return (
    <div className={cn(card, "animate-fade-up space-y-4")}>
      <div className="flex flex-wrap gap-2">
        <select className={cn(control, "h-10 flex-1")} value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="Team member to add">
          <option value="">Add a team member…</option>
          {available.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role_name})</option>)}
        </select>
        <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}><UserPlus className="size-4" /> Add</Button>
      </div>
      {add.isError && <p className="text-sm text-red-600">{errorMessage(add.error)}</p>}
      {members.length === 0 ? <EmptyState kind="people" title="No team members yet" hint="Add the people working on this matter." /> : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {members.map((m, i) => (
            <li key={m.id} style={{ animationDelay: `${i * 40}ms` }} className="group flex animate-slide-up items-center gap-3 rounded-2xl border border-ink-100 p-3 transition hover:border-ink-200">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-snow", roleMeta(m.role).avatar)}>{initials(m.name)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink-900">{m.name}</span>
                <span className="block truncate text-xs text-ink-400">{m.email}</span>
              </span>
              <button onClick={() => remove.mutate(m.id)} aria-label={`Remove ${m.name}`} title="Remove"
                className="grid size-8 place-items-center rounded-lg text-ink-300 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 group-hover:opacity-100">
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Later({ tab }: { tab: Tab }) {
  return (
    <div className={cn(card, "animate-fade-up")}>
      <EmptyState kind="inbox" title={`${tab} coming soon`} hint={LATER[tab]} />
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const { data = [] } = useQuery({ queryKey: ["timeline", id], queryFn: () => api<TimelineEvent[]>(`/matters/${id}/timeline`) });
  if (!data.length) return <div className={card}><EmptyState kind="calendar" title="Nothing on the timeline yet" /></div>;
  return (
    <div className={cn(card, "animate-fade-up")}>
      <ol className="relative ml-2 space-y-5 border-l-2 border-ink-100 pl-6">
        {data.map((e, i) => (
          <li key={e.id} style={{ animationDelay: `${i * 40}ms` }} className="relative animate-slide-up text-sm">
            <span className={cn("absolute -left-[33px] top-0.5 size-4 rounded-full border-[3px] border-white ring-2",
              i === 0 ? "bg-brass-400 ring-brass-300" : "bg-ink-300 ring-ink-100")} />
            <div className="font-semibold text-ink-900">{e.title}</div>
            <div className="mt-0.5 text-xs text-ink-400">{new Date(e.occurred_at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Documents({ id }: { id: string }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const { data = [] } = useQuery({
    queryKey: ["documents", id],
    queryFn: () => api<DocumentRow[]>(`/matters/${id}/documents`),
    // poll while any document is still being indexed
    refetchInterval: (q) => (q.state.data?.some((d) => d.status === "uploaded" || d.status === "processing") ? 2000 : false),
  });
  const upload = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch(`/matters/${id}/documents`, { method: "POST", body: fd });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents", id] }); qc.invalidateQueries({ queryKey: ["timeline", id] }); },
  });
  const [over, setOver] = useState(false);
  const pick = (files?: FileList | null) => { if (files?.[0]) upload.mutate(files[0]); };
  return (
    <div className="grid animate-fade-up gap-4 lg:grid-cols-[1fr_1.6fr]">
      <button type="button" onClick={() => fileRef.current?.click()} disabled={upload.isPending}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); pick(e.dataTransfer.files); }}
        className={cn("flex min-h-48 flex-col items-center justify-center gap-2 rounded-[20px] border-2 border-dashed p-6 text-center transition",
          over ? "border-brass-400 bg-brass-100/50" : "border-ink-200 bg-white hover:border-brass-300 hover:bg-brass-100/20")}>
        <span className={cn("grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300 transition", over && "scale-110")}>
          <Upload className={cn("size-5", upload.isPending && "animate-bounce")} />
        </span>
        <span className="font-semibold text-ink-900">{upload.isPending ? "Uploading…" : "Drop a file or click to upload"}</span>
        <span className="text-xs text-ink-400">PDF, DOCX or TXT. Indexed for Ask AI.</span>
      </button>
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" hidden onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
      <div className={card}>
        <h2 className="mb-3 font-serif text-lg font-bold text-ink-900">Documents <span className="font-sans text-sm font-medium text-ink-400">{data.length}</span></h2>
        {upload.isError && <p className="mb-2 text-sm text-red-600">{errorMessage(upload.error)}</p>}
        {data.length === 0 ? <EmptyState kind="docs" title="No documents yet" hint="Upload pleadings, contracts or orders." /> : (
          <ul className="space-y-2">
            {data.map((d, i) => {
              const busy = d.status === "uploaded" || d.status === "processing";
              return (
                <li key={d.id} style={{ animationDelay: `${i * 40}ms` }} className="relative animate-slide-up overflow-hidden rounded-xl border border-ink-100 px-3 py-2.5 text-sm">
                  {busy && <span className="absolute inset-0 animate-shimmer bg-[linear-gradient(90deg,transparent,rgba(230,199,122,0.18),transparent)] bg-[length:200%_100%]" />}
                  <div className="relative flex items-center gap-3">
                    <FileText className="size-5 shrink-0 text-ink-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink-900">{d.filename}</span>
                      <span className="text-xs text-ink-400">{d.size_bytes < 1024 ? `${d.size_bytes} B` : `${Math.round(d.size_bytes / 1024)} KB`}{d.page_count ? ` · ${d.page_count} pages` : ""}</span>
                    </span>
                    <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
                      d.status === "ready" ? "bg-emerald-50 text-emerald-700" : d.status === "failed" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700")}>
                      {busy ? "Indexing" : d.status}
                    </span>
                  </div>
                  {d.error && <p className="relative mt-1 text-xs text-red-600">{d.error}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

function AskAI({ id }: { id: string }) {
  const [q, setQ] = useState("");
  const ask = useMutation({
    mutationFn: () => api<AskResult>(`/matters/${id}/ask`, { method: "POST", body: JSON.stringify({ question: q }) }),
  });
  const SUGGEST = ["What are the key dates?", "Summarise the claims", "What relief is sought?"];
  return (
    <div className={cn(card, "animate-fade-up space-y-4")}>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask.mutate(); }}>
        <div className="relative flex-1">
          <Sparkles className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brass-500" />
          <input className="h-11 w-full rounded-xl border border-ink-100 bg-white pl-9 pr-3 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25"
            placeholder="Ask about this matter's documents…" aria-label="Question" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Button type="submit" className="h-11" disabled={ask.isPending || !q.trim()}><Send className="size-4" /> Ask</Button>
      </form>
      {!ask.data && !ask.isPending && (
        <div className="flex flex-wrap gap-2">
          {SUGGEST.map((x) => (
            <button key={x} onClick={() => setQ(x)} className="rounded-full border border-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:-translate-y-0.5 hover:border-brass-300 hover:text-brass-700">{x}</button>
          ))}
        </div>
      )}
      {ask.isPending && (
        <div className="space-y-2 rounded-2xl bg-ink-50 p-4" aria-live="polite">
          <div className="flex items-center gap-2 text-xs font-medium text-ink-500">
            <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-400" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
            Reading the documents
          </div>
          {[90, 75, 60].map((w) => <div key={w} className="h-3 animate-shimmer rounded bg-[linear-gradient(90deg,var(--color-ink-100),var(--color-ink-50),var(--color-ink-100))] bg-[length:200%_100%]" style={{ width: `${w}%` }} />)}
        </div>
      )}
      {ask.isError && <p className="text-sm text-red-600">{errorMessage(ask.error)}</p>}
      {ask.data && (
        <div className="animate-fade-up space-y-3">
          <div className="whitespace-pre-wrap rounded-2xl bg-ink-50 p-4 text-sm leading-relaxed text-ink-900">{ask.data.answer}</div>
          {ask.data.citations.length > 0 && <div className="text-xs font-semibold uppercase tracking-wider text-ink-400">Sources</div>}
          <div className="grid gap-2 md:grid-cols-2">
            {ask.data.citations.map((c, i) => (
              <div key={i} style={{ animationDelay: `${i * 60}ms` }} className="animate-slide-up rounded-xl border border-ink-100 p-3 text-xs">
                <div className="font-semibold text-ink-900"><span className="mr-1 rounded bg-brass-100 px-1.5 py-0.5 text-brass-700">{i + 1}</span>{c.filename}{c.page_number ? `, page ${c.page_number}` : ""}</div>
                <div className="mt-1.5 text-ink-500">{c.excerpt}…</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-ink-400">AI analysis of your documents, not legal advice.</p>
        </div>
      )}
    </div>
  );
}

export function MatterDetail() {
  const { id = "" } = useParams();
  const [params, setParams] = useSearchParams();
  const tab: Tab = (TABS as readonly string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "Overview";
  const setTab = (t: Tab) => setParams(t === "Overview" ? {} : { tab: t }, { replace: true });
  const { data: m, isError } = useQuery({ queryKey: ["matter", id], queryFn: () => api<Matter>(`/matters/${id}`) });
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  if (isError) return <EmptyState kind="search" title="Matter not found" hint="It may have been removed, or you don't have access." action={<Link to="/matters" className="text-sm font-semibold text-brass-700">Back to matters</Link>} />;
  if (!m) return <div className="h-40 animate-pulse rounded-3xl bg-ink-100/60" />;
  const client = clients.find((c) => c.id === m.client_id)?.name;
  const badge = "rounded-full px-2.5 py-1 text-xs font-semibold capitalize";
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Briefcase} title={m.title}
        eyebrow={<Link to="/matters" className="inline-flex items-center gap-1 hover:text-brass-200"><ArrowLeft className="size-3" /> Matters · {m.matter_number}</Link>}
        sub={[client, m.court, m.practice_area].filter(Boolean).join(" · ") || "No client or court yet"}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn(badge, PRIORITY_TONE[m.priority] ?? PRIORITY_TONE.low)}>{m.priority}</span>
          <span className={cn(badge, "bg-snow/10 text-snow ring-1 ring-snow/15")}>{m.status}</span>
          {m.restricted && <span className={cn(badge, "flex items-center gap-1 bg-snow/10 text-snow ring-1 ring-snow/15")}><Lock className="size-3" /> Restricted</span>}
          {m.next_hearing && (
            <span className={cn(badge, "flex items-center gap-1 bg-brass-300/20 normal-case text-brass-200")}>
              <CalendarClock className="size-3" /> Next hearing {new Date(m.next_hearing).toLocaleDateString([], { day: "numeric", month: "short" })}
            </span>
          )}
        </div>
      </PageHero>

      <div role="tablist" aria-label="Matter sections" className="-mx-1 flex gap-1 overflow-x-auto border-b border-ink-100 px-1">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={cn("relative shrink-0 px-3.5 py-3 text-sm font-semibold transition-colors",
              tab === t ? "text-ink-900" : "text-ink-400 hover:text-ink-700")}>
            {t}
            <span className={cn("absolute inset-x-2 -bottom-px h-[3px] rounded-full bg-gradient-to-r from-brass-300 to-brass-500 transition-transform duration-300",
              tab === t ? "scale-x-100" : "scale-x-0")} />
          </button>
        ))}
      </div>

      <div key={tab} className="animate-fade-in">
        {tab === "Overview" && <Overview m={m} />}
        {tab === "Timeline" && <Timeline id={id} />}
        {tab === "Documents" && <Documents id={id} />}
        {tab === "Ask AI" && <AskAI id={id} />}
        {tab === "Team" && <Team id={id} />}
        {tab === "Legal Intelligence" && <div className={card}><MatterLegalTab id={id} /></div>}
        {tab === "Tasks" && <div className={card}><TaskList matterId={id} /></div>}
        {tab === "Hearings" && <div className={card}><HearingsTab matterId={id} /></div>}
        {tab === "AI Activity" && <div className={card}><AuditLog matterId={id} /></div>}
        {LATER[tab] && <Later tab={tab} />}
      </div>
    </div>
  );
}
