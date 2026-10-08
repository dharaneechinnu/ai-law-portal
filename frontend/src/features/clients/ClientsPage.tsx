import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import type { Client } from "@/types";

const input = "w-full rounded-md border px-3 py-2 text-sm";
const empty = { name: "", email: "", phone: "", address: "", notes: "" };

export function ClientsPage() {
  const qc = useQueryClient();
  const { data: clients = [] } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [f, setF] = useState(empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setF({ ...f, [k]: e.target.value });

  const open = (c?: Client) => {
    setEditing(c ? c.id : "new");
    setF(c ? { name: c.name, email: c.email ?? "", phone: c.phone ?? "", address: c.address ?? "", notes: c.notes ?? "" } : empty);
  };
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ ...f, email: f.email || null, phone: f.phone || null, address: f.address || null, notes: f.notes || null });
      return editing === "new"
        ? api<Client>("/clients", { method: "POST", body })
        : api<Client>(`/clients/${editing}`, { method: "PUT", body });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["clients"] }); setEditing(null); },
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Clients</h1>
        {!editing && <Button onClick={() => open()}>New client</Button>}
      </div>
      {editing && (
        <form className="mb-6 grid max-w-2xl gap-3 rounded-lg border bg-white p-4"
          onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <input className={input} placeholder="Client name *" required value={f.name} onChange={set("name")} />
          <div className="grid grid-cols-2 gap-3">
            <input className={input} type="email" placeholder="Email" value={f.email} onChange={set("email")} />
            <input className={input} placeholder="Phone" value={f.phone} onChange={set("phone")} />
          </div>
          <textarea className={input} placeholder="Address" value={f.address} onChange={set("address")} />
          <textarea className={input} placeholder="Notes" value={f.notes} onChange={set("notes")} />
          {save.isError && <p className="text-sm text-red-600">{String(save.error)}</p>}
          <div className="flex gap-2">
            <Button type="submit" disabled={save.isPending}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
          </div>
        </form>
      )}
      <div className="divide-y rounded-lg border bg-white">
        {clients.length === 0 && <p className="p-4 text-sm text-slate-500">No clients yet.</p>}
        {clients.map((c) => (
          <div key={c.id} className="flex items-center justify-between p-4">
            <div>
              <div className="font-medium">{c.name}</div>
              <div className="text-xs text-slate-500">{[c.email, c.phone].filter(Boolean).join(" · ") || "No contact details"}</div>
            </div>
            <Button variant="ghost" onClick={() => open(c)}>Edit</Button>
          </div>
        ))}
      </div>
    </div>
  );
}
