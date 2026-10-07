import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { Client, Matter } from "@/types";

const input = "w-full rounded-md border px-3 py-2 text-sm";

function NewMatterForm({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const [form, setForm] = useState({ title: "", case_number: "", court: "", practice_area: "", description: "" });
  const [clientId, setClientId] = useState("");
  const [newClient, setNewClient] = useState("");
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const create = useMutation({
    mutationFn: async () => {
      let cid = clientId;
      if (!cid) {
        const c = await api<Client>("/clients", { method: "POST", body: JSON.stringify({ name: newClient }) });
        cid = c.id;
      }
      const body = Object.fromEntries(Object.entries(form).filter(([, v]) => v));
      return api<Matter>("/matters", { method: "POST", body: JSON.stringify({ ...body, client_id: cid }) });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["matters"] });
      qc.invalidateQueries({ queryKey: ["clients"] });
      onDone();
    },
  });

  return (
    <form
      className="mb-6 grid max-w-2xl gap-3 rounded-lg border bg-white p-4"
      onSubmit={(e) => { e.preventDefault(); create.mutate(); }}
    >
      <input className={input} placeholder="Matter title *" required value={form.title} onChange={set("title")} />
      <div className="grid grid-cols-2 gap-3">
        <select className={input} value={clientId} onChange={(e) => setClientId(e.target.value)}>
          <option value="">+ New client…</option>
          {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {!clientId && <input className={input} placeholder="New client name *" required value={newClient}
          onChange={(e) => setNewClient(e.target.value)} />}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <input className={input} placeholder="Case number" value={form.case_number} onChange={set("case_number")} />
        <input className={input} placeholder="Court" value={form.court} onChange={set("court")} />
        <input className={input} placeholder="Practice area" value={form.practice_area} onChange={set("practice_area")} />
      </div>
      <textarea className={input} placeholder="Description" value={form.description} onChange={set("description")} />
      {create.isError && <p className="text-sm text-red-600">{String(create.error)}</p>}
      <div className="flex gap-2">
        <Button type="submit" disabled={create.isPending}>Create matter</Button>
        <Button type="button" variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
    </form>
  );
}

export function MattersPage() {
  const [creating, setCreating] = useState(false);
  const { data: matters = [] } = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters") });
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Matters</h1>
        {!creating && <Button onClick={() => setCreating(true)}>New matter</Button>}
      </div>
      {creating && <NewMatterForm onDone={() => setCreating(false)} />}
      <div className="divide-y rounded-lg border bg-white">
        {matters.length === 0 && <p className="p-4 text-sm text-slate-500">No matters yet.</p>}
        {matters.map((m) => (
          <Link key={m.id} to={`/matters/${m.id}`} className="flex items-center justify-between p-4 hover:bg-slate-50">
            <div>
              <div className="font-medium">{m.title}</div>
              <div className="text-xs text-slate-500">{m.matter_number} · {m.court ?? "No court"} · {m.practice_area ?? "—"}</div>
            </div>
            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs">{m.status}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
