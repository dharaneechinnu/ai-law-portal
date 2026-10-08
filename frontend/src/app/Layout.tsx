import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  BarChart3, Briefcase, CalendarDays, Gavel, LayoutDashboard, LogOut, Menu, Settings, ShieldCheck, UserCircle, Users, Building2, X,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";

const nav = [
  ["/", "Dashboard", LayoutDashboard],
  ["/matters", "Matters", Briefcase],
  ["/clients", "Clients", Building2],
  ["/people", "People", Users],
  ["/tasks", "Tasks & Calendar", CalendarDays],
  ["/legal", "Legal Intelligence", Gavel],
  ["/analytics", "Analytics", BarChart3],
  ["/settings", "Settings", Settings],
  ["/account", "Account", UserCircle],
] as const;

function Item({ to, label, Icon }: { to: string; label: string; Icon: typeof Users }) {
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
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ className, onNavigate }: { className?: string; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  return (
    <aside className={cn("flex h-screen w-60 shrink-0 flex-col bg-ink-950 px-3 py-5", className)}>
      <Logo dark className="mb-8 px-2" />
      <nav className="flex flex-col gap-0.5" onClick={onNavigate}>
        {nav.map(([to, label, Icon]) => <Item key={to} to={to} label={label} Icon={Icon} />)}
        {user?.role_name === "admin" && (
          <>
            <div className="mb-1 mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-400">Admin</div>
            <Item to="/admin/users" label="Team & access" Icon={ShieldCheck} />
          </>
        )}
      </nav>
      <div className="mt-auto flex items-center gap-3 rounded-xl bg-white/5 p-3">
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
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  return (
    <div className="flex min-h-screen">
      <Sidebar className="sticky top-0 hidden lg:flex" />

      {/* Phones and tablets: top bar + slide-in menu. */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 animate-fade-in bg-ink-950/50" onClick={() => setMenuOpen(false)} />
          <Sidebar className="relative animate-slide-in-left shadow-2xl" onNavigate={() => setMenuOpen(false)} />
          <button onClick={() => setMenuOpen(false)} aria-label="Close menu"
            className="absolute left-64 top-4 grid size-9 place-items-center rounded-lg bg-white/10 text-white">
            <X className="size-5" />
          </button>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-ink-100 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="Open menu"
            className="grid size-9 place-items-center rounded-lg text-ink-700 hover:bg-ink-50">
            <Menu className="size-5" />
          </button>
          <Logo className="scale-90" />
        </header>
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          {/* Keyed by path so every page enters with the same short fade. */}
          <div key={pathname} className="animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
