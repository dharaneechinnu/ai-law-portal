import { cn } from "@/lib/utils";
import { EmptySpot } from "@/components/brand/Spots";

/** Page title row used on every screen: serif title, one short line, actions on the right. */
export function PageHeader({ title, sub, icon: Icon, actions, className }: {
  title: React.ReactNode; sub?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-wrap items-end justify-between gap-4", className)}>
      <div className="flex min-w-0 items-center gap-3.5">
        {Icon && (
          <span className="grid size-11 shrink-0 animate-pop place-items-center rounded-2xl bg-gradient-to-br from-night-800 to-night-950 text-brass-300 shadow-lg shadow-night-950/20 ring-1 ring-snow/10">
            <Icon className="size-5" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate font-serif text-[1.9rem] leading-tight text-ink-900">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-ink-400">{sub}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Full-width navy cover at the top of a page: eyebrow, serif title, one line, actions, optional illustration. */
export function PageHero({ title, sub, eyebrow, icon: Icon, actions, art, children, className }: {
  title: React.ReactNode; sub?: React.ReactNode; eyebrow?: React.ReactNode; icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode; art?: React.ReactNode; children?: React.ReactNode; className?: string;
}) {
  return (
    <section className={cn("relative isolate flex animate-fade-up flex-wrap items-center justify-between gap-6 overflow-hidden rounded-3xl bg-gradient-to-br from-night-800 via-night-900 to-night-950 px-6 py-6 text-snow shadow-[0_24px_48px_rgba(7,13,32,0.16)] md:px-8", className)}>
      <span className="pointer-events-none absolute -left-24 -top-28 -z-10 size-72 animate-drift rounded-full bg-brass-300/15 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-32 right-1/4 -z-10 size-80 animate-drift rounded-full bg-night-500/40 blur-3xl" style={{ animationDelay: "-6s" }} />
      <div className="flex min-w-0 max-w-2xl items-start gap-4">
        {Icon && (
          <span className="grid size-12 shrink-0 animate-pop place-items-center rounded-2xl bg-gradient-to-br from-brass-300 to-brass-500 text-night-950 shadow-lg shadow-brass-500/25">
            <Icon className="size-[22px]" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">{eyebrow}</p>}
          <h1 className="font-serif text-3xl font-bold leading-tight">{title}</h1>
          {sub && <p className="mt-1.5 text-sm text-night-200 md:text-[15px]">{sub}</p>}
          {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
          {children}
        </div>
      </div>
      {art && <div className="hidden shrink-0 sm:block">{art}</div>}
    </section>
  );
}

/** Brass call-to-action used inside a PageHero. */
export const heroButton = "flex h-11 items-center gap-2 rounded-xl bg-gradient-to-br from-brass-300 to-brass-500 px-4 text-sm font-semibold text-night-950 shadow-lg shadow-brass-500/25 transition hover:-translate-y-0.5 hover:brightness-105 disabled:opacity-60";
/** Quiet button inside a PageHero. */
export const heroGhost = "flex h-11 items-center gap-2 rounded-xl bg-snow/10 px-4 text-sm font-medium text-snow ring-1 ring-snow/15 transition hover:bg-snow/15 disabled:opacity-60";

/** Pill tabs on the light page background. */
export function Tabs<T extends string>({ value, onChange, items, label }: {
  value: T; onChange: (v: T) => void; items: readonly (readonly [T, React.ReactNode])[]; label: string;
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex flex-wrap gap-1 self-start rounded-2xl border border-ink-100 bg-white p-1">
      {items.map(([k, text]) => (
        <button key={k} role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={cn("flex h-9 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all duration-200",
            value === k ? "bg-ink-900 text-snow shadow-sm dark:bg-brass-400 dark:text-night-950" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900")}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** Friendly empty state with a small illustration. */
export function EmptyState({ kind = "clear", title, hint, action, className }: {
  kind?: Parameters<typeof EmptySpot>[0]["kind"]; title: string; hint?: string; action?: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn("flex animate-fade-in flex-col items-center px-4 py-8 text-center", className)}>
      <EmptySpot kind={kind} />
      <p className="mt-2 text-sm font-medium text-ink-700">{title}</p>
      {hint && <p className="mt-0.5 max-w-xs text-xs text-ink-400">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/** Surface card. */
export function Panel({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-ink-100 bg-white shadow-[0_1px_2px_rgb(7_13_32/0.04)]", className)} {...rest}>{children}</div>;
}
