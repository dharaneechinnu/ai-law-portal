import { useEffect } from "react";

/** App-wide commands that any component can trigger (palette, assistant, help). */
export type AppCommand = "palette" | "assistant" | "shortcuts" | "new-task" | "new-matter";

export const fire = (cmd: AppCommand) => window.dispatchEvent(new CustomEvent(`app:${cmd}`));

export function useCommand(cmd: AppCommand, handler: () => void) {
  useEffect(() => {
    window.addEventListener(`app:${cmd}`, handler);
    return () => window.removeEventListener(`app:${cmd}`, handler);
  }, [cmd, handler]);
}

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
export const MOD = isMac ? "⌘" : "Ctrl";

/** True while the user is typing somewhere, so single-key shortcuts stay out of the way. */
export const typing = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
};

/** "G then letter" jumps. Shown in the shortcuts sheet and the palette. */
export const GO_KEYS: Record<string, [string, string]> = {
  d: ["/", "Dashboard"],
  m: ["/matters", "Matters"],
  c: ["/clients", "Clients"],
  p: ["/people", "People"],
  t: ["/tasks", "Tasks"],
  k: ["/calendar", "Calendar"],
  l: ["/legal", "Legal Intelligence"],
  a: ["/approvals", "Approvals"],
  y: ["/analytics", "Analytics"],
  s: ["/settings", "Settings"],
  u: ["/account", "Account"],
};

/** Pages only admins can open (the server refuses the data behind them for everyone else). */
const ADMIN_PATHS = new Set(["/settings", "/admin/users"]);
export const canOpen = (path: string, role?: string) => role === "admin" || !ADMIN_PATHS.has(path);
export const goKeysFor = (role?: string) =>
  Object.fromEntries(Object.entries(GO_KEYS).filter(([, [to]]) => canOpen(to, role))) as typeof GO_KEYS;
