import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { FileSearch, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { LegalIllustration } from "@/components/brand/LegalIllustration";
import { Logo } from "@/components/brand/Logo";
import { cn } from "@/lib/utils";

const FEATURES = [
  { icon: FileSearch, title: "Cited answers from your case files", text: "Ask about any matter. Every answer points to the document and page." },
  { icon: Sparkles, title: "Judgments that matter, surfaced", text: "New eCourts orders matched to open matters, with the reasons shown." },
  { icon: ShieldCheck, title: "AI under your firm's control", text: "Server-side policies and human approval for every sensitive action." },
];

function FeatureCarousel() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActive((a) => (a + 1) % FEATURES.length), 4500);
    return () => clearInterval(t);
  }, [active]);
  const { icon: Icon, title, text } = FEATURES[active]!;
  return (
    <div>
      <div key={active} className="relative flex animate-fade-up gap-4 overflow-hidden rounded-2xl border border-brass-400/30 bg-white/[0.06] p-4 backdrop-blur">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brass-400 text-ink-950"><Icon className="size-5" /></span>
        <span>
          <span className="block font-semibold text-white">{title}</span>
          <span className="block text-sm text-ink-200/80">{text}</span>
        </span>
        <span className="absolute bottom-0 left-0 h-0.5 bg-brass-400" style={{ animation: "progress 4.5s linear both" }} />
      </div>
      <div className="mt-4 flex gap-2">
        {FEATURES.map((f, i) => (
          <button key={f.title} type="button" onClick={() => setActive(i)} aria-label={f.title}
            className={cn("h-1.5 rounded-full transition-all duration-500", i === active ? "w-8 bg-brass-400" : "w-3 bg-white/20 hover:bg-white/40")} />
        ))}
      </div>
      <style>{"@keyframes progress { from { width: 0 } to { width: 100% } }"}</style>
    </div>
  );
}

/** Full-height split layout for sign-in, invite registration and first-run setup. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.15fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink-950 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        {/* ambient light */}
        <div className="pointer-events-none absolute -left-32 -top-32 size-[28rem] rounded-full bg-ink-600/40 blur-3xl animate-drift" />
        <div className="pointer-events-none absolute -bottom-40 right-0 size-[26rem] rounded-full bg-brass-500/20 blur-3xl animate-drift"
          style={{ animationDelay: "-6s" }} />
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: "linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)", backgroundSize: "44px 44px" }} />

        <div className="relative z-10 flex min-h-0 flex-1 flex-col px-12 py-10 xl:px-16">
          <Logo dark />
          <div className="flex min-h-0 flex-1 items-center justify-center py-4">
            <LegalIllustration className="h-full max-h-[440px] w-full max-w-xl drop-shadow-2xl" />
          </div>
          <h2 className="max-w-lg font-serif text-3xl font-bold leading-tight text-white xl:text-4xl">
            Matter intelligence for <span className="text-brass-300">modern law firms</span>.
          </h2>
          <p className="mt-3 max-w-lg text-ink-200/80">Cases, documents and court developments in one place, with AI that cites its sources.</p>
          <div className="mt-6 max-w-xl"><FeatureCarousel /></div>
        </div>
      </aside>

      <main className="relative flex flex-col bg-gradient-to-b from-white to-ink-50/60">
        {/* compact illustrated header on small screens */}
        <div className="relative overflow-hidden bg-ink-950 px-6 pb-2 pt-6 lg:hidden">
          <div className="pointer-events-none absolute -right-16 -top-16 size-60 rounded-full bg-brass-500/25 blur-3xl animate-drift" />
          <Logo dark className="relative" />
          <LegalIllustration className="relative mx-auto -mb-2 mt-2 h-44 w-auto" />
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-md animate-fade-up">{children}</div>
        </div>
        <p className="px-6 pb-6 text-center text-xs text-ink-400">
          AI output is analysis to support lawyers, not legal advice.
        </p>
      </main>
    </div>
  );
}

export function AuthHeading({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-8">
      {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brass-600">{eyebrow}</div>}
      <h1 className="font-serif text-3xl font-bold text-ink-900">{title}</h1>
      {children && <p className="mt-2 text-sm text-ink-500">{children}</p>}
    </div>
  );
}

export function PrimaryButton({ loading, children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      className={cn(
        "group relative inline-flex h-11 w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-ink-900 px-5",
        "text-sm font-semibold text-white shadow-lg shadow-ink-900/20 transition hover:bg-ink-800 active:scale-[0.99]",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brass-300/40 disabled:cursor-not-allowed disabled:opacity-60",
        className,
      )}
    >
      {/* sheen on hover */}
      <span className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/15 opacity-0 transition-all duration-700 group-hover:left-[120%] group-hover:opacity-100" />
      {loading && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

/** `attempt` increments on each failed submit so the shake replays only then. */
export function FormError({ message, attempt }: { message: string; attempt: number }) {
  if (!message) return null;
  return (
    <div key={attempt} role="alert"
      className="animate-shake rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700">
      {message}
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-8 flex items-center gap-2">
      {steps.map((s, i) => (
        <li key={s} className="flex flex-1 items-center gap-2">
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors duration-300",
            i < current ? "bg-brass-500 text-white" : i === current ? "bg-ink-900 text-white ring-4 ring-ink-100" : "bg-ink-100 text-ink-400")}>
            {i < current ? "✓" : i + 1}
          </span>
          <span className={cn("hidden text-xs font-medium sm:block", i <= current ? "text-ink-800" : "text-ink-400")}>{s}</span>
          {i < steps.length - 1 && (
            <span className="h-px flex-1 bg-ink-100">
              <span className="block h-px bg-brass-500 transition-all duration-500" style={{ width: i < current ? "100%" : "0%" }} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function SuccessBurst({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="text-center">
      <div className="mx-auto mb-6 grid size-20 animate-pop place-items-center rounded-full bg-gradient-to-br from-brass-300 to-brass-600 shadow-xl shadow-brass-500/30">
        <svg viewBox="0 0 24 24" className="size-10 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" strokeDasharray="60" className="animate-draw" style={{ animationDelay: "0.25s" }} />
        </svg>
      </div>
      <h1 className="font-serif text-3xl font-bold text-ink-900">{title}</h1>
      {children && <div className="mt-2 text-sm text-ink-500">{children}</div>}
    </div>
  );
}
