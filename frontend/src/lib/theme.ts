import { useCallback, useEffect, useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
const KEY = "lex-theme";
const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

const systemDark = () => window.matchMedia("(prefers-color-scheme: dark)").matches;
export const resolve = (c: ThemeChoice) => (c === "system" ? (systemDark() ? "dark" : "light") : c);

function apply(c: ThemeChoice) {
  document.documentElement.classList.toggle("dark", resolve(c) === "dark");
}

/** Change theme. With a point (the toggle's centre) the new theme grows out of it as a circle. */
function set(c: ThemeChoice, from?: { x: number; y: number }) {
  try { localStorage.setItem(KEY, c); } catch { /* theme still applies for this visit */ }
  const run = () => { apply(c); listeners.forEach((l) => l()); };
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!doc.startViewTransition || calm) return run();
  const p = from ?? { x: innerWidth / 2, y: 0 };
  const s = document.documentElement.style;
  s.setProperty("--reveal-x", `${p.x}px`);
  s.setProperty("--reveal-y", `${p.y}px`);
  s.setProperty("--reveal-r", `${Math.hypot(Math.max(p.x, innerWidth - p.x), Math.max(p.y, innerHeight - p.y))}px`);
  doc.startViewTransition(run);
}

const subscribe = (l: () => void) => { listeners.add(l); return () => listeners.delete(l); };

/** Theme for the signed-in app. Mount once (in Layout); leaving the app removes dark mode. */
export function useTheme() {
  const choice = useSyncExternalStore(subscribe, read);
  const resolved = resolve(choice);

  useEffect(() => {
    apply(choice);
    if (choice !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const on = () => { apply("system"); listeners.forEach((l) => l()); };
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [choice]);

  const toggle = useCallback((from?: { x: number; y: number }) => set(resolved === "dark" ? "light" : "dark", from), [resolved]);
  return { choice, resolved, set, toggle };
}

/** Remove dark mode when the app shell unmounts (sign-out). */
export function clearTheme() {
  document.documentElement.classList.remove("dark");
}
