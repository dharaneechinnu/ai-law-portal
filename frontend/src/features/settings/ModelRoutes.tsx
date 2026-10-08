import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Route } from "lucide-react";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { AIConfig, ModelRoute } from "@/types";

function RouteRow({ r, i }: { r: ModelRoute; i: number }) {
  const qc = useQueryClient();
  const [value, setValue] = useState(r.model ?? "");
  const [saved, setSaved] = useState(false);
  useEffect(() => setValue(r.model ?? ""), [r.model]);
  const save = useMutation({
    mutationFn: () => api<ModelRoute[]>(`/settings/ai/routes/${r.task}`, { method: "PUT", body: JSON.stringify({ model: value.trim() || null }) }),
    onSuccess: (rows) => { qc.setQueryData(["ai-routes"], rows); setSaved(true); setTimeout(() => setSaved(false), 1500); },
  });
  const dirty = value.trim() !== (r.model ?? "");
  return (
    <form style={{ animationDelay: `${i * 30}ms` }} onSubmit={(e) => { e.preventDefault(); if (dirty) save.mutate(); }}
      className="flex animate-slide-up flex-wrap items-center gap-3 px-4 py-3">
      <span className="min-w-44 flex-1 text-sm text-ink-800">{r.label}</span>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Default: ${r.default_model}`} aria-label={`Model for ${r.label}`}
        className="h-9 w-56 rounded-lg border border-ink-100 px-2.5 text-sm outline-none transition placeholder:text-ink-300 focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
      <button disabled={!dirty || save.isPending}
        className={cn("grid h-9 w-16 place-items-center rounded-lg text-sm transition-all",
          saved ? "bg-emerald-500 text-white" : dirty ? "bg-ink-900 text-white hover:bg-ink-700" : "bg-ink-50 text-ink-300")}>
        {saved ? <Check className="size-4 animate-pop" /> : "Save"}
      </button>
      {save.isError && <p className="w-full text-xs text-red-600">{errorMessage(save.error)}</p>}
    </form>
  );
}

/** Send each AI job to its own model on the configured provider. Empty = the default chat model. */
export function ModelRoutes() {
  const { data: cfg } = useQuery({ queryKey: ["ai-config"], queryFn: () => api<AIConfig>("/settings/ai") });
  const { data, isError, error } = useQuery({
    queryKey: ["ai-routes"], queryFn: () => api<ModelRoute[]>("/settings/ai/routes"), retry: false, enabled: !!cfg?.configured,
  });
  return (
    <section className="mt-10">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink-700"><Route className="size-4" /> Model per job</h3>
      <p className="mb-3 text-xs text-ink-400">Leave a job empty to use the default chat model. Agents need a model that supports tool calling.</p>
      {cfg && !cfg.configured ? (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-500">Save a provider above first.</p>
      ) : isError ? (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-red-600">{errorMessage(error)}</p>
      ) : (
        <div className="divide-y divide-ink-50 rounded-2xl border border-ink-100 bg-white">
          {data?.map((r, i) => <RouteRow key={r.task} r={r} i={i} />)}
        </div>
      )}
    </section>
  );
}
