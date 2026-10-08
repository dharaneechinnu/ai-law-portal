import { useState } from "react";
import { AgentSettings } from "@/features/ai/AgentSettings";
import { AuditLog } from "@/features/ai/AuditLog";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";
import { AISettingsPage } from "./AISettingsPage";
import { LegalSettings } from "./LegalSettings";

const TABS = [["ai", "AI providers"], ["legal", "Legal data"], ["agents", "AI agents"], ["audit", "Audit log"]] as const;
const ADMIN_TABS = new Set<string>(["agents", "audit"]);
type Tab = (typeof TABS)[number][0];

export function SettingsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("ai");
  const tabs = TABS.filter(([k]) => !ADMIN_TABS.has(k) || user?.role_name === "admin");
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-4 animate-fade-up font-serif text-3xl text-ink-900">Settings</h1>
      <div className="mb-6 flex gap-1 border-b border-ink-100">
        {tabs.map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={cn("relative px-4 py-2.5 text-sm transition-colors", tab === k ? "font-medium text-ink-900" : "text-ink-400 hover:text-ink-700")}>
            {label}
            <span className={cn("absolute inset-x-2 -bottom-px h-0.5 origin-center rounded-full bg-brass-500 transition-transform duration-300", tab === k ? "scale-x-100" : "scale-x-0")} />
          </button>
        ))}
      </div>
      <div key={tab} className="animate-fade-up">
        {tab === "ai" && <AISettingsPage />}
        {tab === "legal" && <LegalSettings />}
        {tab === "agents" && <AgentSettings />}
        {tab === "audit" && <AuditLog />}
      </div>
    </div>
  );
}
