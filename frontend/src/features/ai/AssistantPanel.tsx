import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Bot, CheckCircle2, Clock, Send, Sparkles, X } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import { MOD, useCommand } from "@/lib/shortcuts";
import type { AgentInfo, ChatReply, ChatStep } from "@/types";

type Msg = { role: "user" | "agent"; text: string; steps?: ChatStep[] };

const EXAMPLES: Record<string, string> = {
  task: "Add a task to file the reply by Friday",
  scheduling: "Schedule a meeting with a colleague tomorrow at 11",
  matter_intel: "What are the key dates in my latest matter?",
  legal_research: "Which provisions does my latest matter rely on?",
  briefing: "What needs my attention today?",
};

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
        {s.status === "pending_approval" && <Link to="/approvals" className="ml-1 text-brass-700 underline">Review</Link>}
      </span>
    </div>
  );
}

/** Floating assistant. Agents run on the server; each action they ask for goes through the firm's AI rules. */
export function AssistantPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [agent, setAgent] = useState("task");
  const [text, setText] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [execution, setExecution] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useCommand("assistant", useCallback(() => setOpen((o) => !o), []));
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  const { data: agents = [] } = useQuery({ queryKey: ["assistant-agents"], queryFn: () => api<AgentInfo[]>("/assistant/agents"), enabled: open });

  const send = useMutation({
    mutationFn: (message: string) => api<ChatReply>("/assistant/chat", {
      method: "POST", body: JSON.stringify({ agent_key: agent, message, execution_id: execution }),
    }),
    onMutate: (message) => { setMsgs((m) => [...m, { role: "user", text: message }]); setText(""); },
    onSuccess: (r) => {
      setExecution(r.execution_id);
      setMsgs((m) => [...m, { role: "agent", text: r.reply || "Done.", steps: r.steps }]);
      for (const k of ["tasks", "calendar", "dashboard", "approvals", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, send.isPending]);
  const switchAgent = (k: string) => { if (k !== agent) { setAgent(k); setMsgs([]); setExecution(null); send.reset(); } };
  const notConfigured = send.isError && errorMessage(send.error).includes("AI providers");

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
          className="fixed bottom-24 right-6 z-40 flex h-[34rem] max-h-[calc(100vh-8rem)] w-[24rem] max-w-[calc(100vw-2rem)] origin-bottom-right animate-pop flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-2xl">
          <header className="border-b border-ink-50 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-ink-900"><Bot className="size-4 text-brass-600" /> Assistant</div>
            <div className="mt-2 flex flex-wrap gap-1">
              {agents.map((a) => (
                <button key={a.key} onClick={() => switchAgent(a.key)}
                  className={cn("rounded-full px-2.5 py-1 text-xs transition-all", agent === a.key ? "bg-ink-900 text-white shadow-sm" : "bg-ink-50 text-ink-500 hover:bg-ink-100")}>
                  {a.name}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!msgs.length && (
              <div className="animate-fade-in space-y-2 pt-6 text-center">
                <p className="text-sm text-ink-400">Ask in plain words. Changes wait for your approval.</p>
                {EXAMPLES[agent] && (
                  <button onClick={() => send.mutate(EXAMPLES[agent])}
                    className="rounded-full border border-dashed border-ink-200 px-3 py-1.5 text-xs text-ink-600 transition hover:border-brass-400 hover:bg-brass-100/40">
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
                  {m.steps && m.steps.length > 0 && <div className="space-y-1 border-t border-ink-100 pt-2">{m.steps.map((s, j) => <Step key={j} s={s} />)}</div>}
                </div>
              </div>
            ))}
            {send.isPending && (
              <div className="flex gap-1 px-2" aria-label="Thinking">
                {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-bounce rounded-full bg-ink-300" style={{ animationDelay: `${i * 120}ms` }} />)}
              </div>
            )}
            {send.isError && (
              <div className="animate-fade-in rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMessage(send.error)}
                {notConfigured && <> <Link to="/settings" className="underline" onClick={() => setOpen(false)}>Open Settings</Link></>}
              </div>
            )}
            <div ref={end} />
          </div>

          <form onSubmit={(e) => { e.preventDefault(); if (text.trim() && !send.isPending) send.mutate(text.trim()); }}
            className="flex items-center gap-2 border-t border-ink-50 p-3">
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" aria-label="Message"
              className="h-10 flex-1 rounded-xl border border-ink-100 px-3 text-sm outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
            <button disabled={!text.trim() || send.isPending} aria-label="Send"
              className="grid size-10 place-items-center rounded-xl bg-ink-900 text-white transition hover:bg-ink-700 disabled:opacity-40">
              <Send className="size-4" />
            </button>
          </form>
        </section>
      )}
    </>
  );
}
