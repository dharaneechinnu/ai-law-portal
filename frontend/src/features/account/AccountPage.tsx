import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bell, Check, Clock, Monitor, Moon, Palette, Sparkles, Sun, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, control } from "@/components/ui/drawer";
import { useAuth } from "@/features/auth/AuthContext";
import { initials } from "@/features/admin/roles";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { api, errorMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const NOTIFY: [string, string][] = [
  ["briefing", "Daily briefing"],
  ["reminders", "Hearing and deadline reminders"],
  ["legal_alerts", "New legal developments"],
  ["approvals", "Approval requests"],
];
const AI_MODES: [string, string, string][] = [
  ["suggest", "Suggest", "AI proposes; you act."],
  ["approval", "Ask first", "Changes wait for your approval."],
  ["autonomous", "Autonomous", "Runs what the firm's rules allow."],
];
// Matches the server default used for availability when a user has not set hours.
const DEFAULT_HOURS = Object.fromEntries(DAYS.map((d, i) => [d, i < 5 ? ["09:00", "18:00"] : null])) as User["working_hours"];
const THEMES: [ThemeChoice, string, typeof Sun][] = [["light", "Light", Sun], ["dark", "Dark", Moon], ["system", "Match my device", Monitor]];

function Card({ icon: Icon, title, children, className }: { icon: typeof Sun; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("animate-fade-up rounded-[20px] border border-ink-100 bg-white p-5 md:p-6", className)}>
      <h2 className="mb-4 flex items-center gap-2.5 font-serif text-lg font-bold text-ink-900">
        <span className="grid size-8 place-items-center rounded-lg bg-gradient-to-br from-night-800 to-night-950 text-brass-300"><Icon className="size-4" /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Pill switch for on/off settings. */
function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 shrink-0 rounded-full transition-colors duration-300", on ? "bg-emerald-500" : "bg-ink-200")}>
      <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow transition-transform duration-300", on && "translate-x-5")} />
    </button>
  );
}

export function AccountPage() {
  const { user, setUser } = useAuth();
  const u = user!;
  const theme = useTheme();
  const [f, setF] = useState({
    name: u.name, designation: u.designation ?? "", phone: u.phone ?? "", office_location: u.office_location ?? "",
    practice_areas: u.practice_areas.join(", "), timezone: u.timezone, daily_briefing_time: u.daily_briefing_time ?? "",
  });
  const [hours, setHours] = useState(Object.keys(u.working_hours).length ? u.working_hours : DEFAULT_HOURS);
  const [notify, setNotify] = useState(u.notification_prefs);
  const [aiMode, setAiMode] = useState(u.ai_prefs.execution_mode ?? "approval");
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const save = useMutation({
    mutationFn: () =>
      api<User>("/auth/me", {
        method: "PATCH",
        body: JSON.stringify({
          name: f.name,
          designation: f.designation || null,
          phone: f.phone || null,
          office_location: f.office_location || null,
          practice_areas: f.practice_areas.split(",").map((s) => s.trim()).filter(Boolean),
          timezone: f.timezone,
          daily_briefing_time: f.daily_briefing_time || null,
          working_hours: hours,
          notification_prefs: notify,
          ai_prefs: { ...u.ai_prefs, execution_mode: aiMode },
        }),
      }),
    onSuccess: setUser,
  });

  return (
    <form className="flex flex-col gap-[18px]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }} onChange={() => save.isSuccess && save.reset()}>
      <section className="relative isolate flex animate-fade-up flex-wrap items-center gap-5 overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 via-night-900 to-night-950 px-6 py-7 text-snow shadow-[0_24px_48px_rgba(7,13,32,0.16)] md:px-8">
        <span className="pointer-events-none absolute -right-16 -top-24 -z-10 size-72 animate-drift rounded-full bg-brass-300/20 blur-3xl" />
        <span className="grid size-20 shrink-0 animate-pop place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-500 font-serif text-2xl font-bold text-night-950 ring-4 ring-brass-300/25">
          {initials(f.name || u.name)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">Your account</p>
          <h1 className="font-serif text-3xl font-bold leading-tight">{f.name || u.name}</h1>
          <p className="mt-1 text-sm text-night-200"><span className="capitalize">{f.designation || u.role_name}</span> · {u.email}</p>
        </div>
        <div className="flex items-center gap-3">
          {save.isSuccess && <span role="status" className="flex animate-pop items-center gap-1.5 rounded-full bg-emerald-500/15 px-3 py-1.5 text-sm font-semibold text-emerald-300"><Check className="size-4" /> Saved</span>}
          <button type="submit" disabled={save.isPending}
            className="flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 px-5 text-sm font-semibold text-night-950 shadow-lg shadow-brass-500/25 transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-60">
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </section>
      {save.isError && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{errorMessage(save.error)}</p>}

      <div className="grid gap-[18px] xl:grid-cols-2">
        <Card icon={UserRound} title="Profile">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Name"><input className={control} required value={f.name} onChange={set("name")} /></Label>
            <Label text="Email"><input className={control} disabled value={u.email} /></Label>
            <Label text="Role (set by your admin)"><input className={cn(control, "capitalize")} disabled value={u.role_name} /></Label>
            <Label text="Designation"><input className={control} value={f.designation} onChange={set("designation")} /></Label>
            <Label text="Phone"><input className={control} value={f.phone} onChange={set("phone")} /></Label>
            <Label text="Office location"><input className={control} value={f.office_location} onChange={set("office_location")} /></Label>
            <Label text="Practice areas (comma separated)" className="sm:col-span-2"><input className={control} value={f.practice_areas} onChange={set("practice_areas")} /></Label>
          </div>
        </Card>

        <Card icon={Clock} title="Working day">
          <div className="grid gap-4 sm:grid-cols-2">
            <Label text="Time zone (IANA)"><input className={control} value={f.timezone} onChange={set("timezone")} /></Label>
            <Label text="Daily briefing at"><input className={control} type="time" value={f.daily_briefing_time} onChange={set("daily_briefing_time")} /></Label>
          </div>
          {f.daily_briefing_time && (
            <p className="mt-3 rounded-xl bg-brass-100/60 px-3 py-2 text-xs font-semibold text-brass-700">Your briefing will be ready at {f.daily_briefing_time} each working day.</p>
          )}
          <div className="mt-4 grid gap-1.5">
            {DAYS.map((d) => {
              const h = hours[d];
              return (
                <div key={d} className={cn("flex items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition", h ? "bg-ink-50/70" : "")}>
                  <Switch on={!!h} label={`Work on ${d}`} onChange={(on) => setHours({ ...hours, [d]: on ? ["09:00", "18:00"] : null })} />
                  <span className="w-10 font-semibold capitalize text-ink-700">{d}</span>
                  {h ? (
                    <span className="flex animate-fade-in items-center gap-2">
                      <input type="time" aria-label={`${d} start`} className={cn(control, "h-8 w-28")} value={h[0]} onChange={(e) => setHours({ ...hours, [d]: [e.target.value, h[1]] })} />
                      <span className="text-ink-400">to</span>
                      <input type="time" aria-label={`${d} end`} className={cn(control, "h-8 w-28")} value={h[1]} onChange={(e) => setHours({ ...hours, [d]: [h[0], e.target.value] })} />
                    </span>
                  ) : <span className="text-ink-300">Off</span>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card icon={Bell} title="Notifications">
          <div className="divide-y divide-ink-50">
            {NOTIFY.map(([k, label]) => (
              <div key={k} className="flex items-center justify-between gap-3 py-2.5 text-sm font-medium text-ink-800">
                {label}
                <Switch on={notify[k] ?? true} label={label} onChange={(v) => setNotify({ ...notify, [k]: v })} />
              </div>
            ))}
          </div>
        </Card>

        <div className="flex flex-col gap-[18px]">
          <Card icon={Sparkles} title="AI preference">
            <div role="radiogroup" aria-label="Default execution mode" className="grid gap-2 sm:grid-cols-3">
              {AI_MODES.map(([k, label, hint]) => (
                <button key={k} type="button" role="radio" aria-checked={aiMode === k} onClick={() => setAiMode(k)}
                  className={cn("rounded-2xl border p-3 text-left transition hover:-translate-y-0.5",
                    aiMode === k ? "border-brass-400 bg-brass-100/50 ring-4 ring-brass-300/20" : "border-ink-100 hover:border-ink-200")}>
                  <span className="block text-sm font-semibold text-ink-900">{label}</span>
                  <span className="block text-xs text-ink-500">{hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">A preference only. Server-side policy decides what agents may actually do.</p>
          </Card>

          <Card icon={Palette} title="Appearance">
            <div role="radiogroup" aria-label="Theme" className="flex flex-wrap gap-2">
              {THEMES.map(([k, label, Icon]) => (
                <button key={k} type="button" role="radio" aria-checked={theme.choice === k} onClick={() => theme.set(k)}
                  className={cn("flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold transition hover:-translate-y-0.5",
                    theme.choice === k ? "bg-ink-900 text-snow dark:bg-brass-400 dark:text-night-950" : "border border-ink-100 text-ink-600 hover:border-ink-200")}>
                  <Icon className="size-4" /> {label}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-ink-400">Applies right away on this browser.</p>
          </Card>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
      </div>
    </form>
  );
}
