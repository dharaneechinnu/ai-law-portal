import { NavLink, Outlet } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useAuth } from "@/features/auth/AuthContext";

const nav = [
  ["/", "Dashboard"],
  ["/matters", "Matters"],
  ["/clients", "Clients"],
  ["/people", "People"],
  ["/tasks", "Tasks & Calendar"],
  ["/legal", "Legal Intelligence"],
  ["/analytics", "Analytics"],
  ["/settings", "Settings"],
  ["/account", "Account"],
] as const;

export function Layout() {
  const { user, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 shrink-0 border-r bg-white p-4">
        <div className="mb-6 text-lg font-semibold">AI Law Portal</div>
        <nav className="flex flex-col gap-1">
          {nav.map(([to, label]) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn("rounded-md px-3 py-2 text-sm hover:bg-slate-100", isActive && "bg-slate-900 text-white hover:bg-slate-900")
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8 border-t pt-4 text-xs text-slate-500">
          <div>{user?.name} ({user?.role_name})</div>
          <button className="mt-1 underline" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
