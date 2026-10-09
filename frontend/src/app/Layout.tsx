import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { LogOut, Menu, Moon, Search, Settings, ShieldCheck, Sparkles, Sun, UserCircle, X } from "lucide-react";
import { api } from "@/services/api";
import { Logo } from "@/components/brand/Logo";
import { CommandPalette } from "@/components/CommandPalette";
import { ShortcutsSheet } from "@/components/ShortcutsSheet";
import { cn } from "@/lib/utils";
import { MOD, fire, goKeysFor, typing } from "@/lib/shortcuts";
import { clearTheme, useTheme } from "@/lib/theme";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";
import { ADMIN_NAV, Dock, NAV, readDock, type DockSide } from "./Dock";
import { NotificationBell } from "@/features/notifications/NotificationBell";
import { AssistantPanel } from "@/features/ai/AssistantPanel";

function MobileNav({ onNavigate, pending, admin }: { onNavigate: () => void; pending: number; admin: boolean }) {
  const items = admin ? [...NAV, ADMIN_NAV] : NAV;
  return (
    <div className="flex h-full flex-col px-3 py-5">
      <div className="mb-6 pl-2"><Logo dark /></div>
      <nav aria-label="Main" className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map(([to, label, Icon]) => (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
            className={({ isActive }) => cn("flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-night-200/80 transition hover:bg-snow/5 hover:text-snow",
              isActive && "bg-snow/10 text-snow")}>
            <Icon className="size-[18px] text-night-300" />
            <span className="flex-1">{label}</span>
            {to === "/approvals" && pending > 0 && (
              <span className="grid h-5 min-w-5 place-items-center rounded-full bg-brass-400 px-1.5 text-[11px] font-semibold text-night-950">{pending}</span>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

function AvatarMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  const row = "flex items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-700 transition hover:bg-ink-50";
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)} aria-label="Account menu" aria-expanded={open}
        className="ml-1 grid size-9 place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 text-xs font-bold text-night-950 ring-2 ring-snow/10 transition hover:ring-brass-300/60">
        {initials(user?.name ?? "")}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-60 origin-top-right animate-palette rounded-2xl border border-ink-100 bg-white p-2 text-ink-900 shadow-2xl">
          <div className="border-b border-ink-50 px-3 pb-2.5 pt-1.5">
            <div className="truncate text-sm font-semibold">{user?.name}</div>
            <div className="truncate text-xs text-ink-500"><span className="capitalize">{user?.role_name}</span> · {user?.email}</div>
          </div>
          <div className="pt-1.5">
            <Link to="/account" onClick={() => setOpen(false)} className={row}><UserCircle className="size-4 text-ink-400" />Account</Link>
            {user?.role_name === "admin" && (
              <Link to="/admin/users" onClick={() => setOpen(false)} className={row}><ShieldCheck className="size-4 text-ink-400" />Team & access</Link>
            )}
            <button onClick={logout} className={cn(row, "w-full")}><LogOut className="size-4 text-ink-400" />Sign out</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const dark = resolved === "dark";
  return (
    <button aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} title={`${dark ? "Light" : "Dark"} theme (Shift+D)`}
      onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); toggle({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); }}
      className="relative grid size-10 place-items-center overflow-hidden rounded-xl text-night-200 transition hover:bg-snow/10 hover:text-snow">
      <Sun className={cn("absolute size-[18px] transition-all duration-500", dark ? "rotate-0 scale-100 opacity-100" : "rotate-90 scale-0 opacity-0")} />
      <Moon className={cn("absolute size-[18px] transition-all duration-500", dark ? "-rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100")} />
    </button>
  );
}

/** Ctrl/⌘+K, Ctrl/⌘+J, ?, Shift+D and "G then letter" navigation. */
function useGlobalKeys() {
  const { user } = useAuth();
  const roleRef = useRef(user?.role_name);
  roleRef.current = user?.role_name;
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
      const GO_KEYS = goKeysFor(roleRef.current);
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
  const { user } = useAuth();
  const [side, setSide] = useState<DockSide>(readDock);
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

  const admin = user?.role_name === "admin";
  const items = [...NAV, ...(admin ? [ADMIN_NAV] : [])].map(([to, label, Icon]) => ({
    to, label, Icon, badge: to === "/approvals" ? pending : 0,
  }));

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 grid h-16 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 bg-night-950 px-3 text-snow shadow-[0_1px_0_rgba(255,255,255,0.06)] md:px-4">
        <div className="flex items-center gap-1">
          <button onClick={() => setMobileOpen(true)} aria-label="Open menu"
            className="grid size-9 place-items-center rounded-xl text-night-200 hover:bg-snow/10 md:hidden">
            <Menu className="size-5" />
          </button>
          <Link to="/" aria-label="Dashboard"><Logo dark className="[&>span:last-child]:hidden sm:[&>span:last-child]:inline" /></Link>
        </div>
        <button onClick={() => fire("palette")} aria-label="Search"
          className="group mx-auto flex h-10 w-10 items-center justify-center sm:w-full sm:max-w-xl sm:justify-start gap-2.5 rounded-xl bg-snow/[0.07] px-3.5 text-sm text-night-300 ring-1 ring-snow/10 transition hover:bg-snow/10 hover:ring-brass-300/40">
          <Search className="size-4 shrink-0 transition group-hover:text-brass-300" />
          <span className="hidden flex-1 truncate text-left sm:inline">Search matters, clients, documents…</span>
          <span className="hidden items-center gap-1 sm:flex"><kbd>{MOD}</kbd><kbd>K</kbd></span>
        </button>
        <div className="flex items-center gap-1">
          <button onClick={() => fire("assistant")} title={`Ask AI (${MOD}+J)`}
            className="group mr-1 hidden h-9 items-center gap-2 rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 px-3.5 text-sm font-semibold text-night-950 shadow-lg shadow-brass-500/20 transition hover:brightness-105 sm:flex">
            <Sparkles className="size-4 transition group-hover:rotate-12 group-hover:scale-110" /> Ask AI
          </button>
          <ThemeToggle />
          <NotificationBell />
          {admin && (
            <NavLink to="/settings" aria-label="Settings" title="Settings"
              className={({ isActive }) => cn("group grid size-10 place-items-center rounded-xl text-night-200 transition hover:bg-snow/10 hover:text-snow",
                isActive && "bg-snow/10 text-brass-300")}>
              <Settings className="size-[18px] transition-transform duration-500 group-hover:rotate-90" />
            </NavLink>
          )}
          <AvatarMenu />
        </div>
      </header>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 animate-fade-in bg-night-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 animate-[slide-in-left_0.3s_cubic-bezier(0.2,0.7,0.2,1)_both] bg-night-950 shadow-2xl">
            <button onClick={() => setMobileOpen(false)} aria-label="Close menu"
              className="absolute right-3 top-5 grid size-8 place-items-center rounded-lg text-night-300 hover:bg-snow/10 hover:text-snow">
              <X className="size-4" />
            </button>
            <MobileNav onNavigate={() => setMobileOpen(false)} pending={pending} admin={admin} />
          </aside>
        </div>
      )}

      <div className={cn("flex flex-1", side === "right" && "flex-row-reverse")}>
        <div className={side === "bottom"
          ? "pointer-events-none fixed inset-x-0 bottom-4 z-30 hidden justify-center md:flex [&>nav]:pointer-events-auto"
          : "sticky top-16 z-30 hidden h-[calc(100vh-4rem)] shrink-0 items-center px-2 md:flex"}>
          <Dock side={side} onSide={setSide} items={items} />
        </div>
        <main className={cn("min-w-0 flex-1 px-4 py-4 md:pb-10", side === "bottom" && "md:pb-28", side === "left" && "md:pl-1", side === "right" && "md:pr-1")}>
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
