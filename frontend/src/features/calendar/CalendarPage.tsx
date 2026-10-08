import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, Gavel, MapPin, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import type { CalEvent, CalItem, Hearing } from "@/types";
import { EventDrawer, HearingDrawer, localDate } from "./forms";

const DAY = 86_400_000;

function startOfWeek(d: Date) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - ((s.getDay() + 6) % 7)); // Monday
  return s;
}

const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Six-week month grid. Each day shows up to three items; clicking a day opens that week. */
function MonthGrid({ month, start, items, today, dir, onDay }: {
  month: Date; start: Date; items: CalItem[]; today: string; dir: "left" | "right"; onDay: (d: Date) => void;
}) {
  const cells = Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  const byDay = new Map<string, CalItem[]>();
  // live items first; cancelled ones sink to the end of the day
  const ordered = [...items].sort((a, b) => Number(a.status === "cancelled") - Number(b.status === "cancelled"));
  for (const it of ordered) {
    const k = localDate(new Date(it.start));
    byDay.set(k, [...(byDay.get(k) ?? []), it]);
  }
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-ink-100 bg-white", dir === "right" ? "animate-week-right" : "animate-week-left")}>
      <div className="grid grid-cols-7 border-b border-ink-50 text-center text-[11px] font-medium uppercase tracking-wider text-ink-400">
        {cells.slice(0, 7).map((d) => <div key={d.getDay()} className="py-2">{d.toLocaleDateString([], { weekday: "short" })}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          const key = localDate(d);
          const list = byDay.get(key) ?? [];
          const inMonth = d.getMonth() === month.getMonth();
          return (
            <button key={key} onClick={() => onDay(d)} aria-label={`Open the week of ${key}`}
              className={cn("group flex min-h-24 flex-col gap-1 border-ink-50 p-1.5 text-left transition hover:bg-ink-50/60",
                i % 7 !== 6 && "border-r", i < 35 && "border-b", !inMonth && "bg-ink-50/40")}>
              <span className={cn("grid size-6 place-items-center rounded-full text-xs tabular-nums",
                key === today ? "bg-brass-500 font-semibold text-white" : inMonth ? "text-ink-700" : "text-ink-300")}>{d.getDate()}</span>
              {list.slice(0, 3).map((it) => (
                <span key={`${it.kind}-${it.id}`}
                  className={cn("truncate rounded px-1.5 py-0.5 text-[11px]", it.kind === "hearing" ? "bg-brass-100/70 text-brass-700" : "bg-ink-50 text-ink-700",
                    it.status === "cancelled" && "line-through opacity-50")}>
                  {it.kind === "hearing" && <Gavel className="mr-0.5 inline size-3 align-[-2px]" />}{it.title}
                </span>
              ))}
              {list.length > 3 && <span className="px-1.5 text-[11px] text-ink-400">+{list.length - 3} more</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type Open ={ kind: "event"; event?: CalEvent; day?: Date } | { kind: "hearing"; hearing?: Hearing; day?: Date } | null;

export function CalendarPage() {
  const [week, setWeek] = useState(() => startOfWeek(new Date()));
  const [dir, setDir] = useState<"left" | "right">("right");
  const [open, setOpen] = useState<Open>(null);
  const [view, setView] = useState<"week" | "month">("week");
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const rangeStart = view === "week" ? week : startOfWeek(month);
  const end = new Date(rangeStart.getTime() + (view === "week" ? 7 : 42) * DAY);
  const { data: items = [], isLoading } = useQuery({
    queryKey: ["calendar", view, rangeStart.toISOString()],
    queryFn: () => api<CalItem[]>(`/calendar?start=${encodeURIComponent(rangeStart.toISOString())}&end=${encodeURIComponent(end.toISOString())}`),
  });
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(week.getTime() + i * DAY)), [week]);
  const today = localDate(new Date());
  const shift = (n: number) => {
    setDir(n > 0 ? "right" : "left");
    if (view === "month") setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
    else setWeek(new Date(week.getTime() + n * 7 * DAY));
  };
  const goToday = () => {
    setDir("right");
    setWeek(startOfWeek(new Date()));
    setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  };
  const openWeek = (d: Date) => { setWeek(startOfWeek(d)); setView("week"); };
  const label = view === "month"
    ? month.toLocaleDateString([], { month: "long", year: "numeric" })
    : `${days[0].toLocaleDateString([], { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`;

  const openItem = (it: CalItem) => setOpen(it.kind === "hearing"
    ? { kind: "hearing", hearing: { id: it.id, matter_id: it.matter_id!, matter_title: it.matter_title, scheduled_at: it.start, court_room: it.location, purpose: it.title, status: it.status, outcome: it.outcome } }
    : { kind: "event", event: { id: it.id, title: it.title, start: it.start, end: it.end, location: it.location, matter_id: it.matter_id, owner_id: it.owner_id!, attendee_ids: it.attendee_ids ?? [] } });

  return (
    <div>
      <div className="mb-6 flex flex-wrap animate-fade-up items-end justify-between gap-3">
        <div>
          <h1 className="font-serif text-3xl text-ink-900">Calendar</h1>
          <p className="mt-1 text-sm tabular-nums text-ink-400">{label}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center rounded-xl bg-ink-50 p-1">
            <button onClick={() => shift(-1)} aria-label={`Previous ${view}`} className="grid size-8 place-items-center rounded-lg text-ink-500 transition hover:bg-white hover:shadow-sm"><ChevronLeft className="size-4" /></button>
            <button onClick={goToday} className="rounded-lg px-3 py-1.5 text-sm text-ink-600 transition hover:bg-white hover:shadow-sm">Today</button>
            <button onClick={() => shift(1)} aria-label={`Next ${view}`} className="grid size-8 place-items-center rounded-lg text-ink-500 transition hover:bg-white hover:shadow-sm"><ChevronRight className="size-4" /></button>
          </div>
          <div className="inline-flex rounded-xl bg-ink-50 p-1" role="group" aria-label="View">
            {(["week", "month"] as const).map((v) => (
              <button key={v} onClick={() => setView(v)} aria-pressed={view === v}
                className={cn("rounded-lg px-3 py-1.5 text-sm capitalize transition-all", view === v ? "bg-white font-medium text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
                {v}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => setOpen({ kind: "hearing" })}><Gavel className="size-4" /> Hearing</Button>
          <Button size="sm" onClick={() => setOpen({ kind: "event" })}><CalendarPlus className="size-4" /> Event</Button>
        </div>
      </div>

      {view === "month" && (
        <MonthGrid key={month.toISOString()} month={month} start={rangeStart} items={items} today={today} dir={dir} onDay={openWeek} />
      )}
      {view === "week" && <div key={week.toISOString()}
        className={cn("grid gap-3 md:grid-cols-7", dir === "right" ? "animate-week-right" : "animate-week-left")}>
        {days.map((d) => {
          const key = localDate(d);
          const list = items.filter((it) => localDate(new Date(it.start)) === key);
          const isToday = key === today;
          return (
            <section key={key} className={cn("group flex min-h-40 flex-col rounded-2xl border bg-white/80 p-2.5 transition", isToday ? "border-brass-300 shadow-md" : "border-ink-100")}>
              <header className="mb-2 flex items-center justify-between px-1">
                <span className="text-xs font-medium uppercase tracking-wider text-ink-400">{d.toLocaleDateString([], { weekday: "short" })}</span>
                <span className={cn("grid size-7 place-items-center rounded-full text-sm tabular-nums", isToday ? "bg-brass-500 font-semibold text-white" : "text-ink-700")}>{d.getDate()}</span>
              </header>
              <div className="flex-1 space-y-1.5">
                {isLoading && <div className="h-12 animate-pulse rounded-lg bg-ink-50" />}
                {list.map((it, i) => (
                  <button key={`${it.kind}-${it.id}`} onClick={() => openItem(it)} style={{ animationDelay: `${i * 40}ms` }}
                    className={cn(
                      "w-full animate-slide-up rounded-lg border-l-[3px] px-2 py-1.5 text-left text-xs transition hover:-translate-y-0.5 hover:shadow-sm",
                      it.kind === "hearing" ? "border-brass-500 bg-brass-100/60" : "border-ink-500 bg-ink-50",
                      it.status === "cancelled" && "opacity-50 line-through",
                    )}>
                    <span className="flex items-center gap-1 font-medium tabular-nums text-ink-500">
                      {it.kind === "hearing" && <Gavel className="size-3" />}{time(it.start)}
                    </span>
                    <span className="block truncate font-medium text-ink-900">{it.title}</span>
                    {(it.matter_title || it.location) && (
                      <span className="flex items-center gap-1 truncate text-ink-400">
                        {it.location && <MapPin className="size-3 shrink-0" />}{it.matter_title ?? it.location}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <button onClick={() => setOpen({ kind: "event", day: d })} aria-label={`Add event on ${key}`}
                className="mt-1 flex items-center justify-center gap-1 rounded-lg py-1 text-xs text-ink-300 opacity-0 transition hover:bg-ink-50 hover:text-ink-600 group-hover:opacity-100 focus:opacity-100">
                <Plus className="size-3" /> Add
              </button>
            </section>
          );
        })}
      </div>}
      {!isLoading && !items.length && <p className="mt-6 animate-fade-in text-center text-sm text-ink-300">Nothing scheduled this {view}.</p>}

      {open?.kind === "event" && <EventDrawer event={open.event} day={open.day} onClose={() => setOpen(null)} />}
      {open?.kind === "hearing" && <HearingDrawer hearing={open.hearing} day={open.day} onClose={() => setOpen(null)} />}
    </div>
  );
}
