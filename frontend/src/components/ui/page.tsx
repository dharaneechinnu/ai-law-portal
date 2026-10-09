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
