import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Bot, Cpu, Gavel, Mail, ScrollText, Settings } from "lucide-react";
import { PageHero } from "@/components/ui/page";
import { AgentSettings } from "@/features/ai/AgentSettings";
import { AuditLog } from "@/features/ai/AuditLog";
import { useAuth } from "@/features/auth/AuthContext";
import { cn } from "@/lib/utils";
import { AISettingsPage } from "./AISettingsPage";
import { LegalSettings } from "./LegalSettings";
import { EmailSettings } from "./EmailSettings";
import { FirmSettings } from "./FirmSettings";
import { ModelRoutes } from "./ModelRoutes";

const TABS = [
  ["ai", "AI providers", Cpu], ["legal", "Legal data", Gavel], ["agents", "AI agents", Bot],
  ["notify", "Notifications", Bell], ["email", "Email", Mail], ["audit", "Audit log", ScrollText],
] as const;
const ADMIN_TABS = new Set<string>(["agents", "notify", "email", "audit"]);
type Tab = (typeof TABS)[number][0];

export function SettingsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = TABS.filter(([k]) => !ADMIN_TABS.has(k) || user?.role_name === "admin");
  const fromUrl = tabs.find(([k]) => k === params.get("tab"))?.[0];
  const [tab, setTabState] = useState<Tab>(fromUrl ?? "ai");
  const setTab = (t: Tab) => { setTabState(t); setParams(t === "ai" ? {} : { tab: t }, { replace: true }); };
  return (
    <div className="flex flex-col gap-[18px]">
      <PageHero icon={Settings} eyebrow={user?.role_name === "admin" ? "Firm settings" : "Settings"} title="Settings"
        sub="AI providers, court data, agents and permissions, notifications, email and the audit log." />
      <div className="grid gap-[18px] lg:grid-cols-[240px_1fr]">
        <nav aria-label="Settings sections" className="flex gap-1 overflow-x-auto rounded-[20px] border border-ink-100 bg-white p-2 lg:sticky lg:top-20 lg:flex-col lg:self-start">
          {tabs.map(([k, label, Icon]) => (
            <button key={k} onClick={() => setTab(k)} aria-current={tab === k ? "page" : undefined}
              className={cn("group flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold transition",
                tab === k ? "bg-ink-900 text-snow dark:bg-brass-400 dark:text-night-950" : "text-ink-500 hover:bg-ink-50 hover:text-ink-900")}>
              <Icon className={cn("size-4 transition group-hover:scale-110", tab === k ? "text-brass-300 dark:text-night-950" : "text-ink-400")} />
              {label}
            </button>
          ))}
        </nav>
        <div key={tab} className="min-w-0 animate-fade-up space-y-6 rounded-[20px] border border-ink-100 bg-white p-5 md:p-6">
          {tab === "ai" && <><AISettingsPage /><div className="border-t border-ink-50 pt-6"><ModelRoutes /></div></>}
          {tab === "legal" && <LegalSettings />}
          {tab === "agents" && <AgentSettings />}
          {tab === "notify" && <FirmSettings />}
          {tab === "email" && <EmailSettings />}
          {tab === "audit" && <AuditLog />}
        </div>
      </div>
    </div>
  );
}
