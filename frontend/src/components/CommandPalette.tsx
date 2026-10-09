import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight, Briefcase, Building2, CheckCircle2, CornerDownLeft, Keyboard, Moon, Plus, Search, Sparkles, Sun, UserRound,
} from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/page";
import { GO_KEYS, MOD, fire, useCommand } from "@/lib/shortcuts";
import { useTheme } from "@/lib/theme";
import type { Client, Matter, Person, Task } from "@/types";

type Item = {
  id: string;
  group: "Actions" | "Go to" | "Matters" | "Clients" | "People" | "Tasks";
  label: string;
  hint?: string;
  icon: typeof Search;
  keys?: string[];
  run: () => void;
};

/** Case-insensitive match on every word, so "smith lease" finds "Lease dispute — Smith". */
const matches = (q: string, ...fields: (string | null | undefined)[]) => {
  const hay = fields.filter(Boolean).join(" ").toLowerCase();
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w));
};

/** Ctrl/⌘+K: jump to any page, record or action. Records load once when it opens and are filtered here. */
export function CommandPalette() {
  const nav = useNavigate();
  const { resolved, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);

  useCommand("palette", useCallback(() => setOpen((o) => !o), []));
  useEffect(() => { if (open) { setQ(""); setActive(0); } }, [open]);

  const opts = { enabled: open, staleTime: 60_000 };
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters"), ...opts });
  const clients = useQuery({ queryKey: ["clients"], queryFn: () => api<Client[]>("/clients"), ...opts });
  const people = useQuery({ queryKey: ["people"], queryFn: () => api<Person[]>("/people"), ...opts });
  const tasks = useQuery({ queryKey: ["tasks", "palette"], queryFn: () => api<Task[]>("/tasks?scope=all"), ...opts });

  const close = () => setOpen(false);
  const go = (to: string) => () => { close(); nav(to); };

  const items = useMemo<Item[]>(() => {
    const actions: Item[] = [
      { id: "a-ai", group: "Actions", label: "Ask the assistant", icon: Sparkles, keys: [MOD, "J"], run: () => { close(); fire("assistant"); } },
      { id: "a-task", group: "Actions", label: "New task", icon: Plus, run: () => { close(); nav("/tasks?new=1"); } },
      { id: "a-matter", group: "Actions", label: "New matter", icon: Plus, run: () => { close(); nav("/matters?new=1"); } },
      { id: "a-theme", group: "Actions", label: resolved === "dark" ? "Light theme" : "Dark theme", icon: resolved === "dark" ? Sun : Moon,
        keys: ["Shift", "D"], run: () => { close(); toggle(); } },
      { id: "a-keys", group: "Actions", label: "Keyboard shortcuts", icon: Keyboard, keys: ["?"], run: () => { close(); fire("shortcuts"); } },
    ];
    const pages: Item[] = Object.entries(GO_KEYS).map(([k, [to, label]]) => ({
      id: `p-${to}`, group: "Go to", label, icon: ArrowRight, keys: ["G", k.toUpperCase()], run: go(to),
    }));
    const base = [...actions, ...pages].filter((i) => !q || matches(q, i.label));
    if (!q.trim()) return base;
    const take = <T,>(rows: T[] | undefined, f: (r: T) => boolean) => (rows ?? []).filter(f).slice(0, 5);
    return [
      ...base,
      ...take(matters.data, (m) => matches(q, m.title, m.matter_number, m.case_number, m.court)).map<Item>((m) => ({
        id: `m-${m.id}`, group: "Matters", label: m.title, hint: m.matter_number, icon: Briefcase, run: go(`/matters/${m.id}`),
      })),
      ...take(clients.data, (c) => matches(q, c.name, c.email)).map<Item>((c) => ({
        id: `c-${c.id}`, group: "Clients", label: c.name, hint: c.email ?? undefined, icon: Building2, run: go(`/clients?client=${c.id}`),
      })),
      ...take(people.data, (p) => matches(q, p.name, p.email, p.designation, p.practice_areas.join(" "))).map<Item>((p) => ({
        id: `u-${p.id}`, group: "People", label: p.name, hint: p.designation ?? p.role_name, icon: UserRound, run: go(`/people?person=${p.id}`),
      })),
      ...take(tasks.data, (t) => matches(q, t.title, t.matter_title)).map<Item>((t) => ({
        id: `t-${t.id}`, group: "Tasks", label: t.title, hint: t.matter_title ?? undefined, icon: CheckCircle2,
        run: go(t.matter_id ? `/matters/${t.matter_id}?tab=Tasks` : "/tasks"),
      })),
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, resolved, matters.data, clients.data, people.data, tasks.data]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    list.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;
  const loading = !!q.trim() && [matters, clients, people, tasks].some((r) => r.isLoading);

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Enter") { e.preventDefault(); items[active]?.run(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  };

  let lastGroup = "";
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]" onMouseDown={close}>
      <div className="absolute inset-0 animate-fade-in bg-night-950/40 backdrop-blur-sm" />
      <div role="dialog" aria-label="Search" onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-xl animate-palette overflow-hidden rounded-3xl border border-ink-100 bg-white shadow-[0_30px_60px_rgba(7,13,32,0.35)]">
        <div className="flex items-center gap-3 border-b border-ink-100 px-4">
          <Search className="size-[18px] shrink-0 text-brass-500" />
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search matters, clients, people, tasks…" aria-label="Search"
            className="h-14 flex-1 bg-transparent text-[15px] text-ink-900 outline-none placeholder:text-ink-300" />
          <kbd>Esc</kbd>
        </div>

        <div ref={list} className="max-h-[min(60vh,26rem)] overflow-y-auto p-2">
          {!items.length && !loading && <EmptyState kind="search" title={`No results for “${q}”`} hint="Try a matter number, client or person." />}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? (lastGroup = it.group) : null;
            const Icon = it.icon;
            return (
              <div key={it.id}>
                {header && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{header}</div>}
                <button data-i={i} onClick={it.run} onMouseMove={() => setActive(i)}
                  className={cn("relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition-colors",
                    i === active ? "bg-ink-50 font-medium text-ink-900" : "text-ink-700")}>
                  {i === active && <span className="absolute inset-y-2 left-0 w-[3px] animate-fade-in rounded-full bg-gradient-to-b from-brass-300 to-brass-500" />}
                  <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                    i === active ? "bg-gradient-to-br from-night-800 to-night-950 text-brass-300" : "bg-ink-50 text-ink-500")}>
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {it.label}
                    {it.hint && <span className="ml-2 text-xs text-ink-400">{it.hint}</span>}
                  </span>
                  {it.keys && <span className="flex gap-1">{it.keys.map((k) => <kbd key={k}>{k}</kbd>)}</span>}
                  {i === active && !it.keys && <CornerDownLeft className="size-3.5 animate-fade-in text-ink-400" />}
                </button>
              </div>
            );
          })}
          {loading && <div className="m-2 h-10 animate-pulse rounded-xl bg-ink-50" />}
        </div>

        <footer className="flex items-center gap-4 border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-[11px] text-ink-400">
          <span className="flex items-center gap-1"><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span className="flex items-center gap-1"><kbd>↵</kbd> open</span>
          <span className="ml-auto flex items-center gap-1"><kbd>?</kbd> all shortcuts</span>
        </footer>
      </div>
    </div>
  );
}
