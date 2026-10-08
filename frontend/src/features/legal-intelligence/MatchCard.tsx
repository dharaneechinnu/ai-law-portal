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

  return (
    <div className={cn("rounded-lg border bg-white p-4 text-sm", m.status === "dismissed" && "opacity-60")}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium">
            {j.source_url ? <a href={j.source_url} target="_blank" rel="noreferrer" className="hover:underline">{j.title || j.external_judgment_id}</a>
              : (j.title || j.external_judgment_id)}
          </div>
          <div className="text-xs text-slate-500">
            {[j.kind, j.court_name, j.judgment_date].filter(Boolean).join(" · ")}
          </div>
          {showMatter && (
            <Link to={`/matters/${m.matter_id}`} className="text-xs text-slate-600 hover:underline">
              {m.matter_number} · {m.matter_title}
            </Link>
          )}
        </div>
        <div className="text-right">
          <div className={cn("text-lg font-semibold", m.is_alert ? "text-amber-700" : "text-slate-700")}>{pct(m.relevance)}</div>
          <div className="text-xs text-slate-500">{m.is_alert ? "Alert" : "Match"} · {m.status}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
        {Object.entries(m.signals.signals).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 text-xs">
            <span className="w-20 text-slate-500">{SIGNAL_LABELS[k] ?? k}</span>
            {v === null ? <span className="text-slate-400">n/a</span> : (
              <>
                <span className="h-1.5 flex-1 rounded bg-slate-100"><span className="block h-1.5 rounded bg-slate-700" style={{ width: pct(v) }} /></span>
                <span className="w-9 text-right">{pct(v)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      {j.summary && <p className="mt-3 line-clamp-3 text-slate-600">{j.summary}</p>}
      {j.provisions.length > 0 && <p className="mt-1 text-xs text-slate-500">Provisions: {j.provisions.join("; ")}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        {m.status !== "reviewed" && <Button size="sm" variant="outline" onClick={() => setStatus.mutate("reviewed")}>Mark reviewed</Button>}
        {m.status !== "dismissed" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("dismissed")}>Dismiss</Button>}
        {m.status !== "new" && <Button size="sm" variant="ghost" onClick={() => setStatus.mutate("new")}>Reopen</Button>}
        <Button size="sm" variant="outline" onClick={() => (c && !compare.isPending ? setOpen(!open) : compare.mutate())} disabled={compare.isPending}>
          {compare.isPending ? "Comparing…" : c ? (open ? "Hide comparison" : "Show comparison") : "Compare with my case"}
        </Button>
        {c && <Button size="sm" variant="ghost" onClick={() => compare.mutate()} disabled={compare.isPending}>Regenerate</Button>}
      </div>
      {(setStatus.isError || compare.isError) && <p className="mt-2 text-red-600">{errorMessage(setStatus.error ?? compare.error)}</p>}

      {c && open && (
        <div className="mt-3 space-y-2 rounded-md bg-slate-50 p-3">
          {c.raw ? <p className="whitespace-pre-wrap">{c.raw}</p> : (
            <>
              <Section title="Same" items={c.same} />
              <Section title="Different" items={c.different} />
              {c.potential_impact && <div><div className="font-medium">Potential impact</div><p>{c.potential_impact}</p></div>}
              <Section title="Recommended review" items={c.recommended_review} />
            </>
          )}
          <p className="text-xs text-slate-400">{c.label}</p>
        </div>
      )}
    </div>
  );
}

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="font-medium">{title}</div>
      <ul className="list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}
