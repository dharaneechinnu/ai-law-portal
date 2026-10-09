import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Briefcase, Building2, Mail, MapPin, Pencil, Phone, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, Label, control } from "@/components/ui/drawer";
import { EmptyState, PageHero, heroButton } from "@/components/ui/page";
import { initials } from "@/features/admin/roles";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Client, Matter } from "@/types";

const empty = { name: "", email: "", phone: "", address: "", notes: "" };

function ClientDrawer({ client, onClose, onSaved }: { client: Client | null; onClose: () => void; onSaved: (c: Client) => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState(client
    ? { name: client.name, email: client.email ?? "", phone: client.phone ?? "", address: client.address ?? "", notes: client.notes ?? "" }
    : empty);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ ...f, email: f.email || null, phone: f.phone || null, address: f.address || null, notes: f.notes || null });
      return client
        ? api<Client>(`/clients/${client.id}`, { method: "PUT", body })
        : api<Client>("/clients", { method: "POST", body });
    },
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["clients"] }); onSaved(c); onClose(); },
  });
  return (
    <Drawer title={client ? "Edit client" : "New client"} onClose={onClose}
      footer={<>
        <Button type="submit" form="client-form" disabled={!f.name.trim() || save.isPending}>{save.isPending ? "Saving…" : "Save client"}</Button>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
      </>}>
      <form id="client-form" className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (f.name.trim()) save.mutate(); }}>
        <Label text="Name"><input className={control} autoFocus required value={f.name} onChange={set("name")} /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Email"><input className={control} type="email" value={f.email} onChange={set("email")} /></Label>
          <Label text="Phone"><input className={control} value={f.phone} onChange={set("phone")} /></Label>
        </div>
        <Label text="Address"><textarea className={cn(control, "h-20 py-2")} value={f.address} onChange={set("address")} /></Label>
        <Label text="Notes"><textarea className={cn(control, "h-24 py-2")} value={f.notes} onChange={set("notes")} /></Label>
        {save.isError && <p className="text-sm text-red-600">{errorMessage(save.error)}</p>}
      </form>
    </Drawer>
  );
}

export function ClientsPage() {
  const { data: clients = [], isLoading } = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients") });
  const { data: matters = [] } = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters") });
  const [selected, setSelected] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<"new" | "edit" | null>(null);
  const [q, setQ] = useState("");

  const byClient = useMemo(() => {
    const map = new Map<string, Matter[]>();
    for (const m of matters) map.set(m.client_id, [...(map.get(m.client_id) ?? []), m]);
    return map;
  }, [matters]);
  const needle = q.trim().toLowerCase();
  const list = clients.filter((c) => !needle || [c.name, c.email, c.phone].some((v) => v?.toLowerCase().includes(needle)));
  const current = clients.find((c) => c.id === selected) ?? list[0] ?? null;
  const theirs = current ? byClient.get(current.id) ?? [] : [];

  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Building2} eyebrow="Work" title="Clients"
        sub={`${clients.length} ${clients.length === 1 ? "client" : "clients"}. Pick one to see contact details and matters.`}
        actions={<button className={heroButton} onClick={() => setDrawer("new")}><Plus className="size-4" /> New client</button>} />

      {isLoading && <div className="h-64 animate-pulse rounded-[20px] bg-ink-100/60" />}
      {!isLoading && clients.length === 0 && (
        <div className="rounded-[20px] border border-ink-100 bg-white">
          <EmptyState kind="people" className="py-12" title="No clients yet" hint="Add a client, then open matters for them."
            action={<Button onClick={() => setDrawer("new")}><Plus className="size-4" /> New client</Button>} />
        </div>
      )}

      {clients.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[minmax(280px,1fr)_2fr]">
          <div className="flex flex-col gap-3 rounded-[20px] border border-ink-100 bg-white p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a client" aria-label="Find a client"
                className="h-10 w-full rounded-xl border border-ink-100 bg-ink-50/50 pl-9 pr-3 text-sm outline-none transition focus:border-brass-400 focus:bg-white focus:ring-4 focus:ring-brass-300/25" />
            </div>
            <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto">
              {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-400">No match.</li>}
              {list.map((c, i) => {
                const on = current?.id === c.id;
                return (
                  <li key={c.id} style={{ animationDelay: `${i * 30}ms` }} className="animate-slide-up">
                    <button onClick={() => setSelected(c.id)} aria-current={on}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition",
                        on ? "bg-ink-900 text-snow dark:bg-ink-100" : "hover:bg-ink-50")}>
                      <span className={cn("grid size-9 shrink-0 place-items-center rounded-full text-xs font-bold",
                        on ? "bg-gradient-to-br from-brass-300 to-brass-500 text-night-950" : "bg-ink-100 text-ink-700")}>{initials(c.name)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{c.name}</span>
                        <span className={cn("block truncate text-xs", on ? "text-night-200 dark:text-ink-500" : "text-ink-400")}>
                          {(byClient.get(c.id)?.length ?? 0)} {(byClient.get(c.id)?.length ?? 0) === 1 ? "matter" : "matters"}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {current && (
            <section key={current.id} className="animate-[week-right_0.35s_cubic-bezier(0.2,0.7,0.2,1)_both] rounded-[20px] border border-ink-100 bg-white p-6">
              <div className="flex flex-wrap items-start gap-4">
                <span className="grid size-14 shrink-0 animate-pop place-items-center rounded-2xl bg-gradient-to-br from-brass-300 to-brass-500 text-lg font-bold text-night-950">{initials(current.name)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-serif text-2xl font-bold text-ink-900">{current.name}</h2>
                  <p className="text-sm text-ink-400">{theirs.length} {theirs.length === 1 ? "matter" : "matters"}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => setDrawer("edit")}><Pencil className="size-3.5" /> Edit</Button>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-3">
                {([[Mail, "Email", current.email], [Phone, "Phone", current.phone], [MapPin, "Address", current.address]] as const).map(([Icon, k, v]) => (
                  <div key={k} className="rounded-2xl bg-ink-50 p-3.5">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-ink-400"><Icon className="size-3.5" /> {k}</div>
                    <div className="mt-1 break-words text-sm font-medium text-ink-900">{v || "—"}</div>
                  </div>
                ))}
              </div>
              {current.notes && <p className="mt-4 whitespace-pre-wrap rounded-2xl border border-ink-100 p-4 text-sm text-ink-700">{current.notes}</p>}
              <div className="mt-6 flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold text-ink-900">Matters</h3>
                <Link to="/matters?new=1" className="text-sm font-semibold text-brass-700 hover:underline">New matter</Link>
              </div>
              {theirs.length === 0 ? <p className="mt-2 text-sm text-ink-400">No matters for this client yet.</p> : (
                <ul className="mt-3 grid gap-2 md:grid-cols-2">
                  {theirs.map((m) => (
                    <li key={m.id}>
                      <Link to={`/matters/${m.id}`} className="group flex items-center gap-3 rounded-xl border border-ink-100 px-3 py-2.5 transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-md">
                        <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300"><Briefcase className="size-4" /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink-900 group-hover:text-brass-700">{m.title}</span>
                          <span className="block text-xs capitalize text-ink-400">{m.matter_number} · {m.status}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}

      {drawer && (
        <ClientDrawer client={drawer === "edit" ? current : null} onClose={() => setDrawer(null)} onSaved={(c) => setSelected(c.id)} />
      )}
    </div>
  );
}
