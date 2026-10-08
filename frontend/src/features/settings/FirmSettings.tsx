import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, errorMessage } from "@/services/api";
import type { FirmSettingsData } from "@/types";

type Key = keyof FirmSettingsData;
const ROWS: { key: Key; label: string; hint: string; options: [number, string][] }[] = [
  { key: "legal_alert_threshold", label: "Legal alert threshold", hint: "A matched judgment becomes an alert at this relevance.",
    options: [[0.5, "50%"], [0.6, "60%"], [0.7, "70%"], [0.75, "75%"], [0.8, "80%"], [0.9, "90%"]] },
  { key: "hearing_reminder_hours", label: "Hearing reminder", hint: "How far ahead the matter team is reminded.",
    options: [[12, "12 hours before"], [24, "1 day before"], [48, "2 days before"], [72, "3 days before"], [168, "1 week before"]] },
  { key: "meeting_reminder_minutes", label: "Meeting reminder", hint: "For calendar events.",
    options: [[5, "5 minutes before"], [10, "10 minutes before"], [15, "15 minutes before"], [30, "30 minutes before"], [60, "1 hour before"]] },
  { key: "task_due_reminder_hours", label: "Task due reminder", hint: "Sent to the assignee.",
    options: [[4, "4 hours before"], [12, "12 hours before"], [24, "1 day before"], [48, "2 days before"]] },
  { key: "approval_expiry_days", label: "Approval requests expire", hint: "Unanswered AI requests stop after this.",
    options: [[1, "after 1 day"], [3, "after 3 days"], [7, "after 7 days"], [14, "after 14 days"], [30, "after 30 days"]] },
];

/** Firm-wide notification and alert settings (admins). Each person still picks which notifications they get in Account. */
export function FirmSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["firm-settings"], queryFn: () => api<FirmSettingsData>("/settings/firm") });
  const [f, setF] = useState<FirmSettingsData | null>(null);
  useEffect(() => { if (data) setF(data); }, [data]);
  const save = useMutation({
    mutationFn: () => api<FirmSettingsData>("/settings/firm", { method: "PUT", body: JSON.stringify(f) }),
    onSuccess: (d) => qc.setQueryData(["firm-settings"], d),
  });
  if (!f || !data) return <div className="h-48 animate-pulse rounded-2xl bg-ink-50" />;
  const dirty = ROWS.some((r) => f[r.key] !== data[r.key]);

  return (
    <div>
      <div className="divide-y divide-ink-50 rounded-2xl border border-ink-100 bg-white">
        {ROWS.map((r, i) => {
          // keep a saved value selectable even if it is not one of the presets
          const opts = r.options.some(([v]) => v === data[r.key]) ? r.options : [...r.options, [data[r.key], String(data[r.key])] as [number, string]];
          return (
            <label key={r.key} style={{ animationDelay: `${i * 30}ms` }} className="flex animate-slide-up flex-wrap items-center gap-3 px-4 py-3">
              <span className="min-w-56 flex-1">
                <span className="block text-sm font-medium text-ink-900">{r.label}</span>
                <span className="block text-xs text-ink-400">{r.hint}</span>
              </span>
              <select value={f[r.key]} onChange={(e) => setF({ ...f, [r.key]: Number(e.target.value) })}
                className="h-9 w-48 rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-800 outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25">
                {opts.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
            </label>
          );
        })}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>Save</Button>
        {save.isSuccess && !dirty && <span className="flex animate-fade-in items-center gap-1 text-sm text-emerald-700"><Check className="size-4" /> Saved</span>}
        {save.isError && <span className="text-sm text-red-600">{errorMessage(save.error)}</span>}
      </div>
      <p className="mt-3 text-xs text-ink-400">Each person still chooses which notifications they get on their Account page.</p>
    </div>
  );
}
