import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/services/api";
import type { Session, User } from "@/types";

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setUser: (u: User) => void;
  /** Called after setup / accept-invite: the server has already set the session cookie. */
  setSession: (u: User) => void;
}

const Ctx = createContext<AuthState>(null!);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // The session cookie is HttpOnly, so ask the server whether it is still valid.
    localStorage.removeItem("token"); // drop tokens left by the old localStorage-based login
    api<User>("/auth/me")
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api<Session>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    setUser(res.user);
  };

  const setSession = (u: User) => setUser(u);

  const logout = async () => {
    try {
      await api<void>("/auth/logout", { method: "POST" });
    } finally {
      setUser(null);
    }
  };

  return <Ctx.Provider value={{ user, loading, login, logout, setUser, setSession }}>{children}</Ctx.Provider>;
}
