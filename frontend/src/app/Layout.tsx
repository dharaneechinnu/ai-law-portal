import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, Briefcase, Building2, CalendarDays, ChevronsLeft, Gavel, LayoutDashboard, ListChecks, LogOut, Menu, Moon, Search,
  Settings, ShieldCheck, Sparkles, Stamp, Sun, UserCircle, Users, X,
} from "lucide-react";
import { api } from "@/services/api";
import { Logo } from "@/components/brand/Logo";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsSheet } from "@/components/ShortcutsSheet";
import { cn } from "@/lib/utils";
import { GO_KEYS, MOD, fire, typing } from "@/lib/shortcuts";
import { clearTheme, useTheme } from "@/lib/theme";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AssistantPanel } from "@/features/ai/AssistantPanel";

const nav = [
  ["Work", [
    ["/", "Dashboard", LayoutDashboard],
    ["/matters", "Matters", Briefcase],
    ["/clients", "Clients", Building2],
    ["/people", "People", Users],
    ["/tasks", "Tasks", ListChecks],
    ["/calendar", "Calendar", CalendarDays],
  ]],
  ["Intelligence", [
    ["/legal", "Legal Intelligence", Gavel],
    ["/approvals", "Approvals", Stamp],
    ["/analytics", "Analytics", BarChart3],
  ]],
  ["You", [
    ["/settings", "Settings", Settings],
    ["/account", "Account", UserCircle],
  ]],
] as const;

const COLLAPSE_KEY = "lex-sidebar-collapsed";
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSE_KEY) === "1"; } catch { return false; } };

function Item({ to, label, Icon, badge = 0, collapsed, onNavigate }: {
  to: string; label: string; Icon: typeof Users; badge?: number; collapsed: boolean; onNavigate?: () => void;
}) {
  return (
    <NavLink to={to} end={to === "/"} onClick={onNavigate} title={collapsed ? label : undefined}
      className={({ isActive }) => cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-night-200/80 transition-all duration-200 hover:bg-snow/5 hover:text-snow",
        isActive && "bg-snow/10 text-snow",
        collapsed && "justify-center px-0",
      )}>
      {({ isActive }) => (
        <>
          <span className={cn("absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brass-400 transition-transform duration-300",
            isActive ? "scale-y-100" : "scale-y-0")} />
          <Icon className={cn("size-[18px] shrink-0 transition-all duration-200 group-hover:scale-110",
            isActive ? "text-brass-300" : "text-night-300 group-hover:text-brass-200")} />
          {!collapsed && <span className="truncate">{label}</span>}
          {badge > 0 && (
            <span key={badge} className={cn("grid h-5 min-w-5 animate-pop place-items-center rounded-full bg-brass-400 px-1.5 text-[11px] font-semibold tabular-nums text-night-950",
              collapsed ? "absolute -right-1 -top-1 h-4 min-w-4 px-1 text-[10px]" : "ml-auto")}>{badge}</span>
          )}
        </>
      )}
    </NavLink>
  );
}

function Sidebar({ collapsed, onCollapse, onNavigate, pending }: {
  collapsed: boolean; onCollapse?: () => void; onNavigate?: () => void; pending: number;
}) {
  const { user, logout } = useAuth();
  return (
    <div className="flex h-full flex-col px-3 py-5">
      <div className={cn("mb-7 flex items-center", collapsed ? "justify-center" : "justify-between pl-2")}>
        {collapsed ? <Logo dark compact /> : <Logo dark />}
        {onCollapse && !collapsed && (
          <button onClick={onCollapse} aria-label="Collapse sidebar" title="Collapse"
            className="grid size-7 place-items-center rounded-lg text-night-300 transition hover:bg-snow/10 hover:text-snow">
            <ChevronsLeft className="size-4" />
          </button>
        )}
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-hidden">
        {nav.map(([group, items], gi) => (
          <div key={group} className={cn(gi > 0 && "mt-4")}>
            {!collapsed && <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-night-400">{group}</div>}
            {collapsed && gi > 0 && <div className="mx-auto mb-3 h-px w-6 bg-snow/10" />}
            {items.map(([to, label, Icon]) => (
              <Item key={to} to={to} label={label} Icon={Icon} collapsed={collapsed} onNavigate={onNavigate}
                badge={to === "/approvals" ? pending : 0} />
            ))}
          </div>
        ))}
        {user?.role_name === "admin" && (
          <div className="mt-4">
            {!collapsed && <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-night-400">Admin</div>}
            {collapsed && <div className="mx-auto mb-3 h-px w-6 bg-snow/10" />}
            <Item to="/admin/users" label="Team & access" Icon={ShieldCheck} collapsed={collapsed} onNavigate={onNavigate} />
          </div>
        )}
      </nav>
      {onCollapse && collapsed && (
        <button onClick={onCollapse} aria-label="Expand sidebar" title="Expand"
          className="mx-auto mb-3 grid size-8 place-items-center rounded-lg text-night-300 transition hover:bg-snow/10 hover:text-snow">
          <ChevronsLeft className="size-4 rotate-180" />
        </button>
      )}
      <div className={cn("flex items-center gap-3 rounded-xl bg-snow/5 p-2.5", collapsed && "flex-col p-2")}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 text-xs font-semibold text-night-950 ring-2 ring-snow/10">
          {initials(user?.name ?? "")}
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-snow">{user?.name}</div>
            <div className="truncate text-xs capitalize text-night-300">{user?.role_name}</div>
          </div>
        )}
        <button onClick={logout} aria-label="Sign out" title="Sign out"
          className="grid size-8 place-items-center rounded-lg text-night-300 transition hover:bg-snow/10 hover:text-snow">
          <LogOut className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return (
    <button aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={`${dark ? "Light" : "Dark"} theme (Shift+D)`}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
      className="relative grid size-9 place-items-center overflow-hidden rounded-xl text-ink-500 transition hover:bg-ink-50 hover:text-ink-900">
      <Sun className={cn("absolute size-[18px] transition-all duration-500", dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0")} />
      <Moon className={cn("absolute size-[18px] transition-all duration-500", dark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}

/** Ctrl/⌘+K, Ctrl/⌘+J, ?, Shift+D and "G then letter" navigation. */
function useGlobalKeys() {
  const navigate = useNavigate();
  const { toggle } = useTheme();
  const pendingG = useRef(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "k") { e.preventDefault(); fire("palette"); return; }
      if (mod && key === "j") { e.preventDefault(); fire("assistant"); return; }
      if (mod || e.altKey || typing(e) || document.querySelector("[role=dialog][aria-modal=true]")) return;
      if (e.key === "?") { e.preventDefault(); fire("shortcuts"); return; }
      if (e.shiftKey && key === "d") { e.preventDefault(); toggle(); return; }
      if (e.shiftKey) return;
      if (pendingG.current && Date.now() - pendingG.current < 1200 && GO_KEYS[key]) {
        e.preventDefault();
        pendingG.current = 0;
        navigate(GO_KEYS[key][0]);
        return;
      }
      pendingG.current = key === "g" ? Date.now() : 0;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, toggle]);
}

export function Layout() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);
  useTheme();
  useGlobalKeys();
  useEffect(() => clearTheme, []);
  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const { data: pending = 0 } = useQuery({
    queryKey: ["approvals", "count"],
    queryFn: () => api<{ pending: number }>("/approvals/count").then((r) => r.pending),
    refetchInterval: 30_000,
  });

  const collapse = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* per-visit only */ }
    return !c;
  });

  return (
    <div className="flex min-h-screen">
      <aside className={cn("sticky top-0 hidden h-screen shrink-0 bg-night-950 transition-[width] duration-300 ease-out md:block",
        collapsed ? "w-[76px]" : "w-64")}>
        <Sidebar collapsed={collapsed} onCollapse={collapse} pending={pending} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-night-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-[slide-in-left_0.3s_cubic-bezier(0.2,0.7,0.2,1)_both] bg-night-950 shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
              className="absolute right-3 top-5 grid size-8 place-items-center rounded-lg text-night-300 hover:bg-snow/10 hover:text-snow">
              <X className="size-4" />
            </button>
            <Sidebar collapsed={false} onNavigate={() => setMobileOpen(false)} pending={pending} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-ink-100/70 bg-slate-50/75 px-4 backdrop-blur-xl md:px-8">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
            className="grid size-9 place-items-center rounded-xl text-ink-500 hover:bg-ink-50 md:hidden">
            <Menu className="size-5" />
          </button>
          <button onClick={() => fire("palette")}
            className="group flex h-10 w-full max-w-md items-center gap-2.5 rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-400 shadow-sm transition hover:border-brass-300 hover:shadow-md">
            <Search className="size-4 transition group-hover:text-brass-600" />
            <span className="flex-1 truncate text-left">Search or jump to…</span>
            <span className="hidden items-center gap-1 sm:flex"><kbd>{MOD}</kbd><kbd>K</kbd></span>
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => fire("assistant")} title={`Assistant (${MOD}+J)`}
              className="group hidden h-9 items-center gap-2 rounded-xl px-3 text-sm font-medium text-ink-600 transition hover:bg-brass-100/60 hover:text-brass-700 sm:flex">
              <Sparkles className="size-4 text-brass-500 transition group-hover:rotate-12 group-hover:scale-110" /> Ask AI
            </button>
            <ThemeToggle />
            <NotificationBell />
          </div>
        </header>
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
          <div key={location.pathname} className="animate-page">
            <Outlet />
          </div>
        </main>
      </div>

      <AssistantPanel />
      <CommandPalette />
      <ShortcutsSheet />
    </div>
  );
}
