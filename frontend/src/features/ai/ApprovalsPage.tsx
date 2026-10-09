import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, Check, Stamp, X } from "lucide-react";
import { StampSpot } from "@/components/brand/Spots";
import { EmptyState, PageHero, Tabs } from "@/components/ui/page";
import { relativeTime } from "@/features/admin/roles";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Approval } from "@/types";

type Tab = "pending" | "decided";

const STATUS_TONE: Record<string, string> = {
  approved: "bg-emerald-50 text-emerald-700", rejected: "bg-red-50 text-red-600", expired: "bg-ink-50 text-ink-400",
};

/** Detail lines from the action's arguments, e.g. title, due date, attendees. */
function details(a: Approval): [string, string][] {
  const args = a.payload ?? {};
  return Object.entries(args)
    .filter(([, v]) => v !== null && v !== "" && (typeof v === "string" || typeof v === "number"))
    .slice(0, 4)
    .map(([k, v]) => [k.replace(/_id$/, "").replace(/_/g, " "), String(v)]);
}

function Card({ a, i }: { a: Approval; i: number }) {
  const qc = useQueryClient();
  const [stamp, setStamp] = useState<"approve" | "reject" | null>(null);
  const decide = useMutation({
    mutationFn: (verb: "approve" | "reject") => api(`/approvals/${a.id}/${verb}`, { method: "POST" }),
    onMutate: (verb) => setStamp(verb),
    onError: () => setStamp(null),
    onSuccess: () => setTimeout(() => {
      qc.invalidateQueries({ queryKey: ["approvals"] });
      for (const k of ["tasks", "calendar", "dashboard", "notifications"]) qc.invalidateQueries({ queryKey: [k] });
    }, 1100),
  });
  const pending = a.status === "pending";
  const rows = details(a);
  return (
    <article style={{ animationDelay: `${i * 50}ms` }}
      className={cn(
        "relative flex animate-fade-up flex-col overflow-hidden rounded-[20px] border bg-white p-5 transition-all duration-500",
        stamp === "approve" ? "border-emerald-300" : stamp === "reject" ? "border-red-300" : "border-ink-100 hover:-translate-y-0.5 hover:shadow-[0_16px_32px_rgba(7,13,32,0.08)]",
      )}>
      {stamp && (
        <span className={cn("pointer-events-none absolute right-6 top-1/2 -mt-6 rounded-xl border-[3px] px-3 py-1 font-serif text-xl font-bold uppercase tracking-widest animate-[stamp-in_0.45s_cubic-bezier(0.2,0.9,0.3,1.2)_both]",
          stamp === "approve" ? "border-emerald-600 text-emerald-600" : "border-red-600 text-red-600")}>
          {stamp === "approve" ? "Approved" : "Rejected"}
        </span>
      )}
      <div className="flex items-start gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300"><Bot className="size-5" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-ink-900">{a.label}</h3>
            {!pending && <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold capitalize", STATUS_TONE[a.status])}>{a.status}</span>}
          </div>
          <p className="mt-0.5 text-sm text-ink-600">{a.summary}</p>
          <p className="mt-1 text-xs text-ink-400">
            {a.agent_name ? `${a.agent_name} agent` : "Assistant"} · for {a.requested_for} · {relativeTime(a.created_at)}
            {a.decided_by_name && ` · ${a.status} by ${a.decided_by_name}`}
          </p>
        </div>
      </div>
      {rows.length > 0 && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 rounded-xl bg-ink-50 px-4 py-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="capitalize text-ink-500">{k}</dt>
              <dd className="min-w-0 truncate font-medium text-ink-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {typeof a.result?.error === "string" && <p className="mt-3 text-xs text-red-600">{a.result.error}</p>}
      {decide.isError && <p className="mt-3 text-xs text-red-600">{errorMessage(decide.error)}</p>}
      {pending && (
        <div className={cn("mt-4 flex gap-2 transition-opacity", stamp && "opacity-0")}>
          <button onClick={() => decide.mutate("reject")} disabled={decide.isPending}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-ink-200 text-sm font-semibold text-ink-700 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600">
            <X className="size-4" /> Reject
          </button>
          <button onClick={() => decide.mutate("approve")} disabled={decide.isPending}
            className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-ink-900 text-sm font-semibold text-snow transition hover:bg-ink-800 dark:bg-brass-400 dark:text-night-950">
            <Check className="size-4" /> Approve
          </button>
        </div>
      )}
    </article>
  );
}

export function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["approvals", tab],
    queryFn: () => api<Approval[]>(`/approvals?status=${tab}`),
    refetchInterval: 20_000,
  });
  const { data: waiting = 0 } = useQuery({
    queryKey: ["approvals", "count"],
    queryFn: () => api<{ pending: number }>("/approvals/count").then((r) => r.pending),
  });
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Stamp} eyebrow="Human in the loop" title="Approvals"
        sub={waiting ? `${waiting} AI ${waiting === 1 ? "action is" : "actions are"} waiting for you. Nothing runs until you approve it.`
          : "AI actions run only after you approve them."}
        art={<StampSpot className="h-36 w-auto" />} />
      <Tabs label="Approvals" value={tab} onChange={setTab}
        items={[["pending", <>Waiting{waiting > 0 && <span className="rounded-full bg-brass-300 px-1.5 text-[11px] font-bold text-night-950">{waiting}</span>}</>], ["decided", "History"]]} />
      {isLoading && (
        <div className="grid gap-4 lg:grid-cols-2">{[0, 1].map((i) => <div key={i} className="h-44 animate-pulse rounded-[20px] bg-ink-100/60" />)}</div>
      )}
      {!isLoading && !data.length && (
        <div className="rounded-[20px] border border-ink-100 bg-white">
          <EmptyState kind={tab === "pending" ? "clear" : "inbox"} className="py-12"
            title={tab === "pending" ? "All clear" : "No decisions yet"}
            hint={tab === "pending" ? "Nothing is waiting for your approval." : "Approved and rejected actions will show here."} />
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">{data.map((a, i) => <Card key={a.id} a={a} i={i} />)}</div>
    </div>
  );
}
