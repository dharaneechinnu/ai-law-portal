import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { relativeTime } from "@/features/admin/roles";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Approval } from "@/types";

const TABS = [["pending", "Waiting"], ["decided", "Decided"]] as const;

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700", rejected: "bg-red-50 text-red-600", expired: "bg-ink-50 text-ink-400",
};

function Card({ a, i }: { a: Approval; i: number }) {
  const qc = useQueryClient();
  const [leaving, setLeaving] = useState<"approve" | "reject" | null>(null);
  const decide = useMutation({
    mutationFn: (verb: "approve" | "reject") => api(`/approvals/${a.id}/${verb}`, { method: "POST" }),
    onMutate: (verb) => setLeaving(verb),
    onError: () => setLeaving(null),
    onSuccess: () => setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      for (const k of ["tasks", "calendar", "dashboard", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
    }, 280),
  });
  const pending = a.status === "pending";
  return (
    <article style={{ animationDelay: `${i * 40}ms` }}
      className={cn(
        "animate-fade-up rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-all duration-300",
        leaving === "approve" && "translate-x-6 border-emerald-300 opacity-0",
        leaving === "reject" && "-translate-x-6 border-red-300 opacity-0",
      )}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-brass-300"><Bot className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-medium text-ink-900">{a.label}</h3>
            {!pending && <span className={cn("rounded-full px-2 py-0.5 text-xs capitalize", STATUS_TONE[a.status])}>{a.status}</span>}
          </div>
          <p className="mt-0.5 text-sm text-ink-600">{a.summary}</p>
          <p className="mt-1 text-xs text-ink-400">
            {a.agent_name ? `${a.agent_name} agent` : "Assistant"} · for {a.requested_for} · {relativeTime(a.created_at)}
            {a.decided_by_name && ` · ${a.status} by ${a.decided_by_name}`}
          </p>
          {typeof a.result?.error === "string" && <p className="mt-2 text-xs text-red-600">{a.result.error}</p>}
        </div>
        {pending && (
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" size="sm" onClick={() => decide.mutate("reject")} disabled={decide.isPending}><X className="size-4" /> Reject</Button>
            <Button size="sm" onClick={() => decide.mutate("approve")} disabled={decide.isPending}><Check className="size-4" /> Approve</Button>
          </div>
        )}
      </div>
      {decide.isError && <p className="mt-3 text-xs text-red-600">{errorMessage(decide.error)}</p>}
    </article>
  );
}

export function ApprovalsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number][0]>("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["approvals", tab],
    queryFn: () => api<Approval[]>(`/approvals?status=${tab}`),
    refetchInterval: 20_000,
  });
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex flex-wrap animate-fade-up items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Approvals</h1>
          <p className="mt-1 text-sm text-ink-400">AI actions run only after you approve them.</p>
        </div>
        <div className="inline-flex rounded-xl bg-ink-50 p-1">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={cn("rounded-lg px-3 py-1.5 text-sm transition-all", tab === k ? "bg-white font-medium text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
              {label}
            </button>
          ))}
        </div>
      </div>
      {isLoading && <div className="space-y-3">{[0, 1].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-ink-50" />)}</div>}
      {!isLoading && !data.length && (
        <div className="flex animate-fade-in flex-col items-center gap-2 py-16 text-ink-300">
          <ShieldCheck className="size-7" />
          <span className="text-sm">{tab === "pending" ? "Nothing waiting for you." : "No decisions yet."}</span>
        </div>
      )}
      <div className="space-y-3">{data.map((a, i) => <Card key={a.id} a={a} i={i} />)}</div>
    </div>
  );
}
