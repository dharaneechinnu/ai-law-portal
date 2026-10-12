import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bot, Check, CheckCircle2, Clock, FileText, Loader2, Paperclip, Send, ShieldQuestion, Sparkles, X } from "lucide-react";
import { api, apiFetch, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { MOD, useCommand } from "@/lib/shortcuts";
import type { AgentInfo, ChatReply, ChatStep, ChatUpload } from "@/types";

type Msg = { role: "user" | "agent"; text: string; steps?: ChatStep[]; files?: string[] };
type Verdict = "approved" | "rejected";

const EXAMPLES: Record<string, string> = {
  assistant: "Upload this file to this case and email it to the client",
  task: "Add a task to file the reply by Friday",
  scheduling: "Schedule a meeting with a colleague tomorrow at 11",
  matter_intel: "What are the key dates in my latest matter?",
  legal_research: "Which provisions does my latest matter rely on?",
  briefing: "What needs my attention today?",
};

/** A held action, decided right in the chat. The server re-checks the firm's rules when it is approved. */
function ApprovalCard({ s, verdict, onDecide }: { s: ChatStep; verdict?: Verdict; onDecide: (id: string, v: Verdict) => void }) {
  const decide = useMutation({
    mutationFn: (v: Verdict) => api(`/approvals/${s.approval_id}/${v === "approved" ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (_, v) => onDecide(s.approval_id!, v),
  });
  return (
    <div className={cn("animate-slide-up rounded-xl border bg-white p-2.5 text-xs transition-colors",
      verdict === "approved" ? "border-emerald-200" : verdict === "rejected" ? "border-red-200" : "border-brass-300 shadow-sm")}>
      <div className="flex items-start gap-1.5">
        <ShieldQuestion className="mt-0.5 size-3.5 shrink-0 text-brass-600" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-ink-800">{s.label}</div>
          <div className="break-words text-ink-500">{s.summary ?? s.reason}</div>
        </div>
      </div>
      {verdict ? (
        <div className={cn("mt-2 font-medium", verdict === "approved" ? "text-emerald-600" : "text-red-600")}>
          {verdict === "approved" ? "Approved" : "Rejected"}
        </div>
      ) : (
        <div className="mt-2 flex justify-end gap-1.5">
          <button onClick={() => decide.mutate("rejected")} disabled={decide.isPending}
            className="rounded-lg border border-ink-100 px-2.5 py-1 font-semibold text-ink-600 transition hover:border-red-200 hover:text-red-600 disabled:opacity-50">
            Reject
          </button>
          <button onClick={() => decide.mutate("approved")} disabled={decide.isPending}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
            {decide.isPending ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Approve
          </button>
        </div>
      )}
      {decide.isError && <div className="mt-1 text-red-600">{errorMessage(decide.error)}</div>}
    </div>
  );
}

function Step({ s }: { s: ChatStep }) {
  const map = {
    executed: [CheckCircle2, "text-emerald-600", "Done"],
    pending_approval: [Clock, "text-brass-600", "Waiting for approval"],
    blocked: [Ban, "text-red-600", "Blocked"],
    failed: [Ban, "text-red-600", "Failed"],
  } as const;
  const [Icon, tone, label] = map[s.status as keyof typeof map] ?? map.failed;
  return (
    <div className="flex animate-slide-up items-start gap-1.5 text-xs">
      <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone)} />
      <span className="text-ink-600">
        <span className="font-medium">{s.label}</span> · <span className={tone}>{label}</span>
        {s.status !== "executed" && s.reason && <span className="text-ink-400"> — {s.reason}</span>}
      </span>
    </div>
  );
}

/** Floating assistant. Agents run on the server; each action they ask for goes through the firm's AI rules. */
export function AssistantPanel() {
  const isAdmin = useAuth().user?.role_name === "admin";
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("assistant");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [execution, setExecution] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [files, setFiles] = useState<ChatUpload[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  // "this case": the matter page that is open, checked again on the server
  const matterId = useLocation().pathname.match(/^\/matters\/([0-9a-f-]{36})/)?.[1] ?? null;
  useCommand("assistant", useCallback(() => setOpen((o) => !o), []));
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const { data: agents = [] } = useQuery({ queryKey: ["assistant-agents"], queryFn: () => api<AgentInfo[]>("/assistant/agents"), enabled: open });

  const onReply = (r: ChatReply) => {
    setExecution(r.execution_id);
    setWaiting(r.status === "waiting_approval");
    setMsgs((m) => [...m, { role: "agent", text: r.reply || "Done.", steps: r.steps }]);
    for (const k of ["tasks", "calendar", "dashboard", "approvals", "notifications", "documents", "timeline"]) qc.invalidateQueries({ queryKey: [k] });
  };
  const send = useMutation({
    mutationFn: (message: string) => api<ChatReply>("/assistant/chat", {
      method: "POST",
      body: JSON.stringify({ agent_key: agent, message, execution_id: execution, upload_ids: files.map((f) => f.id), matter_id: matterId }),
    }),
    onMutate: (message) => { setMsgs((m) => [...m, { role: "user", text: message, files: files.map((f) => f.filename) }]); setText(""); },
    onSuccess: (r) => { setFiles([]); onReply(r); },
  });
  const resume = useMutation({
    mutationFn: () => api<ChatReply>(`/assistant/chat/${execution}/resume`, { method: "POST", body: JSON.stringify({ agent_key: agent }) }),
    onSuccess: onReply,
  });
  const attach = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiFetch("/assistant/uploads", { method: "POST", body: fd });
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      return (await res.json()) as ChatUpload;
    },
    onSuccess: (f) => setFiles((fs) => [...fs, f]),
  });

  // Once every held action of the last turn is decided, the agent carries on from the real outcome.
  const held = (msgs.at(-1)?.steps ?? []).filter((s) => s.status === "pending_approval" && s.approval_id);
  const allDecided = waiting && held.length > 0 && held.every((s) => verdicts[s.approval_id!]);
  const onDecide = (id: string, v: Verdict) => {
    setVerdicts((prev) => ({ ...prev, [id]: v }));
    qc.invalidateQueries({ queryKey: ["approvals"] });
  };
  const { mutate: carryOn } = resume;
  useEffect(() => { if (allDecided) carryOn(); }, [allDecided, carryOn]);

  const busy = send.isPending || resume.isPending;
  const error = send.error ?? resume.error ?? attach.error;
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);
  const switchAgent = (k: string) => {
    if (k !== agent) { setAgent(k); setMsgs([]); setExecution(null); setWaiting(false); setFiles([]); send.reset(); resume.reset(); }
  };
  const notConfigured = !!error && errorMessage(error).includes("AI providers");

  return (
    <>
      <button onClick={() => setOpen(!open)} aria-label={open ? "Close assistant" : "Open assistant"} title={`Assistant (${MOD}+J)`}
        className={cn("group fixed bottom-6 right-6 z-40 grid size-14 place-items-center rounded-full bg-night-900 text-brass-300 shadow-xl shadow-night-950/30 ring-1 ring-snow/10 transition-all duration-300 hover:scale-105 hover:shadow-2xl",
          open && "rotate-90 bg-night-700")}>
        {!open && <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-brass-400/20 [animation-duration:2.8s]" />}
        {open ? <X className="size-6" /> : <Sparkles className="size-6" />}
      </button>

      {open && (
        <section role="dialog" aria-label="Assistant"
          className="fixed bottom-24 right-6 z-40 flex h-[36rem] max-h-[calc(100vh-8rem)] w-[25rem] max-w-[calc(100vw-2rem)] origin-bottom-right animate-pop flex-col overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-[0_30px_60px_rgba(7,13,32,0.3)]">
          <header className="relative isolate overflow-hidden bg-gradient-to-br from-night-800 via-night-900 to-night-950 px-4 pb-3 pt-4 text-snow">
            <span className="pointer-events-none absolute -right-10 -top-16 -z-10 size-40 rounded-full bg-brass-300/20 blur-2xl" />
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 text-night-950"><Bot className="size-[18px]" /></span>
              <span>
                <span className="block font-serif text-lg font-bold leading-tight">Ask AI</span>
                <span className="block text-[11px] text-night-300">Changes wait for your approval · {MOD}+J</span>
              </span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Agent">
              {agents.map((a) => (
                <button key={a.key} onClick={() => switchAgent(a.key)} aria-pressed={agent === a.key}
                  className={cn("rounded-full px-2.5 py-1 text-xs font-semibold transition-all",
                    agent === a.key ? "bg-brass-300 text-night-950 shadow-sm" : "bg-snow/10 text-night-200 hover:bg-snow/15 hover:text-snow")}>
                  {a.name}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!msgs.length && (
              <div className="flex animate-fade-in flex-col items-center gap-3 pt-6 text-center">
                <span className="grid size-14 animate-float place-items-center rounded-2xl bg-brass-100 text-brass-600"><Sparkles className="size-6" /></span>
                <p className="max-w-[16rem] text-sm text-ink-500">Ask in plain words. Anything that changes your data waits for your approval.</p>
                {EXAMPLES[agent] && (
                  <button onClick={() => send.mutate(EXAMPLES[agent])}
                    className="rounded-full border border-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600 transition hover:-translate-y-0.5 hover:border-brass-300 hover:text-brass-700">
                    “{EXAMPLES[agent]}”
                  </button>
                )}
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("flex animate-slide-up", m.role === "user" ? "justify-end" : "justify-start")}>
                <div className={cn("max-w-[85%] space-y-2 rounded-2xl px-3.5 py-2.5 text-sm",
                  m.role === "user" ? "rounded-br-md bg-ink-900 text-white" : "rounded-bl-md bg-ink-50 text-ink-800")}>
                  <p className="whitespace-pre-wrap">{m.text}</p>
                  {m.files?.map((f) => (
                    <span key={f} className="mr-1 inline-flex items-center gap-1 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px]"><FileText className="size-3" />{f}</span>
                  ))}
                  {m.steps && m.steps.length > 0 && (
                    <div className="space-y-1.5 border-t border-ink-100 pt-2">
                      {m.steps.map((s, j) => s.status === "pending_approval" && s.approval_id
                        ? <ApprovalCard key={j} s={s} verdict={verdicts[s.approval_id]} onDecide={onDecide} />
                        : <Step key={j} s={s} />)}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {waiting && !busy && (
              <p className="animate-fade-in text-center text-[11px] text-ink-400">
                Decided on the <Link to="/approvals" className="underline">Approvals page</Link>?{" "}
                <button onClick={() => resume.mutate()} className="font-semibold text-brass-700 underline">Continue</button>
              </p>
            )}
            {busy && (
              <div className="flex w-fit gap-1 rounded-2xl rounded-bl-md bg-ink-50 px-3.5 py-3" aria-label="Thinking">
                {[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-bounce rounded-full bg-ink-400" style={{ animationDelay: `${i * 120}ms` }} />)}
              </div>
            )}
            {error && (
              <div className="animate-fade-in rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {notConfigured && !isAdmin ? "The AI isn't set up yet. Ask your firm admin to add an AI model." : errorMessage(error)}
                {notConfigured && isAdmin && <> <Link to="/settings" className="underline" onClick={() => setOpen(false)}>Open Settings</Link></>}
              </div>
            )}
            <div ref={end} />
          </div>

          {files.length > 0 && (
            <div className="flex flex-wrap gap-1.5 border-t border-ink-50 px-3 pt-2">
              {files.map((f) => (
                <span key={f.id} className="inline-flex max-w-full items-center gap-1 rounded-lg bg-ink-50 py-1 pl-2 pr-1 text-xs text-ink-700">
                  <FileText className="size-3.5 shrink-0 text-brass-600" /><span className="truncate">{f.filename}</span>
                  <button onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))} aria-label={`Remove ${f.filename}`}
                    className="grid size-5 place-items-center rounded text-ink-400 hover:bg-white hover:text-red-600"><X className="size-3" /></button>
                </span>
              ))}
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); if (text.trim() && !busy && !waiting) send.mutate(text.trim()); }}
            className="flex items-center gap-2 border-t border-ink-50 p-3">
            <input ref={picker} type="file" accept=".pdf,.docx,.txt" hidden
              onChange={(e) => { const f = e.target.files?.[0]; if (f) attach.mutate(f); e.target.value = ""; }} />
            <button type="button" onClick={() => picker.current?.click()} disabled={attach.isPending || files.length >= 5 || waiting}
              aria-label="Attach a file" title="Attach a PDF, DOCX or TXT"
              className="grid size-10 shrink-0 place-items-center rounded-xl border border-ink-100 text-ink-500 transition hover:border-brass-300 hover:text-brass-700 disabled:opacity-40">
              {attach.isPending ? <Loader2 className="size-4 animate-spin" /> : <Paperclip className="size-4" />}
            </button>
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} disabled={waiting}
              placeholder={waiting ? "Approve or reject above to continue" : "Message"} aria-label="Message"
              className="h-10 min-w-0 flex-1 rounded-xl border border-ink-100 px-3 text-sm outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25 disabled:bg-ink-50" />
            <button disabled={!text.trim() || busy || waiting} aria-label="Send"
              className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 text-night-950 shadow-md shadow-brass-500/25 transition hover:brightness-105 disabled:opacity-40 disabled:shadow-none">
              <Send className="size-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
