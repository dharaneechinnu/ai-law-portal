import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Check, Eye, EyeOff, GripVertical, RotateCcw, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import type { Dashboard, DashboardLayout, DashCardId } from "@/types";
import { CARDS } from "./cards";

const DEFAULT_ORDER = Object.keys(CARDS) as DashCardId[];

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function Card({ id, data, editing, hidden, index, onToggle }: {
  id: DashCardId; data: Dashboard; editing: boolean; hidden: boolean; index: number; onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id, disabled: !editing });
  const card = CARDS[id];
  // The sortable transform sits on the outer element; the entrance animation on the inner one, so they never fight.
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("relative", card.wide && "lg:col-span-2", isDragging && "z-10")}>
    <section
      style={{ animationDelay: `${index * 60}ms` }}
      className={cn(
        "h-full animate-fade-up rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition-shadow",
        editing && "ring-1 ring-ink-100",
        isDragging && "shadow-xl ring-2 ring-brass-300",
        hidden && "opacity-50",
      )}
    >
      <header className="mb-3 flex items-center gap-2">
        {editing && (
          <button ref={setActivatorNodeRef} {...attributes} {...listeners} aria-label={`Move ${card.title}`}
            className="grid size-7 cursor-grab touch-none place-items-center rounded-md text-ink-300 hover:bg-ink-50 hover:text-ink-600 active:cursor-grabbing">
            <GripVertical className="size-4" />
          </button>
        )}
        <h2 className="flex-1 text-sm font-semibold text-ink-800">{card.title}</h2>
        {editing && (
          <button onClick={onToggle} aria-label={hidden ? `Show ${card.title}` : `Hide ${card.title}`}
            className="grid size-7 place-items-center rounded-md text-ink-300 hover:bg-ink-50 hover:text-ink-600">
            {hidden ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        )}
      </header>
      {hidden ? <p className="text-xs text-ink-400">Hidden. Click the eye to show it again.</p> : card.render(data)}
    </section>
    </div>
  );
}

export function DashboardPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/dashboard") });
  const [layout, setLayout] = useState<DashboardLayout>({ order: DEFAULT_ORDER, hidden: [] });
  const [editing, setEditing] = useState(false);
  useEffect(() => { if (data) setLayout(data.layout); }, [data]);

  const save = useMutation({
    mutationFn: (next: DashboardLayout) => api<DashboardLayout>("/dashboard/layout", { method: "PUT", body: JSON.stringify(next) }),
    onSuccess: (saved) => qc.setQueryData<Dashboard>(["dashboard"], (d) => (d ? { ...d, layout: saved } : d)),
  });
  const update = (next: DashboardLayout) => { setLayout(next); save.mutate(next); };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = layout.order.indexOf(active.id as DashCardId);
    const to = layout.order.indexOf(over.id as DashCardId);
    update({ ...layout, order: arrayMove(layout.order, from, to) });
  };
  const toggle = (id: DashCardId) => update({
    ...layout, hidden: layout.hidden.includes(id) ? layout.hidden.filter((x) => x !== id) : [...layout.hidden, id],
  });

  const shown = editing ? layout.order : layout.order.filter((id) => !layout.hidden.includes(id));
  const today = new Date().toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3 animate-fade-in">
        <div>
          <p className="text-sm text-ink-400">{today}</p>
          <h1 className="font-serif text-2xl text-ink-900 sm:text-3xl">{greeting()}, {user?.name.split(" ")[0]}</h1>
        </div>
        <div className="flex items-center gap-2">
          {save.isPending && <span className="text-xs text-ink-400">Saving…</span>}
          {editing && (
            <Button variant="ghost" size="sm" onClick={() => update({ order: DEFAULT_ORDER, hidden: [] })}>
              <RotateCcw className="size-4" /> Reset
            </Button>
          )}
          <Button variant={editing ? "default" : "outline"} size="sm" onClick={() => setEditing(!editing)}>
            {editing ? <><Check className="size-4" /> Done</> : <><SlidersHorizontal className="size-4" /> Customize</>}
          </Button>
        </div>
      </div>

      {editing && (
        <p className="animate-fade-in rounded-lg bg-brass-100/60 px-3 py-2 text-sm text-brass-700">
          Drag cards by the handle to reorder. Use the eye to hide or show a card. Changes save automatically.
        </p>
      )}
      {save.isError && <p className="text-sm text-red-600">Layout not saved: {errorMessage(save.error)}</p>}
      {error && <p className="text-sm text-red-600">{errorMessage(error)}</p>}

      {isLoading || !data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => <div key={i} className={cn("h-40 animate-pulse rounded-2xl bg-ink-50", i === 0 && "lg:col-span-2")} />)}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={shown} strategy={rectSortingStrategy}>
            <div className="grid gap-4 lg:grid-cols-2">
              {shown.map((id, i) => (
                <Card key={id} id={id} data={data} editing={editing} hidden={layout.hidden.includes(id)} index={i} onToggle={() => toggle(id)} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
      {!editing && data && !shown.length && (
        <p className="text-center text-sm text-ink-400">All cards are hidden. Click Customize to show them.</p>
      )}
    </div>
  );
}
