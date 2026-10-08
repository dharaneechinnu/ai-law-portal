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
  dashboard_layout?: { widgets?: { id: string; size: "half" | "full"; hidden: boolean }[] };
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

export interface AIConfig {
  configured: boolean;
  kind?: string;
  base_url?: string;
  chat_model?: string;
  embedding_model?: string;
  embedding_base_url?: string;
  has_api_key: boolean;
  has_embedding_api_key: boolean;
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
  access_token: string;
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
