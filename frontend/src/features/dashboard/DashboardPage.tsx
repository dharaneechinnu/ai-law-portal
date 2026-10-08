import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DndContext, DragEndEvent, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Maximize2, Minimize2, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
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
        "relative animate-fade-up rounded-2xl border bg-white/80 p-5 shadow-sm backdrop-blur transition-[box-shadow,border-color] duration-200",
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
        <h2 className="flex-1 text-sm font-semibold tracking-wide text-ink-700">{meta.title}</h2>
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
        <div key={i} className={cn("h-40 animate-pulse rounded-2xl bg-ink-100/60", span === 2 && "md:col-span-2 h-28")} />
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
  const attention = data ? data.today.length + data.overdue.length + data.stats.new_alerts : 0;

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-fade-up">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">{greeting()}, {first}</h1>
          <p className="mt-1 text-sm text-ink-400">
            {data ? (attention ? `${attention} ${attention === 1 ? "item needs" : "items need"} you today.` : "You're all clear today.") : " "}
          </p>
        </div>
        <div className="flex gap-2">
          {editing && (
            <Button variant="ghost" size="sm" className="animate-fade-in" onClick={() => persist(DEFAULT_LAYOUT)}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          )}
          <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing(!editing)}>
            <SlidersHorizontal className="size-4" /> {editing ? "Done" : "Customize"}
          </Button>
        </div>
      </div>

      {editing && (
        <p className="mb-4 animate-fade-in rounded-lg bg-brass-100/60 px-3 py-2 text-xs text-brass-700">
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
        <div className="mt-6 animate-fade-up">
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
