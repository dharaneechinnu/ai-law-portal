import { Scale } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ dark = false, compact = false, className }: { dark?: boolean; compact?: boolean; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brass-300 to-brass-600 text-night-950 shadow-lg shadow-brass-500/20">
        <Scale className="size-5" strokeWidth={2.2} />
      </span>
      {!compact && (
        <span className={cn("whitespace-nowrap font-serif text-lg font-bold tracking-tight", dark ? "text-snow" : "text-ink-900")}>
          Lex<span className="text-brass-500">AI</span> Portal
        </span>
      )}
    </div>
  );
}
