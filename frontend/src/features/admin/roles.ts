export const ROLES = [
  { id: "admin", label: "Admin", desc: "Manages users, AI providers and firm settings", tone: "bg-brass-100 text-brass-700 ring-brass-300/60", avatar: "from-brass-300 to-brass-600" },
  { id: "partner", label: "Partner", desc: "Senior lawyer; oversees matters and approvals", tone: "bg-ink-100 text-ink-700 ring-ink-200", avatar: "from-ink-500 to-ink-800" },
  { id: "lawyer", label: "Lawyer", desc: "Runs matters, documents and research", tone: "bg-sky-50 text-sky-700 ring-sky-200", avatar: "from-sky-400 to-sky-700" },
  { id: "associate", label: "Associate", desc: "Works on assigned matters", tone: "bg-violet-50 text-violet-700 ring-violet-200", avatar: "from-violet-400 to-violet-700" },
  { id: "paralegal", label: "Paralegal", desc: "Supports filings, documents and scheduling", tone: "bg-teal-50 text-teal-700 ring-teal-200", avatar: "from-teal-400 to-teal-700" },
] as const;

export const roleMeta = (id: string) => ROLES.find((r) => r.id === id) ?? ROLES[2];

export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("") || "?";
}

export function relativeTime(iso?: string | null) {
  if (!iso) return "Never";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "Just now";
  const units: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [2592000, "month"]];
  for (let i = units.length - 1; i >= 0; i--) {
    const [secs, label] = units[i]!;
    if (diff >= secs) {
      const n = Math.floor(diff / secs);
      return `${n} ${label}${n > 1 ? "s" : ""} ago`;
    }
  }
  return "Just now";
}

export const inviteUrl = (token: string) => `${window.location.origin}/register?token=${encodeURIComponent(token)}`;
