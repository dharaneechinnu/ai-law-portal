// Single place for backend access. The browser never holds provider secrets.
// Auth rides on the backend's HttpOnly session cookie; JavaScript never sees the token.
const BASE = import.meta.env.VITE_API_URL ?? "";

/** fetch() against the API with the session cookie attached. Use for bodies api() can't send (FormData). */
export function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${BASE}/api${path}`, { credentials: "include", ...init });
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.status === 204 ? (undefined as T) : res.json();
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
