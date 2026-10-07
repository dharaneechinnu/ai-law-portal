import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { AIConfig } from "@/types";

const input = "w-full rounded-md border px-3 py-2 text-sm";

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
    onSuccess: () => { setF((p) => ({ ...p, api_key: "", embedding_api_key: "" })); qc.invalidateQueries({ queryKey: ["ai-config"] }); },
  });
  const test = useMutation({ mutationFn: () => api<{ embedding_dim: number }>("/settings/ai/test", { method: "POST" }) });

  return (
    <div className="max-w-xl space-y-3">
      <h1 className="text-xl font-semibold">AI Provider</h1>
      <p className="text-sm text-slate-500">Keys are stored encrypted on the server and never shown again.</p>
      <select className={input} value={f.kind} onChange={set("kind")}>
        <option value="openai_compatible">Local / custom OpenAI-compatible (Ollama, LM Studio, vLLM)</option>
        <option value="openai">OpenAI</option>
        <option value="azure_openai">Azure OpenAI</option>
      </select>
      <input className={input} placeholder="Base URL" value={f.base_url} onChange={set("base_url")} />
      <input className={input} type="password" placeholder={data?.has_api_key ? "API key (saved — leave blank to keep)" : "API key (optional for local)"}
        value={f.api_key} onChange={set("api_key")} />
      <input className={input} placeholder="Chat model (e.g. llama3.1)" value={f.chat_model} onChange={set("chat_model")} />
      <input className={input} placeholder="Embedding model" value={f.embedding_model} onChange={set("embedding_model")} />
      <input className={input} placeholder="Embedding base URL (optional, defaults to Base URL)" value={f.embedding_base_url} onChange={set("embedding_base_url")} />
      <input className={input} type="password" placeholder="Embedding API key (optional)" value={f.embedding_api_key} onChange={set("embedding_api_key")} />
      <div className="flex items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={!f.chat_model || !f.embedding_model || save.isPending}>Save</Button>
        <Button variant="outline" onClick={() => test.mutate()} disabled={!data?.configured || test.isPending}>Test connection</Button>
      </div>
      {save.isSuccess && <p className="text-sm text-green-700">Saved.</p>}
      {test.isSuccess && <p className="text-sm text-green-700">Connected. Embedding dimension: {test.data.embedding_dim}</p>}
      {(save.isError || test.isError) && <p className="text-sm text-red-600">{String(save.error ?? test.error)}</p>}
    </div>
  );
}
