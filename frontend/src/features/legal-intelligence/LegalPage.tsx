import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import type { LegalMatch, LegalSyncResult } from "@/types";
import { MatchCard } from "./MatchCard";

const input = "rounded-md border px-3 py-2 text-sm";
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
    <div className="space-y-2 rounded-lg border bg-white p-4 text-sm">
      <div className="font-medium">Fetch from eCourts</div>
      <div className="flex flex-wrap gap-2">
        <select className={input} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
          <option value="judgments">New judgments (by filters)</option>
          <option value="case">One case and its orders</option>
        </select>
        {mode === "case" && <input className={cn(input, "flex-1")} placeholder="eCourts case ID (e.g. CNR)" value={caseId} onChange={(e) => setCaseId(e.target.value)} />}
      </div>
      {mode === "judgments" && (
        <textarea className={cn(input, "h-20 w-full font-mono text-xs")} value={filters} onChange={(e) => setFilters(e.target.value)}
          placeholder={"Filters, one per line, matching your endpoint placeholders\nfrom_date=2026-01-01"} />
      )}
      <Button onClick={() => sync.mutate()} disabled={sync.isPending || (mode === "case" && !caseId.trim())}>
        {sync.isPending ? "Fetching…" : "Fetch now"}
      </Button>
      {r && (
        <p className="text-green-700">
          Fetched {r.fetched} · new {r.new} · updated {r.updated} · matches {r.matches} · alerts {r.alerts}
          {!r.embedded && <span className="text-amber-700"> · meaning signal skipped (no embedding model set)</span>}
        </p>
      )}
      {sync.isError && <p className="text-red-600">{errorMessage(sync.error)}</p>}
    </div>
  );
}

export function LegalPage() {
  const { user } = useAuth();
  const [status, setStatus] = useState<(typeof FILTERS)[number]>("new");
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["legal", "alerts", status],
    queryFn: () => api<LegalMatch[]>(`/legal/alerts?status=${status}`),
  });
  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Legal Intelligence</h1>
        <p className="text-sm text-slate-500">
          New eCourts judgments and orders matched to open matters. Scores show which signals matched. Analysis, not legal advice.
        </p>
      </div>
      {user && SYNC_ROLES.includes(user.role_name) && <SyncPanel />}
      {user?.role_name === "admin" && (
        <p className="text-xs text-slate-500">eCourts connection is set up in <Link to="/settings" className="underline">Settings</Link>.</p>
      )}
      <div className="flex gap-1">
        {FILTERS.map((f) => (
          <button key={f} onClick={() => setStatus(f)}
            className={cn("rounded-md px-3 py-1 text-sm capitalize", status === f ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100")}>
            {f}
          </button>
        ))}
      </div>
      {isLoading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-red-600">{errorMessage(error)}</p>}
      {!isLoading && !data.length && <p className="text-sm text-slate-500">No alerts here.</p>}
      <div className="space-y-3">{data.map((m) => <MatchCard key={m.id} m={m} showMatter />)}</div>
    </div>
  );
}

export function MatterLegalTab({ id }: { id: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["legal", "matter", id],
    queryFn: () => api<LegalMatch[]>(`/legal/matters/${id}/matches`),
  });
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (!data.length)
    return <p className="max-w-xl text-sm text-slate-500">No eCourts judgments or orders matched to this matter yet. Matches appear after a fetch on the Legal Intelligence page.</p>;
  return <div className="max-w-4xl space-y-3">{data.map((m) => <MatchCard key={m.id} m={m} />)}</div>;
}
