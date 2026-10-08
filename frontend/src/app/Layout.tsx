import { NavLink, Outlet } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/services/api";
import {
  BarChart3, Briefcase, CalendarDays, Gavel, LayoutDashboard, ListChecks, LogOut, Settings, ShieldCheck, Stamp, UserCircle, Users, Building2,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AssistantPanel } from "@/features/ai/AssistantPanel";

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/matters", "Matters", Briefcase],
  ["/clients", "Clients", Building2],
  ["/people", "People", Users],
  ["/tasks", "Tasks", ListChecks],
  ["/calendar", "Calendar", CalendarDays],
  ["/legal", "Legal Intelligence", Gavel],
  ["/approvals", "Approvals", Stamp],
  ["/analytics", "Analytics", BarChart3],
  ["/settings", "Settings", Settings],
  ["/account", "Account", UserCircle],
] as const;

function Item({ to, label, Icon, badge = 0 }: { to: string; label: string; Icon: typeof Users; badge?: number }) {
  return (
    <NavLink to={to} end={to === "/"}
      className={({ isActive }) => cn(
        "group flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-200/80 transition hover:bg-white/5 hover:text-white",
        isActive && "bg-white/10 text-white shadow-inner",
      )}>
      {({ isActive }) => (
        <>
          <Icon className={cn("size-4 transition-colors", isActive ? "text-brass-300" : "text-ink-300 group-hover:text-brass-200")} />
          {label}
          {badge > 0 && (
            <span key={badge} className="ml-auto grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-brass-400 px-1.5 text-[11px] font-semibold tabular-nums text-ink-950">{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

export function Layout() {
  const { user, logout } = useAuth();
  const { data: pending = 0 } = useQuery({
    queryKey: ["approvals", "count"],
    queryFn: () => api<{ pending: number }>("/approvals/count").then((r) => r.pending),
    refetchInterval: 30_000,
  });
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col bg-ink-950 px-3 py-5">
        <Logo dark className="mb-8 px-2" />
        <nav className="flex flex-col gap-0.5">
          {nav.map(([to, label, Icon]) => <Item key={to} to={to} label={label} Icon={Icon} badge={to === "/approvals" ? pending : 0} />)}
          {user?.role_name === "admin" && (
            <>
              <div className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Admin</div>
              <Item to="/admin/users" label="Team & access" Icon={ShieldCheck} />
            </>
          )}
        </nav>
        <div className="mt-auto mb-2"><NotificationBell /></div>
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 text-xs font-semibold text-ink-950">
            {initials(user?.name ?? "")}
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-white">{user?.name}</div>
            <div className="truncate text-xs capitalize text-ink-300">{user?.role_name}</div>
          </div>
          <button onClick={logout} aria-label="Sign out" title="Sign out"
            className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">
        <Outlet />
      </main>
      <AssistantPanel />
    </div>
  );
}
