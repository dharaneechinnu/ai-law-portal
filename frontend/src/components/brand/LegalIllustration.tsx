import { useId } from "react";

/** Four-point "AI" sparkle. */
function Sparkle({ x, y, s = 1, delay = 0, color = "#f0dcaa" }: { x: number; y: number; s?: number; delay?: number; color?: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        d="M0 -10 C1.5 -2 2 -1.5 10 0 C2 1.5 1.5 2 0 10 C-1.5 2 -2 1.5 -10 0 C-2 -1.5 -1.5 -2 0 -10Z"
        fill={color}
        className="animate-twinkle svg-origin-center"
        style={{ animationDelay: `${delay}s` }}
      />
    </g>
  );
}

function DocLines({ x, y, w, rows, highlight }: { x: number; y: number; w: number; rows: number; highlight?: number }) {
  return (
    <>
      {Array.from({ length: rows }, (_, i) => (
        <rect key={i} x={x} y={y + i * 14} width={i === rows - 1 ? w * 0.6 : w - (i % 3) * 10} height={5} rx={2.5}
          fill={i === highlight ? "#d9b157" : "#c5cde6"} opacity={i === highlight ? 0.9 : 0.7} />
      ))}
    </>
  );
}

/**
 * Animated hero illustration: the scales of justice balancing a case file against AI insight,
 * with documents being read and cited. Pure SVG + CSS, no external assets.
 */
export function LegalIllustration({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  const brass = `brass-${id}`, glow = `glow-${id}`, card = `card-${id}`, clip = `clip-${id}`;
  return (
    <svg viewBox="0 0 520 440" className={className} role="img" aria-label="Scales of justice balancing documents and AI insight">
      <defs>
        <linearGradient id={brass} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f0dcaa" />
          <stop offset="0.5" stopColor="#d9b157" />
          <stop offset="1" stopColor="#a57c2b" />
        </linearGradient>
        <radialGradient id={glow}>
          <stop offset="0" stopColor="#d9b157" stopOpacity="0.35" />
          <stop offset="1" stopColor="#d9b157" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={card} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="1" stopColor="#eef1f9" />
        </linearGradient>
        <clipPath id={clip}><rect x="40" y="60" width="122" height="152" rx="12" /></clipPath>
      </defs>

      {/* orbit rings */}
      <circle cx="260" cy="220" r="196" fill="none" stroke="#3f5494" strokeOpacity="0.45" strokeDasharray="2 10"
        className="animate-spin-slow svg-origin-center" />
      <circle cx="260" cy="220" r="140" fill="none" stroke="#ffffff" strokeOpacity="0.08" />
      <circle cx="260" cy="220" r="150" fill={`url(#${glow})`} />

      {/* data flow from documents into the scales */}
      <path d="M162 140 C210 120 220 108 252 112" fill="none" stroke="#d9b157" strokeWidth="2" strokeDasharray="4 8" className="animate-dash" />
      <path d="M372 296 C330 300 300 270 272 250" fill="none" stroke="#d9b157" strokeWidth="2" strokeDasharray="4 8" className="animate-dash" />

      {/* scales of justice */}
      <g>
        <path d="M200 352 L320 352 L304 330 L216 330 Z" fill={`url(#${brass})`} />
        <rect x="196" y="350" width="128" height="8" rx="4" fill="#a57c2b" />
        <rect x="255" y="122" width="10" height="210" rx="5" fill={`url(#${brass})`} />
        <circle cx="260" cy="112" r="11" fill={`url(#${brass})`} />
        <g className="animate-sway svg-origin-top">
          <rect x="125" y="126" width="270" height="7" rx="3.5" fill={`url(#${brass})`} />
          {/* left pan: the case file */}
          <path d="M160 132 L128 214 M160 132 L192 214" stroke="#d9b157" strokeWidth="1.5" />
          <path d="M120 214 Q160 246 200 214 Z" fill={`url(#${brass})`} />
          <rect x="146" y="190" width="28" height="24" rx="3" fill="#fff" />
          <rect x="151" y="196" width="18" height="3" rx="1.5" fill="#97a5cf" />
          <rect x="151" y="203" width="12" height="3" rx="1.5" fill="#97a5cf" />
          {/* right pan: AI insight */}
          <path d="M360 132 L328 214 M360 132 L392 214" stroke="#d9b157" strokeWidth="1.5" />
          <path d="M320 214 Q360 246 400 214 Z" fill={`url(#${brass})`} />
          <Sparkle x={360} y={200} s={1.1} color="#ffffff" />
        </g>
      </g>

      {/* document being read by AI (scanning highlight) */}
      <g className="animate-float" style={{ animationDelay: "-2s" }}>
        <rect x="40" y="60" width="122" height="152" rx="12" fill={`url(#${card})`} />
        <rect x="56" y="76" width="40" height="8" rx="4" fill="#1f2f63" />
        <DocLines x={56} y={98} w={90} rows={7} highlight={3} />
        <g clipPath={`url(#${clip})`}>
          <rect x="40" y="92" width="122" height="22" fill="#d9b157" opacity="0.18" className="animate-scan" />
        </g>
      </g>

      {/* cited source card */}
      <g className="animate-float-slow">
        <rect x="372" y="236" width="112" height="132" rx="12" fill={`url(#${card})`} />
        <DocLines x={388} y={256} w={80} rows={5} />
        <circle cx="458" cy="350" r="15" fill="#1f2f63" />
        <path d="M451 350 l5 5 l9 -10" fill="none" stroke="#d9b157" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
          strokeDasharray="60" className="animate-draw" />
      </g>

      {/* AI answer bubble */}
      <g className="animate-float" style={{ animationDelay: "-4s" }}>
        <rect x="350" y="52" width="128" height="62" rx="14" fill="#15224b" stroke="#3f5494" />
        <path d="M372 114 l-8 14 l20 -14 Z" fill="#15224b" />
        <rect x="366" y="68" width="70" height="6" rx="3" fill="#97a5cf" />
        <rect x="366" y="82" width="92" height="6" rx="3" fill="#97a5cf" opacity="0.7" />
        <rect x="366" y="96" width="24" height="7" rx="3.5" fill="#d9b157" />
        <rect x="394" y="96" width="24" height="7" rx="3.5" fill="#d9b157" opacity="0.6" />
      </g>

      <Sparkle x={86} y={262} s={0.9} delay={0.4} />
      <Sparkle x={460} y={176} s={0.7} delay={1.1} />
      <Sparkle x={214} y={64} s={0.6} delay={1.7} />
      <Sparkle x={300} y={402} s={0.8} delay={0.9} />
      <Sparkle x={58} y={378} s={0.5} delay={2.1} />
    </svg>
  );
}
