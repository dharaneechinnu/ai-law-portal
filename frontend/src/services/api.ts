// Single place for backend access. The browser never holds provider secrets.
const BASE = import.meta.env.VITE_API_URL ?? "";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

/** Human-readable message from an api() error (FastAPI `detail` string or validation list). */
export function errorMessage(e: unknown): string {
  const raw = String(e instanceof Error ? e.message : e).replace(/^\d{3} /, "");
  try {
    const { detail } = JSON.parse(raw);
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg).replace(/^Value error, /, "");
  } catch {
    /* not JSON */
  }
  return raw || "Something went wrong";
}
