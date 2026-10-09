/**
 * Small animated spot illustrations for headers and empty states. Pure SVG; colours come from theme
 * tokens through Tailwind fill/stroke classes, so they follow light and dark mode.
 */
import { cn } from "@/lib/utils";

function Sparkle({ x, y, s = 1, d = 0 }: { x: number; y: number; s?: number; d?: number }) {
  return (
    <path transform={`translate(${x} ${y}) scale(${s})`} className="svg-origin-center animate-twinkle fill-brass-400"
      style={{ animationDelay: `${d}s` }}
      d="M0 -8 C1.2 -1.6 1.6 -1.2 8 0 C1.6 1.2 1.2 1.6 0 8 C-1.2 1.6 -1.6 1.2 -8 0 C-1.6 -1.2 -1.2 -1.6 0 -8Z" />
  );
}

/** Dashboard hero: a desk calendar, a case file and the scales, with sparkles. */
export function DeskSpot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 260 180" className={className} aria-hidden="true">
      <ellipse cx="135" cy="166" rx="110" ry="9" className="fill-night-950/30" />
      {/* calendar */}
      <g className="animate-float-slow" style={{ animationDelay: "-2s" }}>
        <rect x="24" y="52" width="86" height="92" rx="12" className="fill-snow" />
        <rect x="24" y="52" width="86" height="26" rx="12" className="fill-brass-400" />
        <rect x="24" y="66" width="86" height="12" className="fill-brass-400" />
        <rect x="42" y="44" width="6" height="18" rx="3" className="fill-night-700" />
        <rect x="86" y="44" width="6" height="18" rx="3" className="fill-night-700" />
        {[0, 1, 2].map((r) => [0, 1, 2, 3].map((c) => (
          <rect key={`${r}${c}`} x={36 + c * 17} y={88 + r * 16} width="11" height="9" rx="2.5"
            className={r === 1 && c === 2 ? "fill-brass-500" : "fill-night-200"} />
        )))}
      </g>
      {/* case file */}
      <g className="animate-float" style={{ animationDelay: "-1s" }}>
        <path d="M128 40 h40 l10 10 h44 a8 8 0 0 1 8 8 v80 a8 8 0 0 1 -8 8 h-94 a8 8 0 0 1 -8 -8 v-90 a8 8 0 0 1 8 -8z" className="fill-night-600" />
        <rect x="128" y="60" width="102" height="86" rx="8" className="fill-night-500" />
        <rect x="142" y="78" width="60" height="5" rx="2.5" className="fill-night-200" />
        <rect x="142" y="92" width="74" height="5" rx="2.5" className="fill-night-300" />
        <rect x="142" y="106" width="48" height="5" rx="2.5" className="fill-brass-300" />
        <rect x="142" y="120" width="66" height="5" rx="2.5" className="fill-night-300" />
      </g>
      {/* scales */}
      <g className="animate-sway svg-origin-top" style={{ transformOrigin: "200px 18px" }}>
        <line x1="176" y1="22" x2="224" y2="22" strokeWidth="3" strokeLinecap="round" className="stroke-brass-300" />
        <line x1="180" y1="22" x2="174" y2="40" strokeWidth="1.5" className="stroke-brass-300" />
        <line x1="180" y1="22" x2="186" y2="40" strokeWidth="1.5" className="stroke-brass-300" />
        <line x1="220" y1="22" x2="214" y2="40" strokeWidth="1.5" className="stroke-brass-300" />
        <line x1="220" y1="22" x2="226" y2="40" strokeWidth="1.5" className="stroke-brass-300" />
        <path d="M170 40 h20 a10 6 0 0 1 -20 0z" className="fill-brass-400" />
        <path d="M210 40 h20 a10 6 0 0 1 -20 0z" className="fill-brass-400" />
      </g>
      <circle cx="200" cy="18" r="4" className="fill-brass-300" />
      <Sparkle x={240} y={70} s={0.9} />
      <Sparkle x={14} y={36} s={0.7} d={0.8} />
      <Sparkle x={120} y={22} s={0.55} d={1.4} />
    </svg>
  );
}

/** Empty states. `kind` picks the picture. */
export function EmptySpot({ kind = "clear", className }: { kind?: "clear" | "search" | "docs" | "calendar" | "people" | "inbox"; className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={cn("size-28", className)} aria-hidden="true">
      <ellipse cx="60" cy="88" rx="38" ry="5" className="fill-ink-100" />
      <circle cx="60" cy="46" r="34" className="fill-ink-50" />
      <g className="animate-float-slow">
        {kind === "clear" && (
          <>
            <circle cx="60" cy="46" r="20" className="fill-emerald-50 stroke-emerald-600" strokeWidth="2.5" />
            <path d="M51 46 l6 6 l12 -13" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"
              strokeDasharray="60" className="animate-draw stroke-emerald-600" />
          </>
        )}
        {kind === "search" && (
          <>
            <circle cx="55" cy="42" r="15" fill="none" strokeWidth="4" className="stroke-ink-300" />
            <line x1="66" y1="53" x2="78" y2="65" strokeWidth="5" strokeLinecap="round" className="stroke-brass-400" />
          </>
        )}
        {kind === "docs" && (
          <>
            <rect x="40" y="22" width="34" height="44" rx="5" className="fill-ink-200" transform="rotate(-8 57 44)" />
            <rect x="46" y="24" width="34" height="44" rx="5" className="fill-white stroke-ink-200" strokeWidth="1.5" />
            <rect x="52" y="34" width="20" height="3" rx="1.5" className="fill-ink-300" />
            <rect x="52" y="42" width="22" height="3" rx="1.5" className="fill-ink-200" />
            <rect x="52" y="50" width="14" height="3" rx="1.5" className="fill-brass-400" />
          </>
        )}
        {kind === "calendar" && (
          <>
            <rect x="38" y="24" width="44" height="42" rx="7" className="fill-white stroke-ink-200" strokeWidth="1.5" />
            <rect x="38" y="24" width="44" height="12" rx="6" className="fill-brass-400" />
            {[0, 1, 2].map((c) => <rect key={c} x={45 + c * 11} y={43} width="7" height="6" rx="1.5" className="fill-ink-200" />)}
            {[0, 1, 2].map((c) => <rect key={c} x={45 + c * 11} y={53} width="7" height="6" rx="1.5" className={c === 1 ? "fill-brass-400" : "fill-ink-200"} />)}
          </>
        )}
        {kind === "people" && (
          <>
            <circle cx="48" cy="38" r="9" className="fill-ink-300" />
            <path d="M32 66 a16 14 0 0 1 32 0z" className="fill-ink-300" />
            <circle cx="72" cy="36" r="10" className="fill-brass-400" />
            <path d="M54 66 a18 16 0 0 1 36 0z" className="fill-brass-400" />
          </>
        )}
        {kind === "inbox" && (
          <>
            <path d="M34 48 l8 -20 h36 l8 20 v16 a4 4 0 0 1 -4 4 h-44 a4 4 0 0 1 -4 -4z" className="fill-white stroke-ink-200" strokeWidth="1.5" />
            <path d="M34 48 h16 a10 8 0 0 0 20 0 h16" fill="none" strokeWidth="1.5" className="stroke-ink-300" />
          </>
        )}
      </g>
      <Sparkle x={96} y={20} s={0.6} />
      <Sparkle x={22} y={30} s={0.45} d={1} />
    </svg>
  );
}

/** Approvals hero: a stamp pressing a signed document. */
export function StampSpot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 220 160" className={className} aria-hidden="true">
      <ellipse cx="110" cy="150" rx="86" ry="7" className="fill-night-950/30" />
      <g className="animate-float-slow">
        <rect x="40" y="46" width="120" height="96" rx="10" className="fill-snow" />
        <rect x="56" y="64" width="64" height="5" rx="2.5" className="fill-night-200" />
        <rect x="56" y="78" width="88" height="5" rx="2.5" className="fill-night-200" />
        <rect x="56" y="92" width="52" height="5" rx="2.5" className="fill-night-200" />
        <circle cx="128" cy="116" r="15" fill="none" strokeWidth="3" className="stroke-emerald-600" />
        <path d="M121 116 l5 5 l9 -10" fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="60" className="animate-draw stroke-emerald-600" />
      </g>
      <g className="animate-[stamp_2.8s_ease-in-out_infinite]">
        <rect x="150" y="8" width="18" height="30" rx="7" className="fill-brass-400" />
        <rect x="138" y="36" width="42" height="12" rx="4" className="fill-night-600" />
        <rect x="134" y="48" width="50" height="7" rx="3" className="fill-brass-500" />
      </g>
      <Sparkle x={26} y={40} s={0.7} />
      <Sparkle x={200} y={92} s={0.6} d={1} />
    </svg>
  );
}
