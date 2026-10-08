import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Lock, Mail } from "lucide-react";
import { Field } from "@/components/ui/field";
import { api } from "@/services/api";
import type { SetupStatus } from "@/types";
import { useAuth } from "./AuthContext";
import { AuthHeading, AuthShell, FormError, PrimaryButton } from "./AuthShell";
import { useFormError } from "./useFormError";

export function LoginPage() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const err = useFormError();
  const { data: setup } = useQuery({ queryKey: ["setup"], queryFn: () => api<SetupStatus>("/auth/setup") });

  useEffect(() => {
    if (setup?.needs_setup) nav("/setup", { replace: true });
  }, [setup, nav]);
  if (user) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    err.clear();
    try {
      await login(email, password);
      nav("/");
    } catch (e) {
      err.fail(String(e).includes("401") ? "Invalid email or password" : e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell>
      <AuthHeading eyebrow={setup?.firm_name ?? "Welcome back"} title="Sign in to your workspace">
        Use the email your firm admin registered for you.
      </AuthHeading>
      <form onSubmit={submit} className="space-y-5">
        <Field label="Work email" type="email" autoComplete="email" required autoFocus placeholder="you@firm.com"
          icon={<Mail className="size-4" />} value={email} onChange={(e) => setEmail(e.target.value)} />
        <Field label="Password" type="password" autoComplete="current-password" required placeholder="••••••••"
          icon={<Lock className="size-4" />} value={password} onChange={(e) => setPassword(e.target.value)} />
        <FormError message={err.message} attempt={err.attempt} />
        <PrimaryButton type="submit" loading={busy}>
          Sign in {!busy && <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </PrimaryButton>
      </form>

      <div className="my-8 flex items-center gap-3 text-xs text-ink-300">
        <span className="h-px flex-1 bg-ink-100" />NEW TO THE FIRM?<span className="h-px flex-1 bg-ink-100" />
      </div>
      <Link to="/register"
        className="flex items-center justify-between rounded-xl border border-ink-100 bg-white px-4 py-3 text-sm shadow-sm transition hover:-translate-y-0.5 hover:border-brass-300 hover:shadow-md">
        <span>
          <span className="block font-medium text-ink-900">Activate your account</span>
          <span className="block text-xs text-ink-400">Have an invite link from your admin? Set your password here.</span>
        </span>
        <ArrowRight className="size-4 text-brass-600" />
      </Link>
      <p className="mt-6 text-center text-xs text-ink-400">Forgot your password? Ask your firm admin for a new access link.</p>
    </AuthShell>
  );
}
