import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, control } from "@/components/ui/drawer";
import { api, errorMessage } from "@/services/api";
import type { EmailConfig } from "@/types";

const SECURITY = [["starttls", "STARTTLS"], ["ssl", "SSL/TLS"], ["none", "None"]] as const;

/** SMTP settings (admins). Works with any mail server. The password is write-only. */
export function EmailSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["email-config"], queryFn: () => api<EmailConfig>("/settings/email") });
  const [f, setF] = useState({ host: "", port: 587, security: "starttls" as EmailConfig["security"], username: "", password: "", sender: "" });
  useEffect(() => {
    if (data?.configured) setF((p) => ({ ...p, host: data.host ?? "", port: data.port ?? 587, security: data.security, username: data.username ?? "", sender: data.sender ?? "" }));
  }, [data]);
  const save = useMutation({
    mutationFn: () => api<EmailConfig>("/settings/email", { method: "PUT", body: JSON.stringify({ ...f, username: f.username || null, password: f.password || null }) }),
    onSuccess: (d) => { qc.setQueryData(["email-config"], d); setF((p) => ({ ...p, password: "" })); },
  });
  const test = useMutation({ mutationFn: () => api<{ sent_to: string }>("/settings/email/test", { method: "POST" }) });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "port" ? Number(e.target.value) : e.target.value });

  return (
    <div className="max-w-2xl">
      <p className="mb-4 text-sm text-ink-500">
        Used for invite links and for emails the AI sends after approval. The password is stored encrypted and never shown again.
      </p>
      <form className="grid gap-3 rounded-2xl border border-ink-100 bg-white p-5 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Label text="SMTP server"><input value={f.host} onChange={set("host")} placeholder="smtp.office365.com" className={control} /></Label>
        <div className="grid grid-cols-2 gap-3">
          <Label text="Port"><input type="number" value={f.port} onChange={set("port")} className={control} /></Label>
          <Label text="Security">
            <select value={f.security} onChange={set("security")} className={control}>
              {SECURITY.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Label>
        </div>
        <Label text="Username"><input value={f.username} onChange={set("username")} autoComplete="off" className={control} /></Label>
        <Label text="Password">
          <input type="password" value={f.password} onChange={set("password")} autoComplete="new-password"
            placeholder={data?.has_password ? "Saved. Type to replace" : ""} className={control} />
        </Label>
        <Label text="Send from" className="sm:col-span-2"><input type="email" value={f.sender} onChange={set("sender")} placeholder="portal@yourfirm.com" className={control} /></Label>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
          <Button disabled={!f.host || !f.sender || save.isPending}>Save</Button>
          <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={!data?.configured || test.isPending}>
            <Mail className="size-4" /> {test.isPending ? "Sending…" : "Send test email"}
          </Button>
          {save.isSuccess && <span className="flex animate-fade-in items-center gap-1 text-sm text-emerald-700"><Check className="size-4" /> Saved</span>}
          {test.isSuccess && <span className="animate-fade-in text-sm text-emerald-700">Sent to {test.data.sent_to}</span>}
        </div>
        {(save.isError || test.isError) && <p className="text-sm text-red-600 sm:col-span-2">{errorMessage(save.error ?? test.error)}</p>}
      </form>
    </div>
  );
}
