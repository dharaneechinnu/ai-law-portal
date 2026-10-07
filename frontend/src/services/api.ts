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
