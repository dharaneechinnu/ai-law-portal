import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label, control } from "@/components/ui/drawer";
import { api, errorMessage } from "@/services/api";
import type { LegalSource } from "@/types";


// Empty skeleton only: the real paths and field names come from your eCourts provider's documentation.
const TEMPLATE = {
  auth: { header: "Authorization", prefix: "Bearer " },
  endpoints: {
    test: { method: "GET", path: "" },
    search_cases: { method: "GET", path: "", params: { q: "{query}" }, items_path: "" },
    get_case: { method: "GET", path: "/{id}", item_path: "" },
    get_orders: { method: "GET", path: "/{id}", items_path: "" },
    get_judgments: { method: "GET", path: "", params: {}, items_path: "" },
  },
  mappings: {
    case: { external_id: "", case_number: "", title: "", case_type: "", status: "", filing_date: "", source_url: "",
      court_name: "", court_id: "", court_state: "", parties: "", party_name: "", party_role: "" },
    judgment: { external_id: "", case_external_id: "", title: "", date: "", court_name: "", court_id: "",
      summary: "", full_text: "", provisions: "", bench: "", outcome: "", source_url: "" },
  },
};

export function LegalSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["legal-source"], queryFn: () => api<LegalSource>("/settings/legal") });
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [config, setConfig] = useState(JSON.stringify(TEMPLATE, null, 2));
  const [jsonError, setJsonError] = useState("");
  useEffect(() => {
    if (!data) return;
    setBaseUrl(data.base_url ?? "");
    setEnabled(data.configured ? data.enabled : true);
    if (Object.keys(data.config ?? {}).length) setConfig(JSON.stringify(data.config, null, 2));
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(config);
        setJsonError("");
      } catch {
        setJsonError("Config is not valid JSON.");
        throw new Error("Config is not valid JSON.");
      }
      return api("/settings/legal", { method: "PUT", body: JSON.stringify({ base_url: baseUrl, api_key: apiKey || null, config: parsed, enabled }) });
    },
    onSuccess: () => { setApiKey(""); qc.invalidateQueries({ queryKey: ["legal-source"] }); },
  });
  const test = useMutation({ mutationFn: () => api("/settings/legal/test", { method: "POST" }) });

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-serif text-xl font-bold text-ink-900">Legal data (eCourts)</h2>
        <p className="text-sm text-ink-500">
          The API key is stored encrypted on the server and never shown again. Endpoint paths and field mapping come from your
          eCourts provider's documentation; nothing is assumed.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Label text="Base URL"><input className={control} placeholder="From your provider's docs" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} /></Label>
        <Label text="API key">
          <input className={control} type="password" autoComplete="off" placeholder={data?.has_api_key ? "Saved. Leave blank to keep." : ""}
            value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
        </Label>
      </div>
      <label className="flex w-fit cursor-pointer items-center gap-2 rounded-xl bg-ink-50 px-3 py-2 text-sm font-medium text-ink-700">
        <input type="checkbox" className="size-4 accent-ink-900" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Enabled
      </label>
      <Label text="Auth, endpoints and field mapping (JSON)">
        <textarea className={`${control} h-80 py-2 font-mono text-xs`} value={config} onChange={(e) => setConfig(e.target.value)} spellCheck={false} />
      </Label>
      <p className="-mt-2 text-xs text-ink-400">
        Paths can use placeholders like {"{id}"}, {"{query}"} or your own filter names. Mapping values are dot paths into one
        item of the response, e.g. <code>court.name</code>.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save"}</Button>
        <Button variant="outline" onClick={() => test.mutate()} disabled={!data?.configured || test.isPending}>Test connection</Button>
        {save.isSuccess && <span className="animate-pop text-sm font-semibold text-emerald-700">Saved</span>}
        {test.isSuccess && <span className="animate-pop text-sm font-semibold text-emerald-700">Connected</span>}
      </div>
      {data?.last_synced_at && <p className="text-xs text-ink-400">Last fetch: {new Date(data.last_synced_at).toLocaleString()}</p>}
      {(jsonError || save.isError || test.isError) && (
        <p className="text-sm text-red-600">{jsonError || errorMessage(save.error ?? test.error)}</p>
      )}
    </section>
  );
}
