import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Check, Flag, Lock, Plus, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Tabs } from "@/components/ui/page";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Matter, Task, TaskStatus, UserBrief } from "@/types";

const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
const PRIORITY_TONE: Record<string, string> = {
  low: "text-ink-300", medium: "text-ink-400", high: "text-amber-500", urgent: "text-red-600",
};
const control = "h-9 rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-800 outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25";

/** Due date input (yyyy-mm-dd) to an ISO timestamp at 6 pm local time. */
const toDue = (d: string) => (d ? new Date(`${d}T18:00`).toISOString() : null);
const toInput = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fmtDue = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }) : "";

type Group = "Overdue" | "Today" | "This week" | "Later" | "No date";
function groupOf(t: Task): Group {
  if (!t.due_at) return "No date";
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const due = new Date(t.due_at).getTime();
  const day = 86_400_000;
  if (due < start.getTime()) return "Overdue";
  if (due < start.getTime() + day) return "Today";
  if (due < start.getTime() + 7 * day) return "This week";
  return "Later";
}
const GROUPS: Group[] = ["Overdue", "Today", "This week", "Later", "No date"];

function useTaskData() {
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserBrief[]>("/auth/users") });
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters") });
  return { users: users.data ?? [], matters: matters.data ?? [] };
}

function QuickAdd({ matterId, onAdded }: { matterId?: string; onAdded: () => void }) {
  const { user } = useAuth();
  const { users, matters } = useTaskData();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [priority, setPriority] = useState("medium");
  const [assignee, setAssignee] = useState(user?.id ?? "");
  const [matter, setMatter] = useState(matterId ?? "");
  const add = useMutation({
    mutationFn: () => api<Task>("/tasks", {
      method: "POST",
      body: JSON.stringify({ title: title.trim(), due_at: toDue(due), priority, assignee_id: assignee || null, matter_id: matter || null }),
    }),
    onSuccess: () => { setTitle(""); setDue(""); setPriority("medium"); onAdded(); },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (title.trim()) add.mutate(); }}
      className="mb-5 rounded-2xl border border-ink-100 bg-white p-3 shadow-sm transition focus-within:border-brass-300 focus-within:shadow-md">
      <div className="flex items-center gap-2">
        <Plus className="ml-1 size-4 shrink-0 text-ink-300" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Add a task"
          className="h-9 flex-1 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ink-300" />
        <Button size="sm" disabled={!title.trim() || add.isPending}>Add</Button>
      </div>
      {title.trim() && (
        <div className="mt-2 flex animate-fade-in flex-wrap gap-2 border-t border-ink-50 pt-2">
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className={control} aria-label="Due date" />
          <select value={priority} onChange={(e) => setPriority(e.target.value)} className={control} aria-label="Priority">
            {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={control} aria-label="Assignee">
            <option value="">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.id === user?.id ? "Me" : u.name}</option>)}
          </select>
          {!matterId && (
            <select value={matter} onChange={(e) => setMatter(e.target.value)} className={cn(control, "max-w-56")} aria-label="Matter">
              <option value="">No matter</option>
              {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          )}
        </div>
      )}
      {add.isError && <p className="mt-2 text-xs text-red-600">{errorMessage(add.error)}</p>}
    </form>
  );
}

function Row({ t, i, showMatter, onOpen }: { t: Task; i: number; showMatter: boolean; onOpen: () => void }) {
  const qc = useQueryClient();
  const toggle = useMutation({
    mutationFn: () => api<Task>(`/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: t.status === "done" ? "open" : "done" }) }),
    onSettled: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); },
  });
  const done = t.status === "done";
  const overdue = !done && groupOf(t) === "Overdue";
  return (
    <div style={{ animationDelay: `${i * 30}ms` }}
      className="group flex animate-slide-up items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-ink-50">
      <button onClick={() => toggle.mutate()} disabled={t.status === "archived" || (t.blocked && !done) || toggle.isPending}
        aria-label={done ? "Mark as open" : "Mark as done"}
        title={t.blocked && !done ? "Finish the tasks this depends on first" : undefined}
        className={cn(
          "grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all duration-300",
          done ? "border-emerald-500 bg-emerald-500 text-white" : "border-ink-200 text-transparent hover:border-emerald-400 hover:text-emerald-400",
          t.blocked && !done && "cursor-not-allowed opacity-50",
        )}>
        <Check className={cn("size-3 transition-transform duration-300", done ? "scale-100" : "scale-0 group-hover:scale-100")} strokeWidth={3} />
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <span className={cn("block truncate text-sm transition-colors", done ? "text-ink-300 line-through" : "text-ink-900")}>{t.title}</span>
        <span className="flex items-center gap-2 text-xs text-ink-400">
          {showMatter && t.matter_title && <span className="truncate">{t.matter_title}</span>}
          {t.assignee_name && <span className="truncate">{showMatter && t.matter_title ? "· " : ""}{t.assignee_name}</span>}
          {t.blocked && !done && <span className="flex items-center gap-1 text-amber-600"><Lock className="size-3" /> Waiting</span>}
        </span>
      </button>
      {t.priority !== "medium" && <Flag className={cn("size-3.5 shrink-0", PRIORITY_TONE[t.priority])} aria-label={`${t.priority} priority`} />}
      <span className={cn("shrink-0 text-xs tabular-nums", overdue ? "font-medium text-red-600" : "text-ink-400")}>{fmtDue(t.due_at)}</span>
    </div>
  );
}

function Drawer({ t, all, onClose }: { t: Task; all: Task[]; onClose: () => void }) {
  const qc = useQueryClient();
  const { users } = useTaskData();
  const [f, setF] = useState({
    title: t.title, description: t.description ?? "", due: toInput(t.due_at), priority: t.priority,
    assignee: t.assignee_id ?? "", depends_on: t.depends_on,
  });
  const save = useMutation({
    mutationFn: (extra: Partial<{ status: TaskStatus }> = {}) => api<Task>(`/tasks/${t.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: f.title.trim(), description: f.description || null, due_at: toDue(f.due), priority: f.priority,
        assignee_id: f.assignee || null, depends_on: f.depends_on, ...extra,
      }),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); onClose(); },
  });
  const options = all.filter((o) => o.id !== t.id && o.status !== "archived" && !f.depends_on.includes(o.id));
  const byId = new Map(all.map((o) => [o.id, o]));
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-label="Task" className="relative flex h-full w-full max-w-md animate-slide-in flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-700">Task</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-ink-50 hover:text-ink-600">
            <X className="size-4" />
          </button>
        </header>
        <form id="task-form" className="flex-1 space-y-4 overflow-y-auto p-5"
          onSubmit={(e) => { e.preventDefault(); save.mutate({}); }}>
          <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} aria-label="Title"
            className="w-full text-lg font-medium text-ink-900 outline-none" />
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })}
            placeholder="Notes" rows={4}
            className="w-full resize-none rounded-xl border border-ink-100 p-3 text-sm outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs text-ink-400">Due
              <input type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className={cn(control, "w-full")} />
            </label>
            <label className="space-y-1 text-xs text-ink-400">Priority
              <select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })} className={cn(control, "w-full")}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
              </select>
            </label>
            <label className="col-span-2 space-y-1 text-xs text-ink-400">Assignee
              <select value={f.assignee} onChange={(e) => setF({ ...f, assignee: e.target.value })} className={cn(control, "w-full")}>
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </label>
          </div>
          <div className="space-y-2">
            <div className="text-xs text-ink-400">Depends on</div>
            <div className="flex flex-wrap gap-1.5">
              {f.depends_on.map((id) => (
                <span key={id} className="flex animate-pop items-center gap-1 rounded-full bg-ink-50 py-1 pl-2.5 pr-1 text-xs text-ink-700">
                  {byId.get(id)?.title ?? "Task"}
                  <button type="button" onClick={() => setF({ ...f, depends_on: f.depends_on.filter((d) => d !== id) })}
                    aria-label="Remove" className="grid size-4 place-items-center rounded-full hover:bg-ink-200"><X className="size-3" /></button>
                </span>
              ))}
            </div>
            {options.length > 0 && (
              <select value="" onChange={(e) => e.target.value && setF({ ...f, depends_on: [...f.depends_on, e.target.value] })}
                className={cn(control, "w-full text-ink-400")}>
                <option value="">Add a task it waits on</option>
                {options.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
              </select>
            )}
          </div>
          {t.matter_id && (
            <Link to={`/matters/${t.matter_id}`} className="block text-xs text-brass-700 hover:underline">{t.matter_title}</Link>
          )}
          {save.isError && <p className="text-xs text-red-600">{errorMessage(save.error)}</p>}
        </form>
        <footer className="flex items-center gap-2 border-t border-ink-50 px-5 py-4">
          {t.status === "archived" ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => save.mutate({ status: "open" })}><RotateCcw className="size-4" /> Restore</Button>
          ) : (
            <Button type="button" variant="ghost" size="sm" onClick={() => save.mutate({ status: "archived" })}><Archive className="size-4" /> Archive</Button>
          )}
          <div className="flex-1" />
          <Button type="button" variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" form="task-form" disabled={!f.title.trim() || save.isPending}>Save</Button>
        </footer>
      </aside>
    </div>,
    document.body,
  );
}

const STATUS_TABS: [TaskStatus, string][] = [["open", "Open"], ["done", "Done"], ["archived", "Archived"]];

/** Task list with quick add, grouping by due date and an edit drawer. Used on /tasks and the matter Tasks tab. */
export function TaskList({ matterId, scope = "all" }: { matterId?: string; scope?: "mine" | "all" }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<TaskStatus>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const params = new URLSearchParams({ status, scope });
  if (matterId) params.set("matter_id", matterId);
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks", matterId ?? "", scope, status],
    queryFn: () => api<Task[]>(`/tasks?${params}`),
  });
  const { data: everything = [] } = useQuery({
    queryKey: ["tasks", matterId ?? "", "all", "pickable"],
    queryFn: () => api<Task[]>(`/tasks?${new URLSearchParams({ status: "any", scope: "all", ...(matterId ? { matter_id: matterId } : {}) })}`),
    enabled: !!openId,
  });
  const grouped = useMemo(() => {
    if (status !== "open") return [["", tasks] as const];
    return GROUPS.map((g) => [g, tasks.filter((t) => groupOf(t) === g)] as const).filter(([, l]) => l.length);
  }, [tasks, status]);
  const current = tasks.find((t) => t.id === openId);

  return (
    <div>
      <QuickAdd matterId={matterId} onAdded={() => { qc.invalidateQueries({ queryKey: ["tasks"] }); qc.invalidateQueries({ queryKey: ["dashboard"] }); }} />
      <div className="mb-3 flex"><Tabs label="Task status" value={status} onChange={setStatus} items={STATUS_TABS} /></div>
      {isLoading && <div className="space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-11 animate-pulse rounded-xl bg-ink-50" />)}</div>}
      {!isLoading && !tasks.length && (
        <EmptyState kind={status === "open" ? "clear" : "inbox"}
          title={status === "open" ? "No open tasks" : status === "done" ? "Nothing done yet" : "Nothing archived"}
          hint={status === "open" ? "Add one above, or enjoy the quiet." : undefined} />
      )}
      <div className="space-y-4">
        {grouped.map(([g, list]) => (
          <section key={g || status}>
            {g && (
              <h3 className={cn("mb-1 flex items-center gap-2 px-3 text-xs font-semibold uppercase tracking-[0.12em]", g === "Overdue" ? "text-red-600" : "text-ink-400")}>
                {g === "Overdue" && <span className="size-1.5 animate-pulse rounded-full bg-red-500" />}{g}
                <span className={cn("rounded-full px-1.5 py-px text-[10px]", g === "Overdue" ? "bg-red-50" : "bg-ink-50")}>{list.length}</span>
              </h3>
            )}
            {list.map((t, i) => <Row key={t.id} t={t} i={i} showMatter={!matterId} onOpen={() => setOpenId(t.id)} />)}
          </section>
        ))}
      </div>
      {current && <Drawer key={current.id} t={current} all={everything.length ? everything : tasks} onClose={() => setOpenId(null)} />}
    </div>
  );
}
