import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, errorMessage } from "@/services/api";
import type { LegalMatch, MatchStatus } from "@/types";

const SIGNAL_LABELS: Record<string, string> = {
  semantic: "Meaning", provisions: "Provisions", facts: "Facts", court: "Court", case_type: "Case type", recency: "Recency",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;

/** One matter-to-judgment match: relevance, per-signal breakdown, review actions and the comparison report. */
export function MatchCard({ m, showMatter = false }: { m: LegalMatch; showMatter?: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["legal"] });
  const setStatus = useMutation({
    mutationFn: (status: MatchStatus) => api(`/legal/matches/${m.id}`, { method: "PATCH", body: JSON.stringify({ status }) }),
    onSuccess: refresh,
  });
  const compare = useMutation({
    mutationFn: () => api(`/legal/matches/${m.id}/compare`, { method: "POST" }),
    onSuccess: () => { setOpen(true); refresh(); },
  });
  const j = m.judgment;
  const c = m.comparison;

  const r = 18, circ = 2 * Math.PI * r;
  return (
    <article className={cn("animate-fade-up rounded-[20px] border bg-white p-5 text-sm transition hover:shadow-[0_16px_32px_rgba(7,13,32,0.08)]",
      m.is_alert && m.status === "new" ? "border-brass-300" : "border-ink-100", m.status === "dismissed" && "opacity-60")}>
      <div className="flex items-start gap-4">
        <svg width="56" height="56" viewBox="0 0 44 44" role="img" aria-label={`${pct(m.relevance)} relevance`} className="shrink-0">
          <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" className="stroke-ink-100" />
          <circle cx="22" cy="22" r={r} fill="none" strokeWidth="5" strokeLinecap="round" transform="rotate(-90 22 22)"
            strokeDasharray={`${circ * m.relevance} ${circ}`} className={cn("animate-[draw_1s_ease-out_both]", m.is_alert ? "stroke-brass-500" : "stroke-ink-400")} />
          <text x="22" y="26" textAnchor="middle" fontSize="11" fontWeight="700" className="fill-ink-900">{Math.round(m.relevance * 100)}</text>
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {m.is_alert && <span className="rounded-full bg-brass-100 px-2 py-0.5 text-xs font-semibold text-brass-700">Alert</span>}
            <span className="rounded-full bg-ink-50 px-2 py-0.5 text-xs font-semibold capitalize text-ink-500">{m.status}</span>
          </div>
          <h3 className="mt-1 font-semibold text-ink-900">
            {j.source_url ? <a href={j.source_url} target="_blank" rel="noreferrer" className="hover:text-brass-700 hover:underline">{j.title || j.external_judgment_id}</a>
              : (j.title || j.external_judgment_id)}
          </h3>
          <div className="text-xs capitalize text-ink-400">{[j.kind, j.court_name, j.judgment_date].filter(Boolean).join(" · ")}</div>
          {showMatter && (
            <Link to={`/matters/${m.matter_id}?tab=Legal+Intelligence`} className="mt-1 inline-block text-xs font-semibold text-brass-700 hover:underline">
              Matches {m.matter_title} · {m.matter_number}
            </Link>
          )}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 rounded-2xl bg-ink-50/70 p-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(m.signals.signals).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-20 shrink-0 font-medium text-ink-500">{SIGNAL_LABELS[k] ?? k}</span>
            {v === null ? <span className="text-ink-300">n/a</span> : (
              <>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                  <span className="block h-full origin-left animate-grow rounded-full bg-gradient-to-r from-brass-300 to-brass-500" style={{ width: pct(v) }} />
                </span>
                <span className="w-9 text-right font-semibold tabular-nums text-ink-700">{pct(v)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {j.summary && <p className="mt-3 line-clamp-3 leading-relaxed text-ink-600">{j.summary}</p>}
      {j.provisions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">{j.provisions.map((x) => <span key={x} className="rounded-full border border-ink-100 px-2 py-0.5 text-xs text-ink-600">{x}</span>)}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => (c && !compare.isPending ? setOpen(!open) : compare.mutate())} disabled={compare.isPending}>
          {compare.isPending ? "Comparing…" : c ? (open ? "Hide comparison" : "Show comparison") : "Compare with my case"}
        </Button>
        {c && <Button size="sm" variant="ghost" onClick={() => compare.mutate()} disabled={compare.isPending}>Regenerate</Button>}
        <span className="flex-1" />
        {m.status !== "reviewed" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("reviewed")}>Mark reviewed</Button>}
        {m.status !== "dismissed" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("dismissed")}>Dismiss</Button>}
        {m.status !== "new" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("new")}>Reopen</Button>}
      </div>
      {(setStatus.isError || compare.isError) && <p className="mt-2 text-red-600">{errorMessage(setStatus.error ?? compare.error)}</p>}

      {compare.isPending && (
        <div className="mt-3 flex items-center gap-2 rounded-2xl bg-ink-50 p-3 text-xs font-medium text-ink-500" aria-live="polite">
          <span className="flex gap-1">{[0, 1, 2].map((i) => <span key={i} className="size-1.5 animate-pulse rounded-full bg-ink-400" style={{ animationDelay: `${i * 150}ms` }} />)}</span>
          Comparing the judgment with this matter
        </div>
      )}
      {c && open && !compare.isPending && (
        <div className="mt-3 animate-fade-up space-y-3 rounded-2xl border border-ink-100 p-4">
          {c.raw ? <p className="whitespace-pre-wrap">{c.raw}</p> : (
            <div className="grid gap-4 md:grid-cols-2">
              <Section title="Same" items={c.same} tone="text-emerald-700" />
              <Section title="Different" items={c.different} tone="text-red-700" />
              {c.potential_impact && <div className="md:col-span-2"><div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brass-700">Potential impact</div><p className="text-ink-700">{c.potential_impact}</p></div>}
              <Section title="Recommended review" items={c.recommended_review} tone="text-ink-700" />
            </div>
          )}
          <p className="text-xs text-ink-400">{c.label}</p>
        </div>
      )}
    </article>
  );
}

function Section({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={cn("mb-1 text-xs font-semibold uppercase tracking-wider", tone)}>{title}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-ink-700">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
