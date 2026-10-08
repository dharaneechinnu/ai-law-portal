import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer, Label, control } from "@/components/ui/drawer";
import { useAuth } from "@/features/auth/AuthContext";
import { api, errorMessage } from "@/services/api";
import type { CalEvent, Hearing, Matter, UserBrief } from "@/types";

const pad = (n: number) => String(n).padStart(2, "0");
export const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const localTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const iso = (date: string, time: string) => new Date(`${date}T${time || "00:00"}`).toISOString();

function refresh(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ["calendar", "hearings", "dashboard", "matter"]) qc.invalidateQueries({ queryKey: [key] });
}

/** Create or edit a calendar event. Only the owner can change it; others see it read-only. */
export function EventDrawer({ event, day, onClose }: { event?: CalEvent; day?: Date; onClose: () => void }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const users = useQuery({ queryKey: ["users"], queryFn: () => api<UserBrief[]>("/auth/users") }).data ?? [];
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters") }).data ?? [];
  const start = event ? new Date(event.start) : new Date(`${localDate(day ?? new Date())}T10:00`);
  const end = event ? new Date(event.end) : new Date(start.getTime() + 3_600_000);
  const [f, setF] = useState({
    title: event?.title ?? "", date: localDate(start), from: localTime(start), to: localTime(end),
    location: event?.location ?? "", matter_id: event?.matter_id ?? "", attendee_ids: event?.attendee_ids ?? [],
  });
  const readOnly = !!event && event.owner_id !== user?.id;
  const body = () => JSON.stringify({
    title: f.title.trim(), start: iso(f.date, f.from), end: iso(f.date, f.to), location: f.location || null,
    matter_id: f.matter_id || null, attendee_ids: f.attendee_ids,
  });
  const save = useMutation({
    mutationFn: () => event
      ? api(`/calendar/events/${event.id}`, { method: "PATCH", body: body() })
      : api("/calendar/events", { method: "POST", body: body() }),
    onSuccess: () => { refresh(qc); onClose(); },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/calendar/events/${event!.id}`, { method: "PATCH", body: JSON.stringify({ status: "cancelled" }) }),
    onSuccess: () => { refresh(qc); onClose(); },
  });
  const byId = new Map(users.map((u) => [u.id, u.name]));
  const pickable = users.filter((u) => u.id !== user?.id && !f.attendee_ids.includes(u.id));
  const invalid = !f.title.trim() || !f.date || f.to <= f.from;

  return (
    <Drawer title={event ? (readOnly ? "Event" : "Edit event") : "New event"} onClose={onClose}
      footer={readOnly ? <Button variant="outline" size="sm" className="ml-auto" onClick={onClose}>Close</Button> : (
        <>
          {event && <Button variant="ghost" size="sm" className="text-red-600" onClick={() => cancel.mutate()} disabled={cancel.isPending}>Cancel event</Button>}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={invalid || save.isPending}>Save</Button>
        </>
      )}>
      <fieldset disabled={readOnly} className="space-y-4">
        <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Title"
          className="w-full text-lg font-medium text-ink-900 outline-none placeholder:text-ink-300" />
        <div className="grid grid-cols-3 gap-3">
          <Label text="Date" className="col-span-3 sm:col-span-1"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={control} /></Label>
          <Label text="From"><input type="time" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} className={control} /></Label>
          <Label text="To"><input type="time" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} className={control} /></Label>
        </div>
        {f.to <= f.from && <p className="text-xs text-red-600">End must be after start.</p>}
        <Label text="Location"><input value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} className={control} /></Label>
        <Label text="Matter">
          <select value={f.matter_id} onChange={(e) => setF({ ...f, matter_id: e.target.value })} className={control}>
            <option value="">None</option>
            {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Label>
        <div className="space-y-2">
          <div className="text-xs text-ink-400">People</div>
          <div className="flex flex-wrap gap-1.5">
            {f.attendee_ids.map((id) => (
              <span key={id} className="flex animate-pop items-center gap-1 rounded-full bg-ink-50 py-1 pl-2.5 pr-1 text-xs text-ink-700">
                {byId.get(id) ?? "Someone"}
                {!readOnly && (
                  <button type="button" aria-label="Remove" onClick={() => setF({ ...f, attendee_ids: f.attendee_ids.filter((a) => a !== id) })}
                    className="grid size-4 place-items-center rounded-full hover:bg-ink-200"><X className="size-3" /></button>
                )}
              </span>
            ))}
          </div>
          {!readOnly && pickable.length > 0 && (
            <select value="" onChange={(e) => e.target.value && setF({ ...f, attendee_ids: [...f.attendee_ids, e.target.value] })}
              className={`${control} text-ink-400`}>
              <option value="">Invite someone</option>
              {pickable.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
        </div>
        {save.isError && <p className="text-xs text-red-600">{errorMessage(save.error)}</p>}
      </fieldset>
    </Drawer>
  );
}

export const HEARING_STATUSES = ["scheduled", "held", "adjourned", "cancelled"] as const;

/** Create or edit a hearing. `matterId` fixes the matter (matter Hearings tab). */
export function HearingDrawer({ hearing, matterId, day, onClose }: {
  hearing?: Hearing; matterId?: string; day?: Date; onClose: () => void;
}) {
  const qc = useQueryClient();
  const matters = useQuery({ queryKey: ["matters"], queryFn: () => api<Matter[]>("/matters"), enabled: !matterId && !hearing }).data ?? [];
  const at = hearing ? new Date(hearing.scheduled_at) : new Date(`${localDate(day ?? new Date())}T10:30`);
  const [f, setF] = useState({
    matter_id: hearing?.matter_id ?? matterId ?? "", date: localDate(at), time: localTime(at),
    court_room: hearing?.court_room ?? "", purpose: hearing?.purpose ?? "", status: hearing?.status ?? "scheduled",
    outcome: hearing?.outcome ?? "",
  });
  const save = useMutation({
    mutationFn: () => {
      const payload = {
        scheduled_at: iso(f.date, f.time), court_room: f.court_room || null, purpose: f.purpose || null,
        status: f.status, outcome: f.outcome || null,
      };
      return hearing
        ? api(`/hearings/${hearing.id}`, { method: "PATCH", body: JSON.stringify(payload) })
        : api("/hearings", { method: "POST", body: JSON.stringify({ ...payload, matter_id: f.matter_id }) });
    },
    onSuccess: () => { refresh(qc); onClose(); },
  });
  return (
    <Drawer title={hearing ? "Edit hearing" : "New hearing"} onClose={onClose}
      footer={<>
        <div className="flex-1" />
        <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={!f.matter_id || !f.date || save.isPending}>Save</Button>
      </>}>
      <div className="space-y-4">
        {hearing?.matter_title && <p className="text-sm font-medium text-ink-900">{hearing.matter_title}</p>}
        {!hearing && !matterId && (
          <Label text="Matter">
            <select value={f.matter_id} onChange={(e) => setF({ ...f, matter_id: e.target.value })} className={control}>
              <option value="">Choose a matter</option>
              {matters.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </Label>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Label text="Date"><input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className={control} /></Label>
          <Label text="Time"><input type="time" value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} className={control} /></Label>
        </div>
        <Label text="Purpose"><input value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} placeholder="e.g. Arguments" className={control} /></Label>
        <Label text="Court room"><input value={f.court_room} onChange={(e) => setF({ ...f, court_room: e.target.value })} className={control} /></Label>
        <Label text="Status">
          <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })} className={control}>
            {HEARING_STATUSES.map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
          </select>
        </Label>
        {f.status !== "scheduled" && (
          <Label text="Outcome" className="animate-fade-in">
            <textarea value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })} rows={3}
              className="w-full resize-none rounded-lg border border-ink-100 p-2.5 text-sm text-ink-800 outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25" />
          </Label>
        )}
        {save.isError && <p className="text-xs text-red-600">{errorMessage(save.error)}</p>}
      </div>
    </Drawer>
  );
}
