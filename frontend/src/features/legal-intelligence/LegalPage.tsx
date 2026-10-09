import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DownloadCloud, Gavel } from "lucide-react";
import { Button } from "@/components/ui/button";
import { control } from "@/components/ui/drawer";
import { EmptyState, PageHero, Tabs } from "@/components/ui/page";
import { LegalIllustration } from "@/components/brand/LegalIllustration";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import type { LegalMatch, LegalSyncResult } from "@/types";
import { MatchCard } from "./MatchCard";

const SYNC_ROLES = ["admin", "partner", "lawyer"];
const FILTERS = ["new", "reviewed", "dismissed", "all"] as const;

/** "key=value" lines -> object; the keys are the {placeholders} in the admin's eCourts endpoint config. */
function parseFilters(text: string): Record<string, string> {
  return Object.fromEntries(
    text.split("\n").map((l) => l.trim()).filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
  );
}

function SyncPanel() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<"judgments" | "case">("judgments");
  const [filters, setFilters] = useState("");
  const [caseId, setCaseId] = useState("");
  const sync = useMutation({
    mutationFn: () => api<LegalSyncResult>("/legal/sync", {
      method: "POST",
      body: JSON.stringify({ mode, filters: parseFilters(filters), external_case_id: caseId.trim() || null }),
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["legal"] }),
  });
  const r = sync.data;
  return (
    <section className="space-y-3 rounded-[20px] border border-ink-100 bg-white p-5 text-sm">
      <div className="flex items-center gap-2">
        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300"><DownloadCloud className="size-4" /></span>
        <h2 className="font-serif text-lg font-bold text-ink-900">Fetch from eCourts</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        <select className={cn(control, "h-10 w-auto")} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)} aria-label="What to fetch">
          <option value="judgments">New judgments (by filters)</option>
          <option value="case">One case and its orders</option>
        </select>
        {mode === "case" && <input className={cn(control, "h-10 flex-1")} placeholder="eCourts case ID (e.g. CNR)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />}
      </div>
      {mode === "judgments" && (
        <textarea className={cn(control, "h-20 py-2 font-mono text-xs")} value={filters} onChange={(e) => setFilters(e.target.value)} aria-label="Filters"
          placeholder={"Filters, one per line, matching your endpoint placeholders\nfrom_date=2026-01-01"} />
      )}
      <Button onClick={() => sync.mutate()} disabled={sync.isPending || (mode === "case" && !caseId.trim())}>
        <DownloadCloud className={cn("size-4", sync.isPending && "animate-bounce")} /> {sync.isPending ? "Fetching…" : "Fetch now"}
      </Button>
      {sync.isPending && <div className="h-2 animate-shimmer rounded-full bg-[linear-gradient(90deg,var(--color-ink-100),var(--color-brass-200),var(--color-ink-100))] bg-[length:200%_100%]" />}
      {r && (
        <div className="flex animate-fade-up flex-wrap gap-2">
          {([["Fetched", r.fetched], ["New", r.new], ["Updated", r.updated], ["Matches", r.matches], ["Alerts", r.alerts]] as const).map(([k, v]) => (
            <span key={k} className="rounded-xl bg-ink-50 px-3 py-1.5 text-xs text-ink-500">{k} <b className="ml-1 text-sm text-ink-900">{v}</b></span>
          ))}
          {!r.embedded && <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-xs text-amber-700">Meaning signal skipped: no embedding model set</span>}
        </div>
      )}
      {sync.isError && <p className="text-red-600">{errorMessage(sync.error)}</p>}
    </section>
  );
}

export function LegalPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("new");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["legal", "alerts", status],
    queryFn: () => api<LegalMatch[]>(`/legal/alerts?status=${status}`),
  });
  const canSync = !!user && SYNC_ROLES.includes(user.role_name);
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Gavel} eyebrow="Intelligence" title="Legal Intelligence"
        sub="New eCourts judgments and orders matched to your open matters, with the signals behind each score. Analysis, not legal advice."
        art={<LegalIllustration className="h-44 w-auto" />}>
        {user?.role_name === "admin" && (
          <p className="mt-3 text-xs text-night-300">eCourts connection is set up in <Link to="/settings" className="font-semibold text-brass-300 hover:underline">Settings</Link>.</p>
        )}
      </PageHero>
      <div className={cn("grid gap-[18px]", canSync && "xl:grid-cols-[minmax(320px,1fr)_2fr]")}>
        {canSync && <div className="xl:sticky xl:top-20 xl:self-start"><SyncPanel /></div>}
        <div className="flex min-w-0 flex-col gap-3">
          <Tabs label="Alert status" value={status} onChange={setStatus} items={FILTERS.map((f) => [f, f[0].toUpperCase() + f.slice(1)] as const)} />
          {isLoading && [0, 1].map((i) => <div key={i} className="h-48 animate-pulse rounded-[20px] bg-ink-100/60" />)}
          {error && <p className="text-sm text-red-600">{errorMessage(error)}</p>}
          {!isLoading && !data.length && (
            <div className="rounded-[20px] border border-ink-100 bg-white">
              <EmptyState kind="search" title="No alerts here" hint={status === "new" ? "Fetch from eCourts to look for judgments that match your matters." : undefined} />
            </div>
          )}
          {data.map((m) => <MatchCard key={m.id} m={m} showMatter />)}
        </div>
      </div>
    </div>
  );
}

export function MatterLegalTab({ id }: { id: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["legal", "matter", id],
    queryFn: () => api<LegalMatch[]>(`/legal/matters/${id}/matches`),
  });
  if (isLoading) return <div className="h-40 animate-pulse rounded-2xl bg-ink-50" />;
  if (!data.length)
    return <EmptyState kind="search" title="No matching judgments yet" hint="Matches appear after a fetch on the Legal Intelligence page." />;
  return <div className="space-y-3">{data.map((m) => <MatchCard key={m.id} m={m} />)}</div>;
}
