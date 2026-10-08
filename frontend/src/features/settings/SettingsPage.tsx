import { AISettingsPage } from "./AISettingsPage";
import { LegalSettings } from "./LegalSettings";

export function SettingsPage() {
  return (
    <div className="space-y-10">
      <AISettingsPage />
      <LegalSettings />
    </div>
  );
}
