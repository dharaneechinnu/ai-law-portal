import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase, KeyRound, Link2, Lock, Mail, MailPlus, MoreHorizontal, Search, ShieldCheck, User as UserIcon,
  UserCheck, UserPlus, Users, UserX,
} from "lucide-react";
import { Field } from "@/components/ui/field";
import { useAuth } from "@/features/auth/AuthContext";
import { PrimaryButton } from "@/features/auth/AuthShell";
import { PasswordStrength } from "@/features/auth/PasswordStrength";
import { cn } from "@/lib/utils";
import { api, errorMessage } from "@/services/api";
import type { AdminUser, AdminUserCreated, UserStatus } from "@/types";
import { ROLES, initials, inviteUrl, relativeTime, roleMeta } from "./roles";
import { CopyField, Modal, useCountUp, useToasts } from "./ui";

const STATUS: Record<UserStatus, { label: string; cls: string; dot: string }> = {
  active: { label: "Active", cls: "bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  invited: { label: "Invite pending", cls: "bg-amber-50 text-amber-700", dot: "bg-amber-500 animate-pulse" },
  disabled: { label: "Disabled", cls: "bg-ink-50 text-ink-400", dot: "bg-ink-300" },
};

function StatCard({ icon, label, value, tone, delay }: { icon: ReactNode; label: string; value: number; tone: string; delay: number }) {
  const n = useCountUp(value);
  return (
    <div className="animate-fade-up rounded-2xl border border-ink-100 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-ink-500">{label}</span>
        <span className={cn("grid size-9 place-items-center rounded-xl", tone)}>{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-semibold tabular-nums tracking-tight text-ink-900">{n}</div>
    </div>
  );
}

function Avatar({ name, role }: { name: string; role: string }) {
  return (
    <span className={cn("grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br text-sm font-semibold text-white shadow-sm", roleMeta(role).avatar)}>
      {initials(name)}
    </span>
  );
}

function RowMenu({ items }: { items: { label: string; icon: ReactNode; onClick: () => void; danger?: boolean }[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  if (!items.length) return <span className="size-8" />;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-label="Actions"
        className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700">
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-52 animate-fade-in overflow-hidden rounded-xl border border-ink-100 bg-white py-1 shadow-xl">
          {items.map((it) => (
            <button key={it.label} onClick={() => { setOpen(false); it.onClick(); }}
              className={cn("flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm hover:bg-ink-50",
                it.danger ? "text-red-600" : "text-ink-700")}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function RolePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid gap-2">
      {ROLES.map((r) => (
        <label key={r.id}
          className={cn("flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition",
            value === r.id ? "border-brass-400 bg-brass-100/40 ring-4 ring-brass-300/20" : "border-ink-100 hover:border-ink-200")}>
          <input type="radio" name="role" value={r.id} checked={value === r.id} onChange={() => onChange(r.id)} className="mt-1 accent-[#a57c2b]" />
          <span>
            <span className="block text-sm font-semibold text-ink-900">{r.label}</span>
            <span className="block text-xs text-ink-400">{r.desc}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function CreateUserPanel({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (u: AdminUser) => void }) {
  const empty = { name: "", email: "", designation: "", role: "lawyer", password: "" };
  const [f, setF] = useState(empty);
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [result, setResult] = useState<AdminUserCreated | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const create = useMutation({
    mutationFn: () => api<AdminUserCreated>("/admin/users", {
      method: "POST",
      body: JSON.stringify({ ...f, designation: f.designation || null, password: mode === "password" ? f.password : null }),
    }),
    onSuccess: (r) => { setResult(r); onCreated(r.user); },
  });
  const reset = () => { setF(empty); setResult(null); create.reset(); };
  const close = () => { reset(); onClose(); };

  return (
    <Modal open={open} onClose={close} side title={result ? "Access created" : "Add a team member"}>
      {result ? (
        <div className="animate-fade-up space-y-6">
          <div className="flex items-center gap-3 rounded-2xl bg-ink-50 p-4">
            <Avatar name={result.user.name} role={result.user.role_name} />
            <div>
              <div className="font-semibold text-ink-900">{result.user.name}</div>
              <div className="text-sm text-ink-500">{result.user.email} · <span className="capitalize">{result.user.role_name}</span></div>
            </div>
          </div>
          {result.invite_token ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-ink-800">
                {result.emailed ? `Invite emailed to ${result.user.email}` : "Send this invite link"}
              </div>
              <CopyField value={inviteUrl(result.invite_token)} />
              <p className="text-xs text-ink-400">
                Works once and expires in 7 days. It is shown only now; you can generate a new one from the user's menu.
                {!result.emailed && " It was not emailed, so share it yourself."}
              </p>
            </div>
          ) : (
            <p className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
              The account is active. Share the temporary password with {result.user.name.split(" ")[0]} securely and ask them to change it.
            </p>
          )}
          <div className="flex gap-3">
            <button onClick={reset} className="h-11 flex-1 rounded-xl border border-ink-100 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              Add another
            </button>
            <PrimaryButton className="flex-1" onClick={close}>Done</PrimaryButton>
          </div>
        </div>
      ) : (
        <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <Field label="Full name" required autoFocus value={f.name} onChange={set("name")} icon={<UserIcon className="size-4" />} />
          <Field label="Work email" type="email" required value={f.email} onChange={set("email")} icon={<Mail className="size-4" />} />
          <Field label="Designation (optional)" placeholder="e.g. Senior Associate" value={f.designation} onChange={set("designation")}
            icon={<Briefcase className="size-4" />} />
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-ink-800">Role</div>
            <RolePicker value={f.role} onChange={(role) => setF({ ...f, role })} />
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium text-ink-800">How will they sign in?</div>
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-ink-50 p-1">
              {([["invite", "Invite link", Link2], ["password", "Temporary password", KeyRound]] as const).map(([m, label, Icon]) => (
                <button key={m} type="button" onClick={() => setMode(m)}
                  className={cn("flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition",
                    mode === m ? "bg-white text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
                  <Icon className="size-4" />{label}
                </button>
              ))}
            </div>
            {mode === "invite" ? (
              <p className="text-xs text-ink-400">They choose their own password from a one-time link. Recommended.</p>
            ) : (
              <div key="pw" className="animate-fade-up">
                <Field label="Temporary password" type="password" required minLength={8} value={f.password} onChange={set("password")}
                  icon={<Lock className="size-4" />} hint={<PasswordStrength password={f.password} />} />
              </div>
            )}
          </div>
          {create.isError && <div className="animate-shake rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{errorMessage(create.error)}</div>}
          <PrimaryButton type="submit" loading={create.isPending}><UserPlus className="size-4" />Create access</PrimaryButton>
        </form>
      )}
    </Modal>
  );
}

export function AdminUsersPage() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const toast = useToasts();
  const { data: users = [], isLoading } = useQuery({ queryKey: ["admin-users"], queryFn: () => api<AdminUser[]>("/admin/users") });
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<"all" | UserStatus>("all");
  const [role, setRole] = useState("all");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState<{ name: string; url: string } | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-users"] });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api<AdminUser>(`/admin/users/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: (u, v) => {
      refresh();
      toast.push("role" in v.body ? `${u.name} is now ${roleMeta(u.role_name).label}` : `${u.name} ${u.status === "disabled" ? "disabled" : "enabled"}`);
    },
    onError: (e) => toast.push(errorMessage(e), "err"),
  });
  const reinvite = useMutation({
    mutationFn: (id: string) => api<AdminUserCreated>(`/admin/users/${id}/invite`, { method: "POST" }),
    onSuccess: (r) => {
      refresh();
      setLink({ name: r.user.name, url: inviteUrl(r.invite_token!) });
      if (r.emailed) toast.push(`New link emailed to ${r.user.name}`);
    },
    onError: (e) => toast.push(errorMessage(e), "err"),
  });

  const counts = useMemo(() => ({
    total: users.length,
    active: users.filter((u) => u.status === "active").length,
    invited: users.filter((u) => u.status === "invited").length,
    disabled: users.filter((u) => u.status === "disabled").length,
  }), [users]);

  const shown = users.filter((u) =>
    (status === "all" || u.status === status) && (role === "all" || u.role_name === role) &&
    (!q || `${u.name} ${u.email} ${u.designation ?? ""}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="-m-8 min-h-screen bg-ink-50/50">
      {/* hero */}
      <div className="relative overflow-hidden bg-ink-950 px-8 pb-24 pt-10">
        <div className="pointer-events-none absolute -right-20 -top-24 size-80 rounded-full bg-brass-500/25 blur-3xl animate-drift" />
        <div className="pointer-events-none absolute -left-24 top-10 size-72 rounded-full bg-ink-500/40 blur-3xl animate-drift" style={{ animationDelay: "-7s" }} />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="animate-fade-up">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-brass-300">
              <ShieldCheck className="size-4" /> Admin · {me?.firm_name ?? "Your firm"}
            </div>
            <h1 className="font-serif text-4xl font-bold text-white">Team & access</h1>
            <p className="mt-2 max-w-xl text-ink-200/80">Create logins for your firm, set each person's role, and turn access off the moment someone leaves.</p>
          </div>
          <button onClick={() => setCreating(true)}
            className="inline-flex h-11 animate-fade-up items-center gap-2 rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 px-5 text-sm font-semibold text-ink-950 shadow-lg shadow-brass-500/30 transition hover:-translate-y-0.5 hover:shadow-xl">
            <UserPlus className="size-4" /> Add team member
          </button>
        </div>
      </div>

      <div className="relative -mt-16 space-y-6 px-8 pb-12">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total members" value={counts.total} delay={0} tone="bg-ink-100 text-ink-700" icon={<Users className="size-4" />} />
          <StatCard label="Active" value={counts.active} delay={80} tone="bg-emerald-50 text-emerald-600" icon={<UserCheck className="size-4" />} />
          <StatCard label="Invites pending" value={counts.invited} delay={160} tone="bg-amber-50 text-amber-600" icon={<MailPlus className="size-4" />} />
          <StatCard label="Disabled" value={counts.disabled} delay={240} tone="bg-ink-50 text-ink-400" icon={<UserX className="size-4" />} />
        </div>

        <div className="animate-fade-up overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm" style={{ animationDelay: "200ms" }}>
          <div className="flex flex-wrap items-center gap-3 border-b border-ink-100 p-4">
            <div className="relative min-w-56 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-300" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email or designation"
                className="h-10 w-full rounded-xl border border-ink-100 pl-9 pr-3 text-sm outline-none focus:border-brass-400 focus:ring-4 focus:ring-brass-300/20" />
            </div>
            <div className="flex rounded-xl bg-ink-50 p-1">
              {(["all", "active", "invited", "disabled"] as const).map((s) => (
                <button key={s} onClick={() => setStatus(s)}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition",
                    status === s ? "bg-white text-ink-900 shadow-sm" : "text-ink-400 hover:text-ink-700")}>
                  {s === "invited" ? "Pending" : s}
                </button>
              ))}
            </div>
            <select value={role} onChange={(e) => setRole(e.target.value)}
              className="h-10 rounded-xl border border-ink-100 bg-white px-3 text-sm text-ink-700 outline-none focus:border-brass-400">
              <option value="all">All roles</option>
              {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </div>

          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] gap-4 border-b border-ink-100 bg-ink-50/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-400 md:grid">
            <span>Member</span><span>Role</span><span>Status</span><span>Last sign-in</span><span />
          </div>

          {isLoading && (
            <div className="space-y-3 p-5">
              {[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-ink-50" />)}
            </div>
          )}
          {!isLoading && shown.length === 0 && (
            <div className="p-12 text-center text-sm text-ink-400">No members match these filters.</div>
          )}

          <ul className="divide-y divide-ink-100">
            {shown.map((u, i) => {
              const self = u.id === me?.id;
              const st = STATUS[u.status];
              return (
                <li key={u.id} className="grid animate-fade-up items-center gap-3 px-5 py-4 transition-colors hover:bg-ink-50/50 md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_40px] md:gap-4"
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}>
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={u.name} role={u.role_name} />
                    <div className="min-w-0">
                      <div className="truncate font-semibold text-ink-900">{u.name}{self && <span className="ml-2 text-xs font-normal text-ink-400">(you)</span>}</div>
                      <div className="truncate text-sm text-ink-400">{u.email}{u.designation ? ` · ${u.designation}` : ""}</div>
                    </div>
                  </div>
                  <div>
                    <select value={u.role_name} disabled={self || update.isPending}
                      onChange={(e) => update.mutate({ id: u.id, body: { role: e.target.value } })}
                      title={self ? "You cannot change your own role" : "Change role"}
                      className={cn("rounded-full px-3 py-1 text-xs font-semibold ring-1 outline-none disabled:cursor-not-allowed", roleMeta(u.role_name).tone)}>
                      {ROLES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold", st.cls)}>
                      <span className={cn("size-1.5 rounded-full", st.dot)} />{st.label}
                    </span>
                    {u.status === "invited" && u.invite_expires_at && (
                      <div className="mt-1 text-xs text-ink-400">Expires {new Date(u.invite_expires_at).toLocaleDateString()}</div>
                    )}
                  </div>
                  <div className="text-sm text-ink-500">{relativeTime(u.last_login_at)}</div>
                  <div className="flex justify-end">
                    <RowMenu items={self ? [] : [
                      ...(u.status !== "active"
                        ? [{ label: "New invite link", icon: <Link2 className="size-4" />, onClick: () => reinvite.mutate(u.id) }]
                        : [{ label: "Password reset link", icon: <KeyRound className="size-4" />, onClick: () => reinvite.mutate(u.id) }]),
                      u.status === "disabled"
                        ? { label: "Enable access", icon: <UserCheck className="size-4" />, onClick: () => update.mutate({ id: u.id, body: { is_active: true } }) }
                        : { label: "Disable access", icon: <UserX className="size-4" />, danger: true, onClick: () => update.mutate({ id: u.id, body: { is_active: false } }) },
                    ]} />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>

      <CreateUserPanel open={creating} onClose={() => setCreating(false)} onCreated={(u) => { refresh(); toast.push(`Access created for ${u.name}`); }} />
      <Modal open={!!link} onClose={() => setLink(null)} title="New access link">
        {link && (
          <div className="space-y-4">
            <p className="text-sm text-ink-500">Send this to <span className="font-semibold text-ink-800">{link.name}</span>. Any earlier link stops working.</p>
            <CopyField value={link.url} />
            <p className="text-xs text-ink-400">Works once and expires in 7 days.</p>
          </div>
        )}
      </Modal>
      {toast.view}
    </div>
  );
}
