import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/** Right-hand slide-over panel with a dimmed backdrop. Portalled so page transitions can't offset it. */
export function Drawer({ title, onClose, children, footer }: {
  title: string; onClose: () => void; children: ReactNode; footer?: ReactNode;
}) {
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 animate-fade-in bg-ink-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <aside role="dialog" aria-label={title} className="relative flex h-full w-full max-w-md animate-slide-in flex-col bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-ink-50 px-5 py-4">
          <h2 className="text-sm font-semibold text-ink-700">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-300 hover:bg-ink-50 hover:text-ink-600">
            <X className="size-4" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="flex items-center gap-2 border-t border-ink-50 px-5 py-4">{footer}</footer>}
      </aside>
    </div>,
    document.body,
  );
}

export const control =
  "h-9 w-full rounded-lg border border-ink-100 bg-white px-2.5 text-sm text-ink-800 outline-none transition focus:border-brass-400 focus:ring-4 focus:ring-brass-300/25";

export function Label({ text, children, className }: { text: string; children: ReactNode; className?: string }) {
  return <label className={`block space-y-1 text-xs text-ink-400 ${className ?? ""}`}>{text}{children}</label>;
}
