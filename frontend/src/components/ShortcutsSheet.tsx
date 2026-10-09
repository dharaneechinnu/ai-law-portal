import { useCallback, useEffect, useState } from "react";
import { Keyboard, X } from "lucide-react";
import { GO_KEYS, MOD, useCommand } from "@/lib/shortcuts";

const GENERAL: [string[], string][] = [
  [[MOD, "K"], "Search and commands"],
  [[MOD, "J"], "Open or close the assistant"],
  [["Shift", "D"], "Switch light / dark"],
  [["?"], "This list"],
  [["Esc"], "Close a panel"],
];

/** "?" opens the list of shortcuts. */
export function ShortcutsSheet() {
  const [open, setOpen] = useState(false);
  useCommand("shortcuts", useCallback(() => setOpen((o) => !o), []));
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open]);
  if (!open) return null;

  const Row = ({ keys, label }: { keys: string[]; label: string }) => (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-ink-600">{label}</span>
      <span className="flex items-center gap-1">{keys.map((k, i) => (
        <span key={i} className="flex items-center gap-1">{i > 0 && keys[0] === "G" && <span className="text-[10px] text-ink-300">then</span>}<kbd>{k}</kbd></span>
      ))}</span>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] grid place-items-center px-4" onMouseDown={() => setOpen(false)}>
      <div className="absolute inset-0 animate-fade-in bg-night-950/40 backdrop-blur-sm" />
      <div role="dialog" aria-label="Keyboard shortcuts" onMouseDown={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl animate-palette rounded-2xl border border-ink-100 bg-white p-6 shadow-2xl">
        <header className="mb-4 flex items-center gap-2">
          <Keyboard className="size-5 text-brass-600" />
          <h2 className="flex-1 font-serif text-xl text-ink-900">Keyboard shortcuts</h2>
          <button onClick={() => setOpen(false)} aria-label="Close" className="grid size-8 place-items-center rounded-lg text-ink-400 hover:bg-ink-50 hover:text-ink-700">
            <X className="size-4" />
          </button>
        </header>
        <div className="grid gap-x-10 sm:grid-cols-2">
          <section>
            <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">General</h3>
            {GENERAL.map(([k, l]) => <Row key={l} keys={k} label={l} />)}
          </section>
          <section>
            <h3 className="mb-1 mt-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400 sm:mt-0">Go to</h3>
            {Object.entries(GO_KEYS).map(([k, [, l]]) => <Row key={k} keys={["G", k.toUpperCase()]} label={l} />)}
          </section>
        </div>
      </div>
    </div>
  );
}
