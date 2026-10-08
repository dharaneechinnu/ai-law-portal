import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/AuthContext";
import { api } from "@/services/api";
import type { User } from "@/types";

const input = "w-full rounded-md border px-3 py-2 text-sm";
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
const NOTIFY: [string, string][] = [
  ["briefing", "Daily briefing"],
  ["reminders", "Hearing and deadline reminders"],
  ["legal_alerts", "New legal developments"],
  ["approvals", "Approval requests"],
];
const AI_MODES = ["suggest", "approval", "autonomous"];

const field = (label: string, el: React.ReactNode) => (
  <label className="grid gap-1 text-sm"><span className="text-slate-500">{label}</span>{el}</label>
);

export function AccountPage() {
  const { user, setUser } = useAuth();
  const u = user!;
  const [f, setF] = useState({
    name: u.name, designation: u.designation ?? "", phone: u.phone ?? "", office_location: u.office_location ?? "",
    practice_areas: u.practice_areas.join(", "), timezone: u.timezone, daily_briefing_time: u.daily_briefing_time ?? "",
  });
  const [hours, setHours] = useState(u.working_hours);
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
    <form className="max-w-2xl space-y-8" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
      <h1 className="text-xl font-semibold">Account</h1>

      <section className="grid gap-3 rounded-lg border bg-white p-4">
        <h2 className="font-medium">Profile</h2>
        <div className="grid grid-cols-2 gap-3">
          {field("Name", <input className={input} required value={f.name} onChange={set("name")} />)}
          {field("Email", <input className={input} disabled value={u.email} />)}
          {field("Role (admin-managed)", <input className={input} disabled value={u.role_name} />)}
          {field("Designation", <input className={input} value={f.designation} onChange={set("designation")} />)}
          {field("Phone", <input className={input} value={f.phone} onChange={set("phone")} />)}
          {field("Office location", <input className={input} value={f.office_location} onChange={set("office_location")} />)}
        </div>
        {field("Practice areas (comma separated)", <input className={input} value={f.practice_areas} onChange={set("practice_areas")} />)}
      </section>

      <section className="grid gap-3 rounded-lg border bg-white p-4">
        <h2 className="font-medium">Time and working hours</h2>
        <div className="grid grid-cols-2 gap-3">
          {field("Time zone (IANA)", <input className={input} value={f.timezone} onChange={set("timezone")} />)}
          {field("Daily briefing time (HH:MM)", <input className={input} type="time" value={f.daily_briefing_time} onChange={set("daily_briefing_time")} />)}
        </div>
        <div className="grid gap-2">
          {DAYS.map((d) => {
            const h = hours[d];
            return (
              <div key={d} className="flex items-center gap-3 text-sm">
                <label className="flex w-20 items-center gap-2 uppercase">
                  <input type="checkbox" checked={!!h} onChange={(e) => setHours({ ...hours, [d]: e.target.checked ? ["09:00", "18:00"] : null })} />
                  {d}
                </label>
                {h ? (
                  <>
                    <input type="time" className="rounded-md border px-2 py-1" value={h[0]} onChange={(e) => setHours({ ...hours, [d]: [e.target.value, h[1]] })} />
                    <span>to</span>
                    <input type="time" className="rounded-md border px-2 py-1" value={h[1]} onChange={(e) => setHours({ ...hours, [d]: [h[0], e.target.value] })} />
                  </>
                ) : <span className="text-slate-400">Off</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-2 rounded-lg border bg-white p-4">
        <h2 className="font-medium">Notifications</h2>
        {NOTIFY.map(([k, label]) => (
          <label key={k} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={notify[k] ?? true} onChange={(e) => setNotify({ ...notify, [k]: e.target.checked })} />
            {label}
          </label>
        ))}
      </section>

      <section className="grid gap-2 rounded-lg border bg-white p-4">
        <h2 className="font-medium">AI preferences</h2>
        {field("Default execution mode", (
          <select className={input} value={aiMode} onChange={(e) => setAiMode(e.target.value)}>
            {AI_MODES.map((m) => <option key={m}>{m}</option>)}
          </select>
        ))}
        <p className="text-xs text-slate-500">A preference only. Server-side policy decides what agents may actually do.</p>
      </section>

      {save.isError && <p className="text-sm text-red-600">{String(save.error).replace(/^Error: \d+ /, "")}</p>}
      {save.isSuccess && <p className="text-sm text-green-700">Saved.</p>}
      <Button type="submit" disabled={save.isPending}>Save changes</Button>
    </form>
  );
}
