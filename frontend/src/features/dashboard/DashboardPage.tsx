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
import { Eye, EyeOff, GripVertical, Plus, RotateCcw } from "lucide-react";
import { DeskSpot } from "@/components/brand/Spots";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { Dashboard, User } from "@/types";
import { DEFAULT_LAYOUT, MAX_H, MAX_W, MIN_H, MIN_W, WIDGETS, WidgetBody, type WidgetId, type WidgetLayout } from "./widgets";

/** Saved layout merged with defaults: unknown ids are dropped, new widgets are appended. */
function normalize(saved?: User["dashboard_layout"]): WidgetLayout[] {
  const known = new Set(Object.keys(WIDGETS));
  const out = (saved?.widgets ?? [])
    .filter((w) => known.has(w.id))
    .map((w) => {
      const id = w.id as WidgetId;
      // Layouts saved before free sizing only had size: half/full.
      const width = clamp(w.w ?? (w.size === "full" ? 12 : 6), MIN_W, MAX_W);
      return { id, size: w.size, hidden: w.hidden, w: width, h: clamp(w.h ?? WIDGETS[id].h, MIN_H, MAX_H) };
    });
  const have = new Set(out.map((w) => w.id));
  return [...out, ...DEFAULT_LAYOUT.filter((w) => !have.has(w.id))];
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
/** Grid row height and gap in px (match md:auto-rows-[88px] and gap-4 on the grid). */
const ROW = 88, GAP = 16;
const sizeOf = (w: number) => (w >= 12 ? "full" : "half") as WidgetLayout["size"];

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

function IconButton({ label, children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label} {...props}
      className={cn("grid size-8 place-items-center rounded-lg text-ink-300 transition hover:bg-ink-50 hover:text-ink-700 focus-visible:opacity-100", props.className)}>
      {children}
    </button>
  );
}

/**
 * One dashboard card. Always customizable: drag the grip to move, drag the corner to set width and height
 * (snaps to the 12-column grid and fixed rows), or hide it. Arrow keys on the corner handle resize too.
 */
function Card({ w, data, gridRef, onResize, onHide }: {
  w: WidgetLayout; data: Dashboard; gridRef: React.RefObject<HTMLDivElement>;
  onResize: (size: { w: number; h: number }, done: boolean) => void; onHide: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: w.id });
  const meta = WIDGETS[w.id];
  const start = useRef<{ x: number; y: number; w: number; h: number; col: number } | null>(null);
  const [resizing, setResizing] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const grid = gridRef.current;
    if (!grid) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const col = (grid.clientWidth - GAP * 11) / 12;
    start.current = { x: e.clientX, y: e.clientY, w: w.w, h: w.h, col };
    setResizing(true);
  };
  const next = (e: React.PointerEvent) => {
    const s = start.current!;
    return {
      w: clamp(Math.round(s.w + (e.clientX - s.x) / (s.col + GAP)), MIN_W, MAX_W),
      h: clamp(Math.round(s.h + (e.clientY - s.y) / (ROW + GAP)), MIN_H, MAX_H),
    };
  };
  const onPointerMove = (e: React.PointerEvent) => { if (start.current) onResize(next(e), false); };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!start.current) return;
    onResize(next(e), true);
    start.current = null;
    setResizing(false);
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const d = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, [number, number]>)[e.key];
    if (!d) return;
    e.preventDefault();
    onResize({ w: clamp(w.w + d[0], MIN_W, MAX_W), h: clamp(w.h + d[1], MIN_H, MAX_H) }, true);
  };

  return (
    <section ref={setNodeRef} aria-label={meta.title}
      style={{
        transform: CSS.Transform.toString(transform), transition,
        "--w": w.w, "--h": w.h,
      } as React.CSSProperties}
      className={cn(
        "group/card relative flex animate-fade-up flex-col rounded-[20px] border bg-white p-5 shadow-[0_1px_2px_rgba(7,13,32,0.04)] transition-[box-shadow,border-color] duration-200",
        "md:col-[span_var(--w)/span_var(--w)] md:row-[span_var(--h)/span_var(--h)]",
        isDragging ? "z-10 border-brass-400 shadow-xl" : resizing ? "z-10 border-brass-400 ring-4 ring-brass-300/25" : "border-ink-100 hover:border-ink-200",
      )}>
      <header className="mb-3 flex shrink-0 items-center gap-1.5">
        <button {...attributes} {...listeners} aria-label={`Move ${meta.title}`} title="Drag to move"
          className="-ml-1.5 grid size-8 cursor-grab touch-none place-items-center rounded-lg text-ink-300 opacity-60 transition hover:bg-ink-50 hover:text-ink-700 group-hover/card:opacity-100 active:cursor-grabbing">
          <GripVertical className="size-4" />
        </button>
        <h2 className="min-w-0 flex-1 truncate font-serif text-lg font-bold text-ink-900">{meta.title}</h2>
        {resizing && <span className="animate-fade-in rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-snow">{w.w} × {w.h}</span>}
        <IconButton label={`Hide ${meta.title}`} onClick={onHide} className="opacity-0 group-hover/card:opacity-100 [@media(hover:none)]:opacity-100">
          <EyeOff className="size-4" />
        </IconButton>
      </header>
      <div className="@container min-h-0 flex-1 overflow-y-auto">
        <WidgetBody id={w.id} data={data} />
      </div>
      <button type="button" aria-label={`Resize ${meta.title}: ${w.w} of 12 columns, ${w.h} rows. Use arrow keys.`} title="Drag to resize"
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}
        onDoubleClick={() => onResize({ w: meta.w, h: meta.h }, true)}
        className={cn("absolute bottom-1 right-1 hidden size-6 cursor-nwse-resize touch-none place-items-end rounded-md p-1 text-ink-300 transition hover:text-brass-600 focus-visible:text-brass-600 md:grid",
          resizing ? "text-brass-600 opacity-100" : "opacity-0 group-hover/card:opacity-100 focus-visible:opacity-100")}>
        <svg viewBox="0 0 10 10" className="size-3" aria-hidden="true">
          <path d="M9 1L1 9M9 5L5 9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </section>
  );
}

function Skeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-12">
      {[12, 12, 6, 6].map((span, i) => (
        <div key={i} className={cn("h-48 animate-pulse rounded-[20px] bg-ink-100/60", span === 12 ? "md:col-span-12" : "md:col-span-6")} />
      ))}
    </div>
  );
}

export function DashboardPage() {
  const { user, setUser } = useAuth();
  const [layout, setLayout] = useState<WidgetLayout[]>(() => normalize(user?.dashboard_layout));
  const gridRef = useRef<HTMLDivElement>(null);
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
  // Live preview while dragging the corner; saved once on release.
  const resize = (id: WidgetId, size: { w: number; h: number }, done: boolean) => {
    const next = layout.map((w) => (w.id === id ? { ...w, ...size, size: sizeOf(size.w) } : w));
    if (done) persist(next); else setLayout(next);
  };
  const isDefault = JSON.stringify(layout.map(({ id, w, h, hidden }) => [id, w, h, hidden]))
    === JSON.stringify(DEFAULT_LAYOUT.map(({ id, w, h, hidden }) => [id, w, h, hidden]));

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
          </div>
        </div>
        <DeskSpot className="hidden h-auto w-72 shrink-0 sm:block lg:w-80" />
      </section>

      {isLoading && <Skeleton />}
      {isError && <p className="text-sm text-red-600">Couldn't load the dashboard.</p>}
      {data && (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={visible.map((w) => w.id)} strategy={rectSortingStrategy}>
            <div ref={gridRef} className="grid grid-cols-1 gap-4 md:auto-rows-[88px] md:grid-cols-12">
              {visible.map((w) => (
                <Card key={w.id} w={w} data={data} gridRef={gridRef}
                  onResize={(size, done) => resize(w.id, size, done)}
                  onHide={() => patch(w.id, { hidden: true })} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {(hidden.length > 0 || !isDefault) && (
        <div className="flex animate-fade-up flex-wrap items-center gap-2">
          {hidden.length > 0 && (
            <span className="mr-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.14em] text-ink-400"><Eye className="size-3.5" /> Hidden</span>
          )}
          {hidden.map((w) => (
            <button key={w.id} onClick={() => patch(w.id, { hidden: false })}
              className="flex items-center gap-1.5 rounded-full border border-dashed border-ink-200 px-3 py-1.5 text-sm text-ink-600 transition hover:border-brass-400 hover:bg-brass-100/50">
              <Plus className="size-3.5" /> {WIDGETS[w.id].title}
            </button>
          ))}
          {!isDefault && (
            <button onClick={() => persist(DEFAULT_LAYOUT)}
              className="ml-auto flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium text-ink-500 transition hover:bg-ink-50 hover:text-ink-900">
              <RotateCcw className="size-3.5" /> Reset layout
            </button>
          )}
        </div>
      )}
    </div>
  );
}
