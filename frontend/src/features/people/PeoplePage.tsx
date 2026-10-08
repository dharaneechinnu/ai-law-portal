import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Briefcase, Mail, MapPin, Phone, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Person, PersonDetail } from "@/types";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function StatusDot({ p }: { p: Person }) {
  const map = {
    free: ["bg-emerald-500", "Free now"],
    busy: ["bg-amber-500", p.busy_until ? `Busy until ${time(p.busy_until)}` : "Busy"],
    off: ["bg-ink-300", "Off hours"],
  } as const;
  const [dot, label] = map[p.status];
  return (
    <span className="flex items-center gap-1.5 text-xs text-ink-500">
      <span className="relative flex size-2">
        {p.status === "free" && <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
        <span className={cn("relative inline-flex size-2 rounded-full", dot)} />
      </span>
      {label}
    </span>
  );
}

/** Workload bar: open tasks against a soft cap of 15, overdue shown in red. */
function Load({ p }: { p: Person }) {
  const pct = Math.min(100, (p.open_tasks / 15) * 100);
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs text-ink-400">
        <span>{p.open_tasks} open tasks{p.overdue_tasks ? <span className="text-red-600"> · {p.overdue_tasks} overdue</span> : null}</span>
        <span>{p.active_matters} matters</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-ink-50">
        <div className={cn("h-full origin-left animate-grow rounded-full", pct > 80 ? "bg-red-500" : pct > 50 ? "bg-amber-400" : "bg-emerald-500")}
          style={{ width: `${Math.max(pct, 3)}%` }} />
      </div>
    </div>
  );
}

function Profile({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: p } = useQuery({ queryKey: ["person", id], queryFn: () => api<PersonDetail>(`/people/${id}`) });
  return (
    <Drawer title="Profile" onClose={onClose}>
      {!p ? <div className="h-40 animate-pulse rounded-xl bg-ink-50" /> : (
        <div className="space-y-6">
          <div className="flex items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 text-lg font-semibold text-ink-950">{initials(p.name)}</span>
            <div className="min-w-0">
              <div className="truncate text-lg font-semibold text-ink-900">{p.name}</div>
              <div className="text-sm capitalize text-ink-400">{p.designation || p.role_name}</div>
              <StatusDot p={p} />
            </div>
          </div>
          <div className="space-y-1.5 text-sm text-ink-600">
            <a href={`mailto:${p.email}`} className="flex items-center gap-2 hover:text-brass-700"><Mail className="size-4 text-ink-300" />{p.email}</a>
            {p.phone && <div className="flex items-center gap-2"><Phone className="size-4 text-ink-300" />{p.phone}</div>}
            {p.office_location && <div className="flex items-center gap-2"><MapPin className="size-4 text-ink-300" />{p.office_location}</div>}
          </div>
          {p.practice_areas.length > 0 && (
            <div className="flex flex-wrap gap-1.5">{p.practice_areas.map((a) => <span key={a} className="rounded-full bg-ink-50 px-2.5 py-1 text-xs text-ink-600">{a}</span>)}</div>
          )}
          <Load p={p} />
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Working hours</h3>
            <div className="grid grid-cols-7 gap-1 text-center text-xs">
              {DAYS.map((d) => {
                const h = p.working_hours[d];
                return (
                  <div key={d} className={cn("rounded-lg py-1.5", h ? "bg-emerald-50 text-emerald-800" : "bg-ink-50 text-ink-300")}>
                    <div className="font-medium capitalize">{d}</div>
                    <div className="text-[10px] tabular-nums">{h ? `${h[0]}–${h[1]}` : "Off"}</div>
                  </div>
                );
              })}
            </div>
          </section>
          <section>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Busy · next 7 days</h3>
            {p.busy.length ? (
              <div className="space-y-1">
                {p.busy.map((b, i) => (
                  <div key={i} style={{ animationDelay: `${i * 30}ms` }} className="flex animate-slide-up items-center justify-between rounded-lg bg-ink-50 px-3 py-1.5 text-xs">
                    <span className="truncate text-ink-700">{b.title}</span>
                    <span className="shrink-0 tabular-nums text-ink-400">
                      {new Date(b.start).toLocaleDateString([], { weekday: "short", day: "numeric" })} · {time(b.start)}–{time(b.end)}
                    </span>
                  </div>
                ))}
              </div>
            ) : <p className="text-sm text-ink-300">No bookings.</p>}
          </section>
          {p.matters.length > 0 && (
            <section>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-ink-400">Matters</h3>
              <div className="-mx-2">
                {p.matters.map((m) => (
                  <Link key={m.id} to={`/matters/${m.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition hover:bg-ink-50">
                    <Briefcase className="size-4 text-ink-300" /><span className="truncate text-ink-800">{m.title}</span>
                    <span className="ml-auto shrink-0 text-xs text-ink-400">{m.matter_number}</span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  );
}

export function PeoplePage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [area, setArea] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const { data: people = [], isLoading } = useQuery({ queryKey: ["people"], queryFn: () => api<Person[]>("/people"), refetchInterval: 60_000 });
  const areas = useMemo(() => [...new Set(people.flatMap((p) => p.practice_areas))].sort(), [people]);
  const shown = people.filter((p) =>
    (!area || p.practice_areas.includes(area)) &&
    (!q || `${p.name} ${p.designation ?? ""} ${p.role_name}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap animate-fade-up items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">People</h1>
          <p className="mt-1 text-sm text-ink-400">{people.filter((p) => p.status === "free").length} free now</p>
        </div>
        {user?.role_name === "admin" && (
          <Button asChild variant="outline" size="sm"><Link to="/admin/users"><UserPlus className="size-4" /> Add person</Link></Button>
        )}
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
            className="h-10 w-full rounded-xl border border-ink-100 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
        </div>
        {areas.length > 0 && (
          <select value={area} onChange={(e) => setArea(e.target.value)}
            className="h-10 rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brass-400">
            <option value="">All practice areas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        )}
      </div>
      {isLoading && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-ink-50" />)}</div>}
      {!isLoading && !shown.length && <p className="animate-fade-in py-10 text-center text-sm text-ink-300">No one matches.</p>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((p, i) => (
          <button key={p.id} onClick={() => setOpen(p.id)} style={{ animationDelay: `${i * 40}ms` }}
            className="flex animate-fade-up flex-col gap-4 rounded-2xl border border-ink-100 bg-white/80 p-5 text-left shadow-sm transition hover:-translate-y-1 hover:border-brass-300 hover:shadow-lg">
            <div className="flex items-center gap-3">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-ink-600 to-ink-900 text-sm font-semibold text-white">{initials(p.name)}</span>
              <div className="min-w-0">
                <div className="truncate font-medium text-ink-900">{p.name}</div>
                <div className="truncate text-xs capitalize text-ink-400">{p.designation || p.role_name}</div>
              </div>
            </div>
            <StatusDot p={p} />
            {p.practice_areas.length > 0 && (
              <div className="flex flex-wrap gap-1">{p.practice_areas.slice(0, 3).map((a) => <span key={a} className="rounded-full bg-ink-50 px-2 py-0.5 text-[11px] text-ink-600">{a}</span>)}</div>
            )}
            <Load p={p} />
          </button>
        ))}
      </div>
      {open && <Profile id={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
