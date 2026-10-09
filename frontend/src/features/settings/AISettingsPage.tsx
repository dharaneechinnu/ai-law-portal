import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, ArrowRight, Bot, Check, CheckCircle2, Cloud, Cpu, ExternalLink, Eye, EyeOff, HardDrive, KeyRound, Layers,
  Loader2, RefreshCw, Search, ShieldCheck, Sparkles, XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, errorMessage } from "@/services/api";
import type { AIConfig, AIProviderInfo, AITestResult } from "@/types";

type Conn = { kind: string; fields: Record<string, string>; model: string };
type Draft = { chat: Conn; embedding: Conn & { same_as_chat: boolean } };

const STEPS = ["Chat provider", "Connect", "Embeddings", "Test & save"] as const;

/** Brand-ish colour per provider for the monogram tiles. */
const TINT: Record<string, string> = {
  openai: "from-emerald-400 to-teal-600", anthropic: "from-orange-300 to-amber-600", google: "from-sky-400 to-indigo-600",
  azure_openai: "from-sky-400 to-blue-700", bedrock: "from-amber-400 to-orange-600", mistral: "from-orange-400 to-red-500",
  groq: "from-rose-400 to-red-600", deepseek: "from-blue-400 to-indigo-700", xai: "from-slate-500 to-slate-900",
  openrouter: "from-violet-400 to-purple-700", together: "from-cyan-400 to-blue-600", fireworks: "from-fuchsia-400 to-purple-700",
  cohere: "from-teal-300 to-emerald-700", perplexity: "from-teal-400 to-cyan-700", huggingface: "from-yellow-300 to-amber-500",
  ollama: "from-zinc-500 to-zinc-800", lmstudio: "from-indigo-400 to-violet-700", vllm: "from-amber-300 to-yellow-600",
  openai_compatible: "from-brass-300 to-brass-600",
};

const control = "h-11 w-full rounded-xl border border-ink-100 bg-white px-3.5 text-sm text-ink-900 outline-none transition placeholder:text-ink-300 focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25";

function Monogram({ p, size = "md" }: { p: AIProviderInfo; size?: "sm" | "md" }) {
  const letters = p.name.replace(/[^A-Za-z ]/g, "").split(" ").filter(Boolean).slice(0, 2).map((w) => w[0]).join("");
  return (
    <span className={cn("grid shrink-0 place-items-center rounded-xl bg-gradient-to-br font-bold text-white shadow-sm",
      TINT[p.id] ?? "from-ink-400 to-ink-700", size === "md" ? "size-11 text-sm" : "size-8 text-[11px]")}>
      {letters}
    </span>
  );
}

function Badge({ on, children }: { on: boolean; children: React.ReactNode }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold",
      on ? "bg-emerald-50 text-emerald-700" : "bg-ink-50 text-ink-300 line-through")}>{children}</span>
  );
}

const PRICE: Record<AIProviderInfo["pricing"], [string, string]> = {
  free: ["Free", "bg-emerald-50 text-emerald-700"],
  free_tier: ["Free tier", "bg-sky-50 text-sky-700"],
  paid: ["Paid", "bg-brass-100 text-brass-700"],
};

function Price({ p }: { p: AIProviderInfo }) {
  const [label, tone] = PRICE[p.pricing];
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", tone)}>{label}</span>;
}

const FILTERS = [["all", "All"], ["free", "Free"], ["free_tier", "Free tier"], ["paid", "Paid"]] as const;

function ProviderGrid({ providers, value, onPick, need }: {
  providers: AIProviderInfo[]; value: string; onPick: (id: string) => void; need: "chat" | "embeddings";
}) {
  const [q, setQ] = useState("");
  const [cost, setCost] = useState<(typeof FILTERS)[number][0]>("all");
  const list = providers.filter((p) => p[need] && (cost === "all" || p.pricing === cost)
    && (!q || `${p.name} ${p.blurb}`.toLowerCase().includes(q.toLowerCase())));
  const groups = [...new Set(list.map((p) => p.group))];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a provider" aria-label="Find a provider"
            className={cn(control, "pl-10")} />
        </div>
        <div role="group" aria-label="Cost" className="flex gap-1 rounded-xl border border-ink-100 bg-white p-1">
          {FILTERS.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setCost(k)}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold transition", cost === k ? "bg-ink-900 text-white" : "text-ink-500 hover:bg-ink-50")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {groups.map((g) => (
        <div key={g}>
          <h4 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">
            {g === "Cloud" ? <Cloud className="size-3.5" /> : g === "On your computer" ? <HardDrive className="size-3.5" /> : <Layers className="size-3.5" />}
            {g}
          </h4>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {list.filter((p) => p.group === g).map((p, i) => {
              const active = value === p.id;
              return (
                <button key={p.id} type="button" onClick={() => onPick(p.id)} style={{ animationDelay: `${i * 25}ms` }}
                  className={cn("group relative flex animate-fade-up items-start gap-3 rounded-2xl border p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
                    active ? "border-brass-400 bg-brass-100/40 ring-4 ring-brass-300/20" : "border-ink-100 bg-white hover:border-ink-200")}>
                  <Monogram p={p} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 pr-6 text-sm font-semibold text-ink-900">{p.name}<Price p={p} /></span>
                    <span className="mt-0.5 line-clamp-2 block text-xs text-ink-500">{p.blurb}</span>
                    <span className="mt-2 flex flex-wrap gap-1">
                      <Badge on={p.chat}>Chat</Badge>
                      <Badge on={p.embeddings}>Embeddings</Badge>
                      <Badge on={p.tools}>Agents</Badge>
                    </span>
                  </span>
                  {active && <span className="absolute right-3 top-3 grid size-5 animate-pop place-items-center rounded-full bg-brass-500 text-white"><Check className="size-3" /></span>}
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!list.length && <p className="py-6 text-center text-sm text-ink-400">No provider matches “{q}”.</p>}
    </div>
  );
}

function SecretInput({ value, onChange, saved, placeholder }: { value: string; onChange: (v: string) => void; saved: boolean; placeholder?: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input type={show ? "text" : "password"} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="off"
        placeholder={saved ? "Saved — leave blank to keep" : placeholder ?? ""} className={cn(control, "pr-11 font-mono")} />
      <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide" : "Show"}
        className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700">
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

function Fields({ p, conn, onChange, saved }: { p: AIProviderInfo; conn: Conn; onChange: (k: string, v: string) => void; saved: string[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {p.fields.map((f) => (
        <label key={f.key} className={cn("block space-y-1.5", (f.type === "secret" || f.type === "url") && "sm:col-span-2")}>
          <span className="flex items-center gap-2 text-xs font-semibold text-ink-600">
            {f.type === "secret" && <KeyRound className="size-3.5 text-brass-600" />}
            {f.label}{f.required && <span className="text-red-500">*</span>}
            {f.type === "secret" && saved.includes(f.key) && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700"><ShieldCheck className="size-3" /> Saved</span>
            )}
            {f.key === "api_key" && p.key_url && (
              <a href={p.key_url} target="_blank" rel="noreferrer" className="ml-auto flex items-center gap-1 text-brass-700 hover:underline">
                Get a key <ExternalLink className="size-3" />
              </a>
            )}
          </span>
          {f.type === "secret"
            ? <SecretInput value={conn.fields[f.key] ?? ""} onChange={(v) => onChange(f.key, v)} saved={saved.includes(f.key)} placeholder={f.placeholder ?? undefined} />
            : <input value={conn.fields[f.key] ?? ""} onChange={(e) => onChange(f.key, e.target.value)} placeholder={f.placeholder ?? f.default ?? ""} className={control} />}
          {f.help && <span className="block text-[11px] text-ink-400">{f.help}</span>}
        </label>
      ))}
      {!p.fields.length && <p className="text-sm text-ink-500">Nothing to fill in.</p>}
    </div>
  );
}

/** Plain-language steps and cost note for the chosen provider. */
function Guide({ p }: { p: AIProviderInfo }) {
  return (
    <aside className="space-y-3 self-start rounded-2xl border border-ink-100 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-900">How to set up {p.name} <Price p={p} /></div>
      <ol className="space-y-2">
        {p.guide.map((g, i) => (
          <li key={i} style={{ animationDelay: `${i * 60}ms` }} className="flex animate-fade-up gap-2.5 text-xs leading-relaxed text-ink-600">
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-ink-900 text-[10px] font-bold text-white">{i + 1}</span>
            <span className="min-w-0 break-words">{g}</span>
          </li>
        ))}
      </ol>
      {p.pricing_note && (
        <p className={cn("rounded-xl px-3 py-2 text-xs", p.pricing === "free_tier" ? "bg-amber-50 text-amber-700" : "bg-ink-50 text-ink-600")}>{p.pricing_note}</p>
      )}
      {p.key_url && (
        <a href={p.key_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold text-brass-700 hover:underline">
          Open {p.name} <ExternalLink className="size-3" />
        </a>
      )}
    </aside>
  );
}

/** Quick picks on the first step. */
function Recommended({ byId, onPick }: { byId: Record<string, AIProviderInfo>; onPick: (id: string) => void }) {
  const picks: [string, string, string][] = [
    ["ollama", "Free and private", "Runs on your computer. No key, no cost, nothing leaves the firm."],
    ["google", "Free to try in the cloud", "Free tier, no card. Use a paid key for client data."],
    ["openai", "Best all-round", "Paid. Strong answers, embeddings included."],
    ["anthropic", "Best for long documents", "Paid. Claude for chat; add Ollama or OpenAI for embeddings."],
  ];
  return (
    <div className="mb-5 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
      {picks.filter(([id]) => byId[id]).map(([id, title, text], i) => (
        <button key={id} type="button" onClick={() => onPick(id)} style={{ animationDelay: `${i * 50}ms` }}
          className="group flex animate-fade-up flex-col gap-2 rounded-2xl border border-brass-300/60 bg-gradient-to-br from-brass-100/70 to-white p-3.5 text-left transition hover:-translate-y-0.5 hover:shadow-md">
          <span className="flex items-center gap-2"><Monogram p={byId[id]} size="sm" /><span className="text-[11px] font-bold uppercase tracking-wide text-brass-700">{title}</span></span>
          <span className="flex items-center gap-2 text-sm font-semibold text-ink-900">{byId[id].name}<Price p={byId[id]} /></span>
          <span className="text-xs text-ink-500">{text}</span>
        </button>
      ))}
    </div>
  );
}

function ModelPicker({ p, conn, purpose, savedFrom, onChange }: {
  p: AIProviderInfo; conn: Conn; purpose: "chat" | "embedding"; savedFrom?: "chat" | "embedding"; onChange: (m: string) => void;
}) {
  const [live, setLive] = useState<string[] | null>(null);
  const load = useMutation({
    mutationFn: () => api<{ models: string[] }>("/settings/ai/models", {
      method: "POST", body: JSON.stringify({ kind: p.id, fields: conn.fields, use_saved: savedFrom ?? null }),
    }),
    onSuccess: (r) => setLive(r.models),
  });
  useEffect(() => { setLive(null); load.reset(); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const suggested = purpose === "chat" ? p.chat_models : p.embedding_models;
  const pool = live ?? suggested;
  const q = conn.model.toLowerCase();
  const shown = pool.filter((m) => !q || m.toLowerCase().includes(q) || m === conn.model).slice(0, 18);
  const label = purpose === "chat" ? (p.id === "azure_openai" ? "Chat deployment name" : "Chat model")
    : (p.id === "azure_openai" ? "Embedding deployment name" : "Embedding model");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-600">
        {purpose === "chat" ? <Bot className="size-3.5 text-brass-600" /> : <Layers className="size-3.5 text-brass-600" />}
        {label}<span className="text-red-500">*</span>
        {p.list_models && (
          <button type="button" onClick={() => load.mutate()} disabled={load.isPending}
            className="ml-auto flex items-center gap-1 rounded-lg px-2 py-1 text-brass-700 transition hover:bg-brass-100/60 disabled:opacity-60">
            <RefreshCw className={cn("size-3.5", load.isPending && "animate-spin")} /> {live ? "Reload" : "Load models"}
          </button>
        )}
      </div>
      <input value={conn.model} onChange={(e) => onChange(e.target.value)} placeholder="Type a model name or pick one below" className={cn(control, "font-mono")} />
      {load.isError && <p className="text-xs text-red-600">{errorMessage(load.error)}</p>}
      {shown.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {!live && <span className="self-center text-[11px] text-ink-400">Suggested:</span>}
          {live && <span className="self-center text-[11px] text-emerald-700">{live.length} available:</span>}
          {shown.map((m, i) => (
            <button key={m} type="button" onClick={() => onChange(m)} style={{ animationDelay: `${i * 15}ms` }}
              className={cn("max-w-full animate-fade-in truncate rounded-full border px-2.5 py-1 font-mono text-[11px] transition",
                m === conn.model ? "border-brass-400 bg-brass-100/60 text-brass-700" : "border-ink-100 text-ink-600 hover:border-ink-300 hover:bg-ink-50")}>
              {m}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Stepper({ step, onJump, done }: { step: number; onJump: (i: number) => void; done: (i: number) => boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {STEPS.map((s, i) => (
        <li key={s} className="flex items-center gap-2">
          <button type="button" onClick={() => onJump(i)} disabled={i > step && !done(i - 1)}
            className={cn("flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition",
              i === step ? "bg-ink-900 text-white shadow-sm" : done(i) ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100" : "bg-ink-50 text-ink-400")}>
            <span className={cn("grid size-6 place-items-center rounded-full text-[11px]",
              i === step ? "bg-brass-400 text-night-950" : done(i) ? "bg-emerald-600 text-white" : "bg-white text-ink-400")}>
              {done(i) && i !== step ? <Check className="size-3.5" /> : i + 1}
            </span>
            {s}
          </button>
          {i < STEPS.length - 1 && <span className="hidden h-px w-6 bg-ink-200 sm:block" />}
        </li>
      ))}
    </ol>
  );
}

function ResultRow({ ok, label, detail, pending }: { ok?: boolean; label: string; detail?: string | null; pending: boolean }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-xl border p-3 transition-colors",
      pending ? "border-ink-100" : ok ? "border-emerald-300 bg-emerald-50/60" : "border-red-200 bg-red-50/60")}>
      {pending ? <Loader2 className="mt-0.5 size-5 animate-spin text-ink-400" />
        : ok ? <CheckCircle2 className="mt-0.5 size-5 animate-pop text-emerald-600" /> : <XCircle className="mt-0.5 size-5 animate-pop text-red-600" />}
      <div className="min-w-0">
        <div className="text-sm font-semibold text-ink-900">{label}</div>
        {detail && <div className="break-words text-xs text-ink-600">{detail}</div>}
      </div>
    </div>
  );
}

const blank = (p?: AIProviderInfo): Record<string, string> =>
  Object.fromEntries((p?.fields ?? []).filter((f) => f.type !== "secret").map((f) => [f.key, f.default ?? ""]));

/** Admin-only AI provider setup: pick a provider, fill only what it needs, choose models, test, save. */
export function AISettingsPage() {
  const qc = useQueryClient();
  const { data: providers = [] } = useQuery({ queryKey: ["ai-providers"], queryFn: () => api<AIProviderInfo[]>("/settings/ai/providers"), staleTime: Infinity });
  const { data: cfg, isLoading } = useQuery({ queryKey: ["ai-config"], queryFn: () => api<AIConfig>("/settings/ai") });
  const byId = useMemo(() => Object.fromEntries(providers.map((p) => [p.id, p])), [providers]);

  const [editing, setEditing] = useState(false);
  const [step, setStep] = useState(0);
  const [d, setD] = useState<Draft>({ chat: { kind: "", fields: {}, model: "" }, embedding: { same_as_chat: true, kind: "", fields: {}, model: "" } });

  const reset = () => {
    const c = cfg?.chat, e = cfg?.embedding;
    const clean = (f?: Record<string, string | null>) => Object.fromEntries(Object.entries(f ?? {}).map(([k, v]) => [k, v ?? ""]));
    setD({
      chat: c ? { kind: c.kind, fields: clean(c.fields), model: c.model } : { kind: "", fields: {}, model: "" },
      embedding: e ? { same_as_chat: e.same_as_chat, kind: e.same_as_chat ? "" : e.kind, fields: e.same_as_chat ? {} : clean(e.fields), model: e.model }
        : { same_as_chat: true, kind: "", fields: {}, model: "" },
    });
    setStep(c ? 1 : 0);
  };
  useEffect(() => { if (cfg) reset(); }, [cfg]); // eslint-disable-line react-hooks/exhaustive-deps

  const chatP = byId[d.chat.kind];
  const embP = d.embedding.same_as_chat ? chatP : byId[d.embedding.kind];
  const savedChat = cfg?.chat?.kind === d.chat.kind ? cfg.chat.saved_secrets : [];
  const savedEmb = !d.embedding.same_as_chat && cfg?.embedding && !cfg.embedding.same_as_chat && cfg.embedding.kind === d.embedding.kind ? cfg.embedding.saved_secrets : [];

  const filled = (p: AIProviderInfo | undefined, c: Conn, saved: string[]) =>
    !!p && p.fields.every((f) => !f.required || (c.fields[f.key] ?? "").trim() || saved.includes(f.key) || f.default);
  const done = (i: number) => [
    !!chatP,
    filled(chatP, d.chat, savedChat) && !!d.chat.model.trim(),
    !!embP?.embeddings && !!d.embedding.model.trim() && (d.embedding.same_as_chat || filled(embP, d.embedding, savedEmb)),
    false,
  ][i];

  const pickChat = (id: string) => {
    const p = byId[id];
    setD((x) => ({
      chat: { kind: id, fields: x.chat.kind === id ? x.chat.fields : { ...blank(p), ...(cfg?.chat?.kind === id ? Object.fromEntries(Object.entries(cfg.chat.fields).map(([k, v]) => [k, v ?? ""])) : {}) },
        model: x.chat.kind === id ? x.chat.model : cfg?.chat?.kind === id ? cfg.chat.model : p.chat_models[0] ?? "" },
      embedding: p.embeddings
        ? { ...x.embedding, same_as_chat: x.embedding.same_as_chat || !x.embedding.kind, model: x.embedding.same_as_chat ? (p.embedding_models[0] ?? x.embedding.model) : x.embedding.model }
        : { ...x.embedding, same_as_chat: false },
    }));
    test.reset();
  };
  const pickEmb = (id: string) => {
    const p = byId[id];
    setD((x) => ({ ...x, embedding: { same_as_chat: false, kind: id, fields: x.embedding.kind === id ? x.embedding.fields : blank(p), model: p.embedding_models[0] ?? "" } }));
    test.reset();
  };
  const payload = () => ({
    chat: d.chat,
    embedding: d.embedding.same_as_chat ? { same_as_chat: true, model: d.embedding.model, fields: {} } : d.embedding,
  });

  const test = useMutation({ mutationFn: () => api<AITestResult>("/settings/ai/test", { method: "POST", body: JSON.stringify(payload()) }) });
  const save = useMutation({
    mutationFn: () => api<AIConfig>("/settings/ai", { method: "PUT", body: JSON.stringify(payload()) }),
    onSuccess: (fresh) => {
      qc.setQueryData(["ai-config"], fresh);
      qc.invalidateQueries({ queryKey: ["ai-routes"] });
      setEditing(false);
    },
  });

  if (isLoading || !providers.length) return <div className="h-40 animate-pulse rounded-2xl bg-ink-50" />;

  const configured = !!cfg?.configured;
  const summary = configured && !editing;

  return (
    <section className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 font-serif text-xl font-bold text-ink-900"><Cpu className="size-5 text-brass-600" /> AI provider</h2>
          <p className="text-sm text-ink-500">Pick any provider. Keys are encrypted on the server and never shown again. Only admins see this.</p>
        </div>
        <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
          configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          <span className={cn("size-1.5 rounded-full", configured ? "bg-emerald-500" : "animate-pulse bg-amber-500")} />
          {configured ? "Connected" : "Not set up"}
        </span>
      </div>

      {save.isSuccess && summary && (
        <div className="flex animate-fade-up items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-semibold text-emerald-700">
          <CheckCircle2 className="size-4" /> Saved. Every AI feature now uses these models.
        </div>
      )}

      {summary && cfg?.chat && cfg.embedding && (
        <div className="grid animate-fade-up gap-3 md:grid-cols-2">
          {[["Chat", cfg.chat, Bot], ["Embeddings", cfg.embedding, Layers]] .map(([label, c, Icon]) => {
            const conn = c as NonNullable<AIConfig["chat"]>;
            const p = byId[conn.kind];
            const I = Icon as typeof Bot;
            return (
              <div key={label as string} className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                {p && <Monogram p={p} />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400"><I className="size-3.5" />{label as string}</div>
                  <div className="truncate text-sm font-semibold text-ink-900">{conn.name}</div>
                  <div className="truncate font-mono text-xs text-ink-500">{conn.model}</div>
                </div>
              </div>
            );
          })}
          <div className="flex flex-wrap gap-2 md:col-span-2">
            <Button onClick={() => { reset(); setEditing(true); setStep(0); }}><Sparkles className="size-4" /> Change provider</Button>
            <Button variant="outline" onClick={() => { reset(); setEditing(true); setStep(1); }}>Edit keys or models</Button>
          </div>
        </div>
      )}

      {!summary && (
        <div className="space-y-5 rounded-2xl border border-ink-100 bg-ink-50/40 p-4 md:p-5">
          <Stepper step={step} onJump={setStep} done={done} />

          <div key={step} className="animate-fade-up">
            {step === 0 && (
              <>
                <p className="mb-3 text-sm text-ink-600">Which service should write answers, briefings and run the assistant? Not sure? Start with a quick pick.</p>
                <Recommended byId={byId} onPick={(id) => { pickChat(id); setStep(1); }} />
                <ProviderGrid providers={providers} value={d.chat.kind} need="chat" onPick={pickChat} />
              </>
            )}

            {step === 1 && chatP && (
              <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
              <div className="min-w-0 space-y-5">
                <div className="flex items-center gap-3"><Monogram p={chatP} /><div><div className="font-semibold text-ink-900">{chatP.name}</div><div className="text-xs text-ink-500">{chatP.blurb}</div></div></div>
                <Fields p={chatP} conn={d.chat} saved={savedChat}
                  onChange={(k, v) => setD((x) => ({ ...x, chat: { ...x.chat, fields: { ...x.chat.fields, [k]: v } } }))} />
                <ModelPicker p={chatP} conn={d.chat} purpose="chat" savedFrom="chat"
                  onChange={(m) => setD((x) => ({ ...x, chat: { ...x.chat, model: m } }))} />
                {!chatP.tools && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">This provider can't use tools, so the AI assistant and agents won't work with it. Q&A and briefings will.</p>}
              </div>
              <Guide p={chatP} />
              </div>
            )}

            {step === 2 && chatP && (
              <div className="space-y-5">
                <p className="text-sm text-ink-600">
                  Embeddings turn documents into searchable numbers. The model must give <b>{cfg?.embedding_dim ?? 768}</b> numbers per text.
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={!chatP.embeddings}
                    onClick={() => setD((x) => ({ ...x, embedding: { same_as_chat: true, kind: "", fields: {}, model: x.embedding.same_as_chat ? x.embedding.model : chatP.embedding_models[0] ?? "" } }))}
                    className={cn("rounded-2xl border p-4 text-left transition disabled:cursor-not-allowed disabled:opacity-50",
                      d.embedding.same_as_chat ? "border-brass-400 bg-brass-100/40 ring-4 ring-brass-300/20" : "border-ink-100 bg-white hover:border-ink-200")}>
                    <div className="text-sm font-semibold text-ink-900">Use {chatP.name}</div>
                    <div className="text-xs text-ink-500">{chatP.embeddings ? "Same connection, nothing else to fill in." : `${chatP.name} has no embedding models.`}</div>
                  </button>
                  <button type="button" onClick={() => setD((x) => ({ ...x, embedding: { ...x.embedding, same_as_chat: false } }))}
                    className={cn("rounded-2xl border p-4 text-left transition",
                      !d.embedding.same_as_chat ? "border-brass-400 bg-brass-100/40 ring-4 ring-brass-300/20" : "border-ink-100 bg-white hover:border-ink-200")}>
                    <div className="text-sm font-semibold text-ink-900">Use another provider</div>
                    <div className="text-xs text-ink-500">For example free local embeddings with Ollama.</div>
                  </button>
                </div>
                {d.embedding.same_as_chat && chatP.embeddings && (
                  <ModelPicker p={chatP} conn={d.embedding} purpose="embedding" savedFrom="chat"
                    onChange={(m) => setD((x) => ({ ...x, embedding: { ...x.embedding, model: m } }))} />
                )}
                {!d.embedding.same_as_chat && (
                  <>
                    <ProviderGrid providers={providers} value={d.embedding.kind} need="embeddings" onPick={pickEmb} />
                    {embP && (
                      <div className="grid gap-5 rounded-2xl border border-ink-100 bg-white p-4 lg:grid-cols-[1fr_280px]">
                       <div className="min-w-0 space-y-5">
                        <div className="flex items-center gap-3"><Monogram p={embP} size="sm" /><span className="font-semibold text-ink-900">{embP.name}</span></div>
                        <Fields p={embP} conn={d.embedding} saved={savedEmb}
                          onChange={(k, v) => setD((x) => ({ ...x, embedding: { ...x.embedding, fields: { ...x.embedding.fields, [k]: v } } }))} />
                        <ModelPicker p={embP} conn={d.embedding} purpose="embedding" savedFrom="embedding"
                          onChange={(m) => setD((x) => ({ ...x, embedding: { ...x.embedding, model: m } }))} />
                       </div>
                       <Guide p={embP} />
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {step === 3 && chatP && embP && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                    <Monogram p={chatP} /><div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Chat</div>
                      <div className="truncate text-sm font-semibold text-ink-900">{chatP.name}</div><div className="truncate font-mono text-xs text-ink-500">{d.chat.model}</div></div>
                  </div>
                  <div className="flex items-center gap-3 rounded-2xl border border-ink-100 bg-white p-4">
                    <Monogram p={embP} /><div className="min-w-0"><div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">Embeddings</div>
                      <div className="truncate text-sm font-semibold text-ink-900">{embP.name}</div><div className="truncate font-mono text-xs text-ink-500">{d.embedding.model}</div></div>
                  </div>
                </div>
                <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
                  {test.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />} Test connection
                </Button>
                {(test.isPending || test.data) && (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <ResultRow pending={test.isPending} ok={test.data?.chat_ok} label="Chat model answers"
                      detail={test.data ? test.data.chat_error ?? "It replied." : null} />
                    <ResultRow pending={test.isPending} ok={test.data?.embedding_ok} label="Embeddings work"
                      detail={test.data ? test.data.embedding_error ?? `${test.data.embedding_dim} numbers per text. Matches.` : null} />
                  </div>
                )}
                {test.isError && <p className="text-sm text-red-600">{errorMessage(test.error)}</p>}
                {test.data && !(test.data.chat_ok && test.data.embedding_ok) && (
                  <p className="text-xs text-ink-500">You can still save, but AI features will fail until both checks pass.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-4">
            {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="size-4" /> Back</Button>}
            {configured && <Button variant="ghost" onClick={() => { setEditing(false); test.reset(); save.reset(); }}>Cancel</Button>}
            <span className="flex-1" />
            {save.isError && <span className="text-sm text-red-600">{errorMessage(save.error)}</span>}
            {step < 3 && <Button onClick={() => setStep(step + 1)} disabled={!done(step)}>Next <ArrowRight className="size-4" /></Button>}
            {step === 3 && (
              <Button variant="brass" onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />} Save
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
