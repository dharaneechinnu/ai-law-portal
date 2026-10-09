import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, control } from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { api, errorMessage } from "@/services/api";
import type { AIConfig } from "@/types";


export function AISettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ai-config"], queryFn: () => api<AIConfig>("/settings/ai") });
  const [f, setF] = useState({
    kind: "openai_compatible", base_url: "http://localhost:11434/v1", api_key: "",
    chat_model: "", embedding_model: "nomic-embed-text", embedding_base_url: "", embedding_api_key: "",
  });
  useEffect(() => {
    if (data?.configured)
      setF((p) => ({ ...p, kind: data.kind ?? p.kind, base_url: data.base_url ?? "", chat_model: data.chat_model ?? "",
        embedding_model: data.embedding_model ?? "", embedding_base_url: data.embedding_base_url ?? "" }));
  }, [data]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () => api("/settings/ai", { method: "PUT", body: JSON.stringify(f) }),
    onSuccess: () => { setF((p) => ({ ...p, api_key: "", embedding_api_key: "" })); qc.invalidateQueries({ queryKey: ["ai-config"] }); qc.invalidateQueries({ queryKey: ["ai-routes"] }); },
  });
  const test = useMutation({ mutationFn: () => api<{ embedding_dim: number }>("/settings/ai/test", { method: "POST" }) });

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold text-ink-900">AI provider</h2>
          <p className="text-sm text-ink-500">Keys are stored encrypted on the server and never shown again.</p>
        </div>
        <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
          data?.configured ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700")}>
          <span className={cn("size-1.5 rounded-full", data?.configured ? "bg-emerald-500" : "animate-pulse bg-amber-500")} />
          {data?.configured ? "Configured" : "Not set up"}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Provider" className="sm:col-span-2">
          <select className={control} value={f.kind} onChange={set("kind")}>
            <option value="openai_compatible">Local / custom OpenAI-compatible (Ollama, LM Studio, vLLM)</option>
            <option value="openai">OpenAI</option>
            <option value="azure_openai">Azure OpenAI</option>
          </select>
        </Label>
        <Label text="Base URL"><input className={control} value={f.base_url} onChange={set("base_url")} /></Label>
        <Label text="API key">
          <input className={control} type="password" autoComplete="off" placeholder={data?.has_api_key ? "Saved. Leave blank to keep." : "Optional for local models"}
            value={f.api_key} onChange={set("api_key")} />
        </Label>
        <Label text="Chat model"><input className={control} placeholder="e.g. llama3.1" value={f.chat_model} onChange={set("chat_model")} /></Label>
        <Label text="Embedding model"><input className={control} value={f.embedding_model} onChange={set("embedding_model")} /></Label>
        <Label text="Embedding base URL"><input className={control} placeholder="Defaults to Base URL" value={f.embedding_base_url} onChange={set("embedding_base_url")} /></Label>
        <Label text="Embedding API key"><input className={control} type="password" autoComplete="off" placeholder="Optional" value={f.embedding_api_key} onChange={set("embedding_api_key")} /></Label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!f.chat_model || !f.embedding_model || save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={() => test.mutate()} disabled={!data?.configured || test.isPending}>
          {test.isPending && <Loader2 className="size-4 animate-spin" />} Test connection
        </Button>
        {save.isSuccess && <span className="flex animate-pop items-center gap-1 text-sm font-semibold text-emerald-700"><Check className="size-4" /> Saved</span>}
        {test.isSuccess && <span className="animate-pop text-sm font-semibold text-emerald-700">Connected. Embedding dimension {test.data.embedding_dim}</span>}
      </div>
      {(save.isError || test.isError) && <p className="text-sm text-red-600">{errorMessage(save.error ?? test.error)}</p>}
    </section>
  );
}
