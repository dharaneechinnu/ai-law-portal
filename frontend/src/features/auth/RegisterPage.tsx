import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Building2, KeyRound, Link2, Lock, Mail, User as UserIcon } from "lucide-react";
import { Field } from "@/components/ui/field";
import { api } from "@/services/api";
import type { InviteInfo, Session } from "@/types";
import { useAuth } from "./AuthContext";
import { AuthHeading, AuthShell, FormError, PrimaryButton, Steps, SuccessBurst } from "./AuthShell";
import { PasswordStrength } from "./PasswordStrength";
import { useFormError } from "./useFormError";

const STEPS = ["Verify invite", "Set password", "Done"];

/** Accepts a full invite link or the bare token. */
function extractToken(input: string): string {
  const v = input.trim();
  try {
    return new URL(v).searchParams.get("token") ?? v;
  } catch {
    return v;
  }
}

function EnterInvite() {
  const [, setParams] = useSearchParams();
  const [value, setValue] = useState("");
  return (
    <>
      <Steps steps={STEPS} current={0} />
      <AuthHeading eyebrow="Account activation" title="Join your firm's workspace">
        Accounts are created by your firm admin. Paste the invite link they sent you.
      </AuthHeading>
      <form className="space-y-5" onSubmit={(e) => { e.preventDefault(); if (value.trim()) setParams({ token: extractToken(value) }); }}>
        <Field label="Invite link or code" required placeholder="https://…/register?token=…" icon={<Link2 className="size-4" />}
          value={value} onChange={(e) => setValue(e.target.value)} />
        <PrimaryButton type="submit">Continue <ArrowRight className="size-4" /></PrimaryButton>
      </form>
      <BackToLogin />
    </>
  );
}

function BackToLogin() {
  return (
    <Link to="/login" className="mt-8 flex items-center justify-center gap-1.5 text-sm text-ink-500 hover:text-ink-900">
      <ArrowLeft className="size-4" /> Back to sign in
    </Link>
  );
}

function AcceptInvite({ token }: { token: string }) {
  const { setSession } = useAuth();
  const nav = useNavigate();
  const [, setParams] = useSearchParams();
  const invite = useQuery({ queryKey: ["invite", token], queryFn: () => api<InviteInfo>(`/auth/invite/${encodeURIComponent(token)}`), retry: false });
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const err = useFormError();

  useEffect(() => { if (invite.data) setName(invite.data.name); }, [invite.data]);
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => nav("/", { replace: true }), 1800);
    return () => clearTimeout(t);
  }, [done, nav]);

  if (invite.isLoading) {
    return (
      <div className="space-y-4">
        {[40, 75, 100, 100].map((w, i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-ink-100" style={{ width: `${w}%` }} />)}
      </div>
    );
  }
  if (invite.isError) {
    return (
      <>
        <Steps steps={STEPS} current={0} />
        <AuthHeading eyebrow="Account activation" title="This link has expired">
          Invite links work once and last 7 days. Ask your firm admin to send a new one.
        </AuthHeading>
        <PrimaryButton type="button" onClick={() => setParams({})}>Try another link</PrimaryButton>
        <BackToLogin />
      </>
    );
  }
  if (done) {
    return (
      <>
        <Steps steps={STEPS} current={3} />
        <SuccessBurst title="You're all set">Taking you to your workspace…</SuccessBurst>
      </>
    );
  }

  const inv = invite.data!;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) return err.fail("Passwords do not match");
    setBusy(true);
    err.clear();
    try {
      const s = await api<Session>("/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, password, name }) });
      setSession(s.access_token, s.user);
      setDone(true);
    } catch (e) {
      err.fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Steps steps={STEPS} current={1} />
      <AuthHeading eyebrow={inv.firm_name ?? "Account activation"} title="Create your password">
        You've been invited as <span className="font-semibold capitalize text-ink-800">{inv.role_name}</span>.
      </AuthHeading>
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Firm" disabled value={inv.firm_name ?? "—"} icon={<Building2 className="size-4" />} />
          <Field label="Email" disabled value={inv.email} icon={<Mail className="size-4" />} />
        </div>
        <Field label="Full name" required value={name} onChange={(e) => setName(e.target.value)} icon={<UserIcon className="size-4" />} />
        <Field label="Password" type="password" autoComplete="new-password" required minLength={8} value={password}
          onChange={(e) => setPassword(e.target.value)} icon={<Lock className="size-4" />} hint={<PasswordStrength password={password} />} />
        <Field label="Confirm password" type="password" autoComplete="new-password" required value={confirm}
          onChange={(e) => setConfirm(e.target.value)} icon={<KeyRound className="size-4" />} />
        <FormError message={err.message} attempt={err.attempt} />
        <PrimaryButton type="submit" loading={busy}>Activate account</PrimaryButton>
      </form>
      <BackToLogin />
    </>
  );
}

export function RegisterPage() {
  const [params] = useSearchParams();
  const token = params.get("token");
  return <AuthShell>{token ? <AcceptInvite key={token} token={token} /> : <EnterInvite />}</AuthShell>;
}
