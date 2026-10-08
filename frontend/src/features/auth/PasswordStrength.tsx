import { cn } from "@/lib/utils";

const LABELS = ["Too short", "Weak", "Fair", "Good", "Strong"];
const COLORS = ["bg-red-400", "bg-red-400", "bg-amber-400", "bg-emerald-400", "bg-emerald-500"];

export function passwordScore(p: string): number {
  if (p.length < 8) return 0;
  let s = 1;
  if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}

export function PasswordStrength({ password }: { password: string }) {
  if (!password) return <span>At least 8 characters.</span>;
  const score = passwordScore(password);
  return (
    <div className="flex items-center gap-3">
      <div className="flex flex-1 gap-1">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i <= score ? COLORS[score] : "bg-ink-100")} />
        ))}
      </div>
      <span className="w-16 text-right">{LABELS[score]}</span>
    </div>
  );
}
