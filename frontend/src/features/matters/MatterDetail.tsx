import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/services/api";
import type { AskResult, DocumentRow, Matter, TimelineEvent } from "@/types";

const TABS = ["Overview", "Timeline", "Documents", "Ask AI"] as const;
type Tab = (typeof TABS)[number];

function Overview({ m }: { m: Matter }) {
  const rows: [string, string | null | undefined][] = [
    ["Matter ID", m.matter_number], ["Case number", m.case_number], ["Court", m.court],
    ["Jurisdiction", m.jurisdiction], ["Practice area", m.practice_area], ["Priority", m.priority],
    ["Status", m.status],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents"><dt className="text-slate-500">{k}</dt><dd>{v ?? "—"}</dd></div>
        ))}
      </dl>
      {m.description && <p className="max-w-xl text-sm">{m.description}</p>}
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
      <div className="mb-6 flex gap-1 border-b">
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
    </div>
  );
}
