import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import { cn } from "@/lib/utils";

export function useCountUp(target: number, ms = 700) {
  const [n, setN] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now(), base = from.current;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      setN(Math.round(base + (target - base) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      /* clipboard blocked: the text stays selectable */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };
  return (
    <div className="flex items-center gap-2 rounded-xl border border-ink-100 bg-ink-50 p-1.5 pl-3">
      <input readOnly value={value} onFocus={(e) => e.target.select()} className="min-w-0 flex-1 bg-transparent text-xs text-ink-700 outline-none" />
      <button type="button" onClick={copy}
        className={cn("inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition",
          copied ? "bg-emerald-500 text-white" : "bg-ink-900 text-white hover:bg-ink-800")}>
        {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Modal({ open, onClose, children, side = false, title }: {
  open: boolean; onClose: () => void; children: ReactNode; side?: boolean; title: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 animate-fade-in bg-ink-950/50 backdrop-blur-sm" onClick={onClose} />
      <div className={cn(
        "absolute bg-white shadow-2xl",
        side ? "inset-y-0 right-0 flex w-full max-w-lg animate-slide-in flex-col" : "left-1/2 top-1/2 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl",
      )}>
        <div className={cn("flex items-center justify-between border-b border-ink-100 px-6 py-4", !side && "rounded-t-2xl")}>
          <h2 className="font-serif text-lg font-bold text-ink-900">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700">
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("p-6", side && "flex-1 overflow-y-auto")}>{children}</div>
      </div>
    </div>,
    document.body,
  );
}

type Toast = { id: number; text: string; tone: "ok" | "err" };

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = (text: string, tone: Toast["tone"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  };
  const view = (
    <div className="pointer-events-none fixed bottom-6 right-6 z-[60] flex flex-col gap-2">
      {toasts.map((t) => (
        <div key={t.id} role="status"
          className={cn("animate-fade-up rounded-xl px-4 py-3 text-sm font-medium shadow-xl",
            t.tone === "ok" ? "bg-ink-900 text-white" : "bg-red-600 text-white")}>
          {t.text}
        </div>
      ))}
    </div>
  );
  return { push, view };
}
