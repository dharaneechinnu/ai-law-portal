export interface User {
  id: string;
  name: string;
  email: string;
  role_name: string;
  designation?: string | null;
  practice_areas: string[];
  phone?: string | null;
  office_location?: string | null;
  timezone: string;
  working_hours: Record<string, [string, string] | null>;
  notification_prefs: Record<string, boolean>;
  daily_briefing_time?: string | null;
  ai_prefs: Record<string, string>;
  dashboard_layout?: { widgets?: { id: string; size: "half" | "full"; hidden: boolean; w?: number; h?: number }[] };
  firm_name?: string | null;
}

export interface UserBrief {
  id: string;
  name: string;
  email: string;
  role_name: string;
}

export interface Member {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
}

export interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
}

export interface Matter {
  id: string;
  matter_number: string;
  title: string;
  client_id: string;
  case_number?: string | null;
  court?: string | null;
  jurisdiction?: string | null;
  practice_area?: string | null;
  status: string;
  priority: string;
  description?: string | null;
  assigned_lawyer_id?: string | null;
  legal_issues: string[];
  restricted: boolean;
  next_hearing?: string | null;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  event_type: string;
  title: string;
  occurred_at: string;
}

export interface DocumentRow {
  id: string;
  filename: string;
  size_bytes: number;
  status: "uploaded" | "processing" | "ready" | "failed";
  page_count: number | null;
  error: string | null;
}

export interface Citation {
  document_id: string;
  filename: string;
  page_number: number | null;
  chunk_index: number;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  citations: Citation[];
}

export interface AIField {
  key: string;
  label: string;
  type: "secret" | "text" | "url";
  required: boolean;
  default?: string | null;
  placeholder?: string | null;
  help?: string | null;
}

/** One entry of the provider catalog (GET /settings/ai/providers). */
export interface AIProviderInfo {
  id: string;
  name: string;
  group: string;
  base_url?: string | null;
  blurb: string;
  key_url?: string | null;
  fields: AIField[];
  chat: boolean;
  embeddings: boolean;
  tools: boolean;
  dimensions: boolean;
  list_models: boolean;
  chat_models: string[];
  embedding_models: string[];
  pricing: "free" | "free_tier" | "paid";
  pricing_note?: string | null;
  guide: string[];
}

export interface AIConnection {
  kind: string;
  name: string;
  fields: Record<string, string | null>;
  saved_secrets: string[];
  model: string;
}

export interface AIConfig {
  configured: boolean;
  chat?: AIConnection | null;
  embedding?: (AIConnection & { same_as_chat: boolean }) | null;
  embedding_dim: number;
}

export interface AITestResult {
  chat_ok: boolean;
  chat_error?: string | null;
  embedding_ok: boolean;
  embedding_error?: string | null;
  embedding_dim?: number | null;
  expected_dim: number;
}

export type UserStatus = "active" | "invited" | "disabled";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role_name: string;
  designation?: string | null;
  status: UserStatus;
  invite_expires_at?: string | null;
  last_login_at?: string | null;
  created_at: string;
}

export interface AdminUserCreated {
  user: AdminUser;
  invite_token: string | null;
  emailed?: boolean;
}

export interface EmailConfig {
  configured: boolean;
  host?: string | null;
  port?: number | null;
  security: "starttls" | "ssl" | "none";
  username?: string | null;
  sender?: string | null;
  has_password: boolean;
}

export interface InviteInfo {
  email: string;
  name: string;
  role_name: string;
  firm_name?: string | null;
}

export interface SetupStatus {
  needs_setup: boolean;
  firm_name?: string | null;
}

export interface Session {
  user: User;
}

export interface LegalSource {
  configured: boolean;
  provider: string;
  base_url?: string | null;
  has_api_key: boolean;
  config: Record<string, unknown>;
  enabled: boolean;
  last_synced_at?: string | null;
}

export interface LegalSyncResult {
  fetched: number;
  new: number;
  updated: number;
  matches: number;
  alerts: number;
  embedded: boolean;
}

export interface Judgment {
  id: string;
  kind: string;
  external_judgment_id: string;
  title?: string | null;
  judgment_date?: string | null;
  court_name?: string | null;
  summary?: string | null;
  provisions: string[];
  bench: string[];
  outcome?: string | null;
  source_url?: string | null;
}

export interface Comparison {
  same: string[];
  different: string[];
  potential_impact: string;
  recommended_review: string[];
  raw?: string | null;
  label: string;
  generated_at: string;
}

export type MatchStatus = "new" | "reviewed" | "dismissed";

export interface LegalMatch {
  id: string;
  matter_id: string;
  matter_title: string;
  matter_number: string;
  relevance: number;
  signals: { signals: Record<string, number | null>; weights: Record<string, number> };
  status: MatchStatus;
  is_alert: boolean;
  comparison?: Comparison | null;
  judgment: Judgment;
  detected_at: string;
}

export interface DashItem {
  kind: "hearing" | "task";
  id: string;
  title: string;
  at?: string | null;
  matter_id?: string | null;
  matter_title?: string | null;
  priority?: string | null;
}

export interface Dashboard {
  stats: { open_matters: number; overdue_tasks: number; hearings_week: number; new_alerts: number };
  today: DashItem[];
  overdue: DashItem[];
  alerts: { id: string; matter_id: string; matter_title: string; title?: string | null; relevance: number }[];
  matters: { id: string; title: string; matter_number: string; priority: string; next_hearing?: string | null }[];
}

export type TaskStatus = "open" | "done" | "archived";

export interface Task {
  id: string;
  title: string;
  description?: string | null;
  matter_id?: string | null;
  matter_title?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  due_at?: string | null;
  priority: string;
  status: TaskStatus;
  kind: string;
  depends_on: string[];
  blocked: boolean;
  created_at: string;
}

export interface CalItem {
  kind: "event" | "hearing";
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string | null;
  matter_id?: string | null;
  matter_title?: string | null;
  status: string;
  owner_id?: string | null;
  attendee_ids?: string[];
  outcome?: string | null;
}

export interface CalEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  location?: string | null;
  matter_id?: string | null;
  owner_id: string;
  attendee_ids: string[];
}

export interface Hearing {
  id: string;
  matter_id: string;
  matter_title?: string | null;
  scheduled_at: string;
  court_room?: string | null;
  purpose?: string | null;
  status: string;
  outcome?: string | null;
}

export interface Person {
  id: string;
  name: string;
  email: string;
  role_name: string;
  designation?: string | null;
  practice_areas: string[];
  status: "free" | "busy" | "off";
  busy_until?: string | null;
  open_tasks: number;
  overdue_tasks: number;
  active_matters: number;
}

export interface PersonDetail extends Person {
  phone?: string | null;
  office_location?: string | null;
  timezone: string;
  working_hours: Record<string, [string, string] | null>;
  busy: { start: string; end: string; title: string; kind: string }[];
  matters: { id: string; title: string; matter_number: string }[];
}

export interface Briefing {
  id: string;
  for_date: string;
  summary: string;
  source: "ai" | "facts";
  created_at: string;
  facts: { hearings: unknown[]; meetings: unknown[]; due_today: unknown[]; overdue_count: number; alert_count: number };
}

export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body?: string | null;
  link?: string | null;
  read_at?: string | null;
  created_at: string;
}

export type PolicyDecision = "ALLOWED" | "APPROVAL_REQUIRED" | "DISABLED";

export interface AgentInfo { key: string; name: string; enabled: boolean; mode: "suggest" | "approval" | "autonomous" }

export interface ToolInfo {
  action: string;
  label: string;
  description: string;
  is_mutation: boolean;
  is_external: boolean;
  is_destructive: boolean;
  decision: PolicyDecision;
  /** No rule for the chosen agent: the all-agents rule (or the tool's default) applies. */
  inherited: boolean;
}

export interface OverrideInfo {
  id: string;
  action: string;
  agent_key?: string | null;
  decision: PolicyDecision;
  expires_at: string;
  created_by_name?: string | null;
}

export interface AgentControls { kill_switch: boolean; agents: AgentInfo[]; tools: ToolInfo[]; overrides: OverrideInfo[] }

export interface Approval {
  id: string;
  action: string;
  label: string;
  agent_key?: string | null;
  agent_name?: string | null;
  summary: string;
  payload: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  requested_for: string;
  decided_by_name?: string | null;
  decided_at?: string | null;
  result?: Record<string, unknown> | null;
  created_at: string;
}

export interface ActionResult {
  status: "executed" | "pending_approval" | "blocked" | "failed";
  decision: PolicyDecision;
  reason: string;
  approval_id?: string | null;
  result?: Record<string, unknown> | null;
}

export interface ChatStep { action: string; label: string; status: string; reason: string; approval_id?: string | null; summary?: string | null }

export interface ChatReply { execution_id: string; agent_key: string; reply: string; steps: ChatStep[]; status: "completed" | "waiting_approval" }

export interface ChatUpload { id: string; filename: string; size_bytes: number }

export interface AuditEntry {
  id: string;
  occurred_at: string;
  action: string;
  user_name?: string | null;
  agent_key?: string | null;
  agent_name?: string | null;
  matter_id?: string | null;
  matter_title?: string | null;
  resource_type?: string | null;
  resource_id?: string | null;
  policy_decision?: string | null;
  approved?: boolean | null;
  approved_by_name?: string | null;
  executed?: boolean | null;
  result: Record<string, unknown>;
}

export interface Bar { label: string; value: number; overdue?: number }

export interface Analytics {
  days: number;
  firm: {
    active_matters: number; avg_matter_age_days: number; overdue_tasks: number; hearings_next_14_days: number;
    tasks_created: number; tasks_done: number; by_practice_area: Bar[]; workload: Bar[];
  };
  legal: {
    judgments_added: number; alerts_new: number; alerts_reviewed: number; alerts_dismissed: number;
    high_impact_unreviewed: number; alerts_in_range: number;
  };
  ai: {
    allowed: number; asked: number; blocked: number; approved: number; rejected: number; pending: number;
    conversations: number; top_actions: Bar[]; by_agent: Bar[]; models: Bar[];
  };
}

export interface ModelRoute { task: string; label: string; model?: string | null; default_model: string }

export interface FirmSettingsData {
  legal_alert_threshold: number;
  hearing_reminder_hours: number;
  meeting_reminder_minutes: number;
  task_due_reminder_hours: number;
  approval_expiry_days: number;
}
