import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { Check, Eye, EyeOff, GripVertical, Maximize2, Minimize2, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { DeskSpot } from "@/components/brand/Spots";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Dashboard, User } from "@/types";
import { DEFAULT_LAYOUT, WIDGETS, WidgetBody, type WidgetId, type WidgetLayout } from "./widgets";

/** Saved layout merged with defaults: unknown ids are dropped, new widgets are appended. */
function normalize(saved?: User["dashboard_layout"]): WidgetLayout[] {
  const known = new Set(Object.keys(WIDGETS));
  const out = (saved?.widgets ?? [])
    .filter((w) => known.has(w.id))
    .map((w) => ({ id: w.id as WidgetId, size: w.size, hidden: w.hidden }));
  const have = new Set(out.map((w) => w.id));
  return [...out, ...DEFAULT_LAYOUT.filter((w) => !have.has(w.id))];
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function Card({
  w, data, editing, onSize, onHide,
}: { w: WidgetLayout; data: Dashboard; editing: boolean; onSize: () => void; onHide: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id, disabled: !editing });
  const meta = WIDGETS[w.id];
  return (
    <section ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "relative animate-fade-up rounded-[20px] border bg-white p-5 shadow-[0_1px_2px_rgba(7,13,32,0.04)] transition-[box-shadow,border-color] duration-200",
        w.size === "full" ? "md:col-span-2" : "md:col-span-1",
        editing ? "border-dashed border-brass-300" : "border-ink-100",
        isDragging && "z-10 scale-[1.02] border-brass-400 shadow-xl",
      )}>
      <header className="mb-3 flex items-center gap-2">
        {editing && (
          <button {...attributes} {...listeners} aria-label={`Move ${meta.title}`}
            className="-ml-1 grid size-7 cursor-grab touch-none place-items-center rounded-md text-ink-300 transition hover:bg-ink-50 hover:text-ink-600 active:cursor-grabbing">
            <GripVertical className="size-4" />
          </button>
        )}
        <h2 className="flex-1 font-serif text-lg font-bold text-ink-900">{meta.title}</h2>
        {editing && (
          <div className="flex animate-fade-in gap-0.5">
            <button onClick={onSize} title={w.size === "full" ? "Make narrow" : "Make wide"}
              className="grid size-7 place-items-center rounded-md text-ink-300 transition hover:bg-ink-50 hover:text-ink-600">
              {w.size === "full" ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
            </button>
            <button onClick={onHide} title="Hide"
              className="grid size-7 place-items-center rounded-md text-ink-300 transition hover:bg-ink-50 hover:text-ink-600">
              <EyeOff className="size-4" />
            </button>
          </div>
        )}
      </header>
      <WidgetBody id={w.id} data={data} />
    </section>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[2, 1, 1, 1, 1].map((span, i) => (
        <div key={i} className={cn("h-40 animate-pulse rounded-[20px] bg-ink-100/60", span === 2 && "md:col-span-2 h-28")} />
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user, setUser } = useAuth();
  const [layout, setLayout] = useState<WidgetLayout[]>(() => normalize(user?.dashboard_layout));
  const [editing, setEditing] = useState(false);
  const saveTimer = useRef<number>();
  const { data, isLoading, isError } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
  const { data: pending = 0 } = useQuery({
    queryKey: ["approvals", "count"],
    queryFn: () => api<{ pending: number }>("/approvals/count").then((r) => r.pending),
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const persist = useCallback((next: WidgetLayout[]) => {
    setLayout(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      try {
        const u = await api<User>("/auth/me", { method: "PATCH", body: JSON.stringify({ dashboard_layout: { widgets: next } }) });
        setUser(u);
      } catch {
        /* layout still applies locally; it saves on the next change */
      }
    }, 500);
  }, [setUser]);
  useEffect(() => () => window.clearTimeout(saveTimer.current), []);

  const visible = useMemo(() => layout.filter((w) => !w.hidden), [layout]);
  const hidden = useMemo(() => layout.filter((w) => w.hidden), [layout]);

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = visible.map((w) => w.id);
    const moved = arrayMove(ids, ids.indexOf(active.id as WidgetId), ids.indexOf(over.id as WidgetId));
    const byId = new Map(layout.map((w) => [w.id, w]));
    persist([...moved.map((id) => byId.get(id)!), ...hidden]);
  };
  const patch = (id: WidgetId, p: Partial<WidgetLayout>) => persist(layout.map((w) => (w.id === id ? { ...w, ...p } : w)));

  const first = user?.name.split(" ")[0] ?? "";
  const attention = data ? data.today.length + data.overdue.length + data.stats.new_alerts + pending : 0;

  const counts = data && [
    pending && `${pending} ${pending === 1 ? "approval" : "approvals"} waiting`,
    data.stats.hearings_week && `${data.stats.hearings_week} ${data.stats.hearings_week === 1 ? "hearing" : "hearings"} this week`,
    data.stats.overdue_tasks && `${data.stats.overdue_tasks} overdue ${data.stats.overdue_tasks === 1 ? "task" : "tasks"}`,
    data.stats.new_alerts && `${data.stats.new_alerts} new legal ${data.stats.new_alerts === 1 ? "alert" : "alerts"}`,
  ].filter(Boolean).join(" · ");
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="flex flex-col gap-[18px]">
      <section className="relative isolate flex animate-fade-up flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 via-night-900 to-night-950 px-6 py-7 text-snow shadow-[0_24px_48px_rgba(7,13,32,0.18)] md:px-9">
        <span className="pointer-events-none absolute -left-24 -top-28 -z-10 size-80 animate-drift rounded-full bg-brass-300/20 blur-3xl" />
        <span className="pointer-events-none absolute -bottom-32 right-1/4 -z-10 size-96 animate-drift rounded-full bg-night-500/40 blur-3xl" style={{ animationDelay: "-6s" }} />
        <div className="min-w-0 max-w-xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">{today}</p>
          <h1 className="mt-2 font-serif text-3xl font-bold leading-tight md:text-4xl">{greeting()}, {first}</h1>
          <p className="mt-2 text-sm text-night-200 md:text-base">
            {data ? (attention ? `${attention} ${attention === 1 ? "item needs" : "items need"} you today${counts ? `: ${counts}.` : "."}` : "You're all clear today.") : "\u00a0"}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <Link to="/matters?new=1" className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 px-4 text-sm font-semibold text-night-950 shadow-lg shadow-brass-500/25 transition hover:-translate-y-0.5 hover:brightness-105">
              <Plus className="size-4" /> New matter
            </Link>
            <div className="group relative">
              <button onClick={() => setEditing(!editing)} aria-label={editing ? "Done customizing" : "Customize dashboard"} aria-pressed={editing}
                className={cn("grid size-11 place-items-center rounded-xl ring-1 transition",
                  editing ? "bg-snow text-night-950 ring-snow" : "bg-snow/10 text-snow ring-snow/15 hover:bg-snow/15")}>
                {editing ? <Check className="size-[18px] animate-pop" /> : <SlidersHorizontal className="size-[18px]" />}
              </button>
              <span role="tooltip" className="pointer-events-none absolute left-1/2 top-[calc(100%+8px)] z-20 hidden -translate-x-1/2 animate-fade-in whitespace-nowrap rounded-lg bg-night-950 px-2.5 py-1.5 text-xs font-medium text-snow shadow-xl ring-1 ring-snow/10 group-hover:block group-focus-within:block">
                {editing ? "Done customizing" : "Customize dashboard"}
              </span>
            </div>
            {editing && (
              <button onClick={() => persist(DEFAULT_LAYOUT)}
                className="flex h-11 animate-fade-in items-center gap-2 rounded-xl px-3 text-sm font-medium text-night-200 transition hover:bg-snow/10 hover:text-snow">
                <RotateCcw className="size-4" /> Reset layout
              </button>
            )}
          </div>
        </div>
        <DeskSpot className="hidden h-auto w-72 shrink-0 sm:block lg:w-80" />
      </section>

      {editing && (
        <p className="animate-fade-in rounded-xl bg-brass-100/60 px-3 py-2 text-xs font-medium text-brass-700">
          Drag to reorder. Use the icons to resize or hide.
        </p>
      )}

      {isLoading && <Skeleton />}
      {isError && <p className="text-sm text-red-600">Couldn't load the dashboard.</p>}
      {data && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div className="grid gap-4 md:grid-cols-2">
              {visible.map((w) => (
                <Card key={w.id} w={w} data={data} editing={editing}
                  onSize={() => patch(w.id, { size: w.size === "full" ? "half" : "full" })}
                  onHide={() => patch(w.id, { hidden: true })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {editing && hidden.length > 0 && (
        <div className="animate-fade-up">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">
            <Eye className="size-3.5" /> Hidden
          </div>
          <div className="flex flex-wrap gap-2">
            {hidden.map((w) => (
              <button key={w.id} onClick={() => patch(w.id, { hidden: false })}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-ink-200 px-3 py-1.5 text-sm text-ink-600 transition hover:border-brass-400 hover:bg-brass-100/50">
                <Plus className="size-3.5" /> {WIDGETS[w.id].title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
