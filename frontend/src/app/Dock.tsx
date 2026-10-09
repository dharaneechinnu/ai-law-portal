import { useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3, Briefcase, Building2, CalendarDays, Gavel, GripHorizontal, LayoutDashboard, ListChecks, ShieldCheck, Stamp, Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

export type DockSide = "left" | "right" | "bottom";

const DOCK_KEY = "lex-dock";
export const readDock = (): DockSide => {
  try {
    const v = localStorage.getItem(DOCK_KEY);
    return v === "right" || v === "bottom" ? v : "left";
  } catch { return "left"; }
};
const saveDock = (side: DockSide) => { try { localStorage.setItem(DOCK_KEY, side); } catch { /* per-visit only */ } };

export const NAV = [
  ["/", "Dashboard", LayoutDashboard],
  ["/matters", "Matters", Briefcase],
  ["/clients", "Clients", Building2],
  ["/people", "People", Users],
  ["/tasks", "Tasks", ListChecks],
  ["/calendar", "Calendar", CalendarDays],
  ["/legal", "Legal Intelligence", Gavel],
  ["/approvals", "Approvals", Stamp],
  ["/analytics", "Analytics", BarChart3],
] as const;
export const ADMIN_NAV = ["/admin/users", "Team & access", ShieldCheck] as const;

/** Which side a pointer at (x, y) drops onto. */
function sideAt(x: number, y: number): DockSide {
  if (y > window.innerHeight - 160) return "bottom";
  return x < window.innerWidth / 2 ? "left" : "right";
}

function Tip({ side, children }: { side: DockSide; children: React.ReactNode }) {
  return (
    <span role="tooltip" className={cn(
      "pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-night-950 px-2.5 py-1.5 text-xs font-medium text-snow shadow-xl ring-1 ring-snow/10 animate-fade-in",
      "group-hover:block group-focus-visible:block",
      side === "bottom" && "bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2",
      side === "left" && "left-[calc(100%+12px)] top-1/2 -translate-y-1/2",
      side === "right" && "right-[calc(100%+12px)] top-1/2 -translate-y-1/2",
    )}>{children}</span>
  );
}

/**
 * Icon-only navigation pill. Drag the handle to the left, right or bottom edge (or use the arrow keys on it);
 * the choice is remembered per browser.
 */
export function Dock({ side, onSide, items }: {
  side: DockSide;
  onSide: (s: DockSide) => void;
  items: { to: string; label: string; Icon: typeof Users; badge?: number }[];
}) {
  const [drag, setDrag] = useState<DockSide | null>(null);
  const dragging = useRef(false);
  const vertical = side !== "bottom";

  const move = (s: DockSide) => { saveDock(s); onSide(s); };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragging.current = true;
    setDrag(sideAt(e.clientX, e.clientY));
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (dragging.current) setDrag(sideAt(e.clientX, e.clientY));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    setDrag(null);
    move(sideAt(e.clientX, e.clientY));
  };
  const onKeyDown = (e: React.KeyboardEvent) => {
    const to = ({ ArrowLeft: "left", ArrowRight: "right", ArrowDown: "bottom" } as Record<string, DockSide>)[e.key];
    if (to) { e.preventDefault(); move(to); }
  };

  return (
    <>
      {drag && (
        <div className="pointer-events-none fixed inset-0 z-40 animate-fade-in bg-night-950/10">
          {(["left", "right", "bottom"] as const).map((s) => (
            <div key={s} className={cn(
              "absolute grid place-items-center rounded-3xl border-2 border-dashed text-xs font-semibold transition-all duration-200",
              s === "left" && "inset-y-24 left-3 w-24",
              s === "right" && "inset-y-24 right-3 w-24",
              s === "bottom" && "inset-x-40 bottom-3 h-24",
              drag === s ? "border-brass-400 bg-brass-300/20 text-brass-700" : "border-ink-300/60 bg-snow/30 text-ink-500",
            )}>Drop here</div>
          ))}
        </div>
      )}
      <nav aria-label="Main" data-dock={side}
        className={cn(
          "z-30 flex items-center gap-1.5 rounded-[22px] bg-night-950/95 p-2 shadow-[0_18px_40px_rgba(7,13,32,0.35)] ring-1 ring-snow/10 backdrop-blur-xl",
          vertical ? "flex-col" : "flex-row",
          side === "left" && "animate-[dock-in-left_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]",
          side === "right" && "animate-[dock-in-right_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]",
          side === "bottom" && "animate-[dock-in-bottom_0.45s_cubic-bezier(0.2,0.7,0.2,1)_both]",
          drag && "opacity-70",
        )}>
        <button type="button" aria-label="Move navigation (drag, or use the arrow keys)"
          onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className="group relative grid size-9 cursor-grab touch-none place-items-center rounded-xl text-night-300 transition hover:bg-snow/10 hover:text-snow active:cursor-grabbing">
          <GripHorizontal className={cn("size-4", vertical || "rotate-90")} />
          <Tip side={side}>Drag to move</Tip>
        </button>
        <span className={cn("bg-snow/10", vertical ? "h-px w-7" : "h-7 w-px")} />
        {items.map(({ to, label, Icon, badge = 0 }) => (
          <NavLink key={to} to={to} end={to === "/"} aria-label={label}
            className={({ isActive }) => cn(
              "group relative grid size-11 place-items-center rounded-2xl text-night-300 transition-all duration-200 hover:bg-snow/[0.07] hover:text-snow",
              isActive && "bg-brass-300/15 text-brass-300 hover:text-brass-300",
            )}>
            <Icon className="size-5 transition-transform duration-200 group-hover:scale-110" />
            {badge > 0 && (
              <span key={badge} className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] animate-pop place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-500 px-1 text-[10px] font-bold tabular-nums text-night-950 ring-2 ring-night-950">
                {badge}
              </span>
            )}
            <Tip side={side}>{label}</Tip>
          </NavLink>
        ))}
      </nav>
    </>
  );
}
