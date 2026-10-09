import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, KeyRound, Lock, Mail, User as UserIcon } from "lucide-react";
import { Field } from "@/components/ui/field";
import { api } from "@/services/api";
import type { Session, SetupStatus } from "@/types";
import { useAuth } from "./AuthContext";
import { AuthHeading, AuthShell, FormError, PrimaryButton, Steps, SuccessBurst } from "./AuthShell";
import { PasswordStrength } from "./PasswordStrength";
import { useFormError } from "./useFormError";

const STEPS = ["Your firm", "Admin account", "Ready"];

/** First-run registration: creates the firm and its first admin. The server refuses it once any user exists. */
export function SetupPage() {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { data: setup, isLoading } = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/auth/setup") });
  const [step, setStep] = useState(0);
  const [f, setF] = useState({ firm_name: "", name: "", email: "", password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const err = useFormError();
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  useEffect(() => {
    if (step !== 2) return;
    const t = setTimeout(() => nav("/admin/users", { replace: true }), 2000);
    return () => clearTimeout(t);
  }, [step, nav]);

  if (isLoading) return null;
  if (setup && !setup.needs_setup && step < 2) return <Navigate to="/login" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (step === 0) return setStep(1);
    if (f.password !== f.confirm) return err.fail("Passwords do not match");
    setBusy(true);
    err.clear();
    try {
      const { confirm: _confirm, ...body } = f;
      const s = await api<Session>("/auth/setup", { method: "POST", body: JSON.stringify(body) });
      setSession(s.user);
      qc.invalidateQueries({ queryKey: ["setup"] });
      setStep(2);
    } catch (e) {
      err.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <Steps steps={STEPS} current={step === 2 ? 3 : step} />
      {step === 2 ? (
        <SuccessBurst title={`${f.firm_name} is ready`}>Next, invite your team from the admin panel…</SuccessBurst>
      ) : (
        <>
          <AuthHeading eyebrow="First-time setup" title={step === 0 ? "Register your firm" : "Create the admin account"}>
            {step === 0
              ? "This runs once. The account you create next manages who can access the portal."
              : "This admin creates logins for lawyers, associates and staff."}
          </AuthHeading>
          <form onSubmit={submit} className="space-y-5">
            {step === 0 ? (
              <div key="firm" className="animate-fade-up">
                <Field label="Firm name" required autoFocus placeholder="e.g. Shah & Rao Associates" value={f.firm_name}
                  onChange={set("firm_name")} icon={<Building2 className="size-4" />} />
              </div>
            ) : (
              <div key="admin" className="animate-fade-up space-y-5">
                <Field label="Full name" required autoFocus value={f.name} onChange={set("name")} icon={<UserIcon className="size-4" />} />
                <Field label="Work email" type="email" required autoComplete="email" value={f.email} onChange={set("email")}
                  icon={<Mail className="size-4" />} />
                <Field label="Password" type="password" required minLength={8} autoComplete="new-password" value={f.password}
                  onChange={set("password")} icon={<Lock className="size-4" />} hint={<PasswordStrength password={f.password} />} />
                <Field label="Confirm password" type="password" required autoComplete="new-password" value={f.confirm}
                  onChange={set("confirm")} icon={<KeyRound className="size-4" />} />
              </div>
            )}
            <FormError message={err.message} attempt={err.attempt} />
            <div className="flex gap-3">
              {step === 1 && (
                <button type="button" onClick={() => setStep(0)}
                  className="grid h-11 w-12 shrink-0 place-items-center rounded-xl border border-ink-100 bg-white text-ink-500 hover:bg-ink-50"
                  aria-label="Back">
                  <ArrowLeft className="size-4" />
                </button>
              )}
              <PrimaryButton type="submit" loading={busy}>
                {step === 0 ? <>Continue <ArrowRight className="size-4" /></> : "Create firm and sign in"}
              </PrimaryButton>
            </div>
          </form>
        </>
      )}
    </AuthShell>
  );
}
