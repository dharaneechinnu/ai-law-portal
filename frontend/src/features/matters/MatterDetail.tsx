import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { AskResult, DocumentRow, Matter, Member, TimelineEvent, UserBrief } from "@/types";
import { MatterLegalTab } from "@/features/legal-intelligence/LegalPage";

const TABS = [
  "Overview", "Documents", "Ask AI", "Timeline", "Team",
  "Tasks", "Hearings", "Legal Intelligence", "Communications", "AI Activity",
] as const;
type Tab = (typeof TABS)[number];

// Tabs whose backing feature lands in a later sprint.
const LATER: Partial<Record<Tab, [string, string]>> = {
  Tasks: ["Sprint 3", "Tasks linked to this matter, with assignees and due dates."],
  Hearings: ["Sprint 3", "Hearings and calendar events for this matter."],
  Communications: ["Sprint 3", "Emails and meeting notes tied to this matter."],
  "AI Activity": ["Sprint 4", "Agent actions, approvals and policy decisions for this matter."],
};

const input = "rounded-md border px-3 py-2 text-sm";
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
  });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
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
      <form className="grid max-w-2xl gap-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <input className={input} required placeholder="Title" value={f.title} onChange={set("title")} />
        <div className="grid grid-cols-2 gap-3">
          <input className={input} placeholder="Case number" value={f.case_number} onChange={set("case_number")} />
          <input className={input} placeholder="Court" value={f.court} onChange={set("court")} />
          <input className={input} placeholder="Jurisdiction" value={f.jurisdiction} onChange={set("jurisdiction")} />
          <input className={input} placeholder="Practice area" value={f.practice_area} onChange={set("practice_area")} />
          <select className={input} value={f.status} onChange={set("status")}>{STATUSES.map((x) => <option key={x}>{x}</option>)}</select>
          <select className={input} value={f.priority} onChange={set("priority")}>{PRIORITIES.map((x) => <option key={x}>{x}</option>)}</select>
          <select className={input} value={f.assigned_lawyer_id} onChange={set("assigned_lawyer_id")}>
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        </div>
        <input className={input} placeholder="Legal issues (comma separated)" value={f.legal_issues} onChange={set("legal_issues")} />
        <textarea className={input} placeholder="Description" value={f.description} onChange={set("description")} />
        {save.isError && <p className="text-sm text-red-600">{String(save.error)}</p>}
        <div className="flex gap-2">
          <Button type="submit" disabled={save.isPending}>Save</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
        </div>
      </form>
    );
  }
  const rows: [string, string | null | undefined][] = [
    ["Matter ID", m.matter_number], ["Case number", m.case_number], ["Court", m.court],
    ["Jurisdiction", m.jurisdiction], ["Practice area", m.practice_area], ["Priority", m.priority],
    ["Status", m.status], ["Assigned lawyer", lawyer], ["Legal issues", m.legal_issues.join(", ")],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd>{v || "—"}</dd></div>
        ))}
      </dl>
      {m.description && <p className="max-w-xl text-sm">{m.description}</p>}
      <Button variant="outline" onClick={() => setEditing(true)}>Edit matter</Button>
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
    mutationFn: (mid: string) => fetch(`/api/matters/${id}/members/${mid}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
    }),
    onSuccess: refresh,
  });
  const available = users.filter((u) => !members.some((m) => m.user_id === u.id));
  return (
    <div className="max-w-xl space-y-4">
      <div className="flex gap-2">
        <select className={`${input} flex-1`} value={userId} onChange={(e) => setUserId(e.target.value)}>
          <option value="">Add a team member…</option>
          {available.map((u) => <option key={u.id} value={u.id}>{u.name} ({u.role_name})</option>)}
        </select>
        <Button disabled={!userId || add.isPending} onClick={() => add.mutate()}>Add</Button>
      </div>
      {add.isError && <p className="text-sm text-red-600">{String(add.error)}</p>}
      <div className="divide-y rounded-lg border bg-white">
        {members.length === 0 && <p className="p-4 text-sm text-slate-500">No team members yet.</p>}
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between p-3 text-sm">
            <div><div className="font-medium">{m.name}</div><div className="text-xs text-slate-500">{m.email}</div></div>
            <Button variant="ghost" size="sm" onClick={() => remove.mutate(m.id)}>Remove</Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function Later({ tab }: { tab: Tab }) {
  const [sprint, hint] = LATER[tab]!;
  return (
    <div className="max-w-xl rounded-lg border border-dashed bg-white p-6 text-sm">
      <div className="font-medium">{tab}</div>
      <p className="mt-1 text-slate-500">{hint} Arrives in {sprint}.</p>
    </div>
  );
}

function Timeline({ id }: { id: string }) {
  const { data = [] } = useQuery({ queryKey: ["timeline", id], queryFn: () => api<TimelineEvent[]>(`/matters/${id}/timeline`) });
  return (
    <ol className="max-w-xl space-y-3 border-l pl-4">
      {data.map((e) => (
        <li key={e.id} className="text-sm">
          <div className="font-medium">{e.title}</div>
          <div className="text-xs text-slate-500">{new Date(e.occurred_at).toLocaleString()}</div>
        </li>
      ))}
    </ol>
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
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/matters/${id}/documents`, {
        method: "POST", body: fd, headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error(await res.text());
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["documents", id] }); qc.invalidateQueries({ queryKey: ["timeline", id] }); },
  });
  return (
    <div className="max-w-2xl space-y-4">
      <input ref={fileRef} type="file" accept=".pdf,.docx,.txt" hidden
        onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])} />
      <Button onClick={() => fileRef.current?.click()} disabled={upload.isPending}>Upload document</Button>
      {upload.isError && <p className="text-sm text-red-600">{String(upload.error)}</p>}
      <div className="divide-y rounded-lg border bg-white">
        {data.length === 0 && <p className="p-4 text-sm text-slate-500">No documents uploaded.</p>}
        {data.map((d) => (
          <div key={d.id} className="p-3 text-sm">
            <div className="flex items-center justify-between">
              <span>{d.filename}</span>
              <span className={cn("rounded px-2 py-0.5 text-xs", d.status === "ready" ? "bg-green-100" : d.status === "failed" ? "bg-red-100" : "bg-amber-100")}>{d.status}</span>
            </div>
            {d.error && <p className="mt-1 text-xs text-red-600">{d.error}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function AskAI({ id }: { id: string }) {
  const [q, setQ] = useState("");
  const ask = useMutation({
    mutationFn: () => api<AskResult>(`/matters/${id}/ask`, { method: "POST", body: JSON.stringify({ question: q }) }),
  });
  return (
    <div className="max-w-2xl space-y-4">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask.mutate(); }}>
        <input className="flex-1 rounded-md border px-3 py-2 text-sm" placeholder="Ask about this matter's documents…"
          value={q} onChange={(e) => setQ(e.target.value)} />
        <Button type="submit" disabled={ask.isPending}>{ask.isPending ? "Thinking…" : "Ask"}</Button>
      </form>
      {ask.isError && <p className="text-sm text-red-600">{String(ask.error).replace(/^Error: \d+ /, "")}</p>}
      {ask.data && (
        <div className="space-y-3">
          <div className="whitespace-pre-wrap rounded-lg border bg-white p-4 text-sm">{ask.data.answer}</div>
          <div className="text-xs font-medium text-slate-500">Sources</div>
          {ask.data.citations.map((c, i) => (
            <div key={i} className="rounded border bg-white p-3 text-xs">
              <div className="font-medium">[{i + 1}] {c.filename}{c.page_number ? `, page ${c.page_number}` : ""}</div>
              <div className="mt-1 text-slate-600">{c.excerpt}…</div>
            </div>
          ))}
          <p className="text-xs text-slate-400">AI-generated analysis of your documents; not legal advice.</p>
        </div>
      )}
    </div>
  );
}

export function MatterDetail() {
  const { id = "" } = useParams();
  const [tab, setTab] = useState<Tab>("Overview");
  const { data: m } = useQuery({ queryKey: ["matter", id], queryFn: () => api<Matter>(`/matters/${id}`) });
  if (!m) return null;
  return (
    <div>
      <h1 className="text-xl font-semibold">{m.title}</h1>
      <p className="mb-4 text-sm text-slate-500">{m.matter_number}</p>
      <div className="mb-6 flex flex-wrap gap-1 border-b">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={cn("px-4 py-2 text-sm", tab === t ? "border-b-2 border-slate-900 font-medium" : "text-slate-500")}>
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && <Overview m={m} />}
      {tab === "Timeline" && <Timeline id={id} />}
      {tab === "Documents" && <Documents id={id} />}
      {tab === "Ask AI" && <AskAI id={id} />}
      {tab === "Team" && <Team id={id} />}
      {tab === "Legal Intelligence" && <MatterLegalTab id={id} />}
      {LATER[tab] && <Later tab={tab} />}
    </div>
  );
}
