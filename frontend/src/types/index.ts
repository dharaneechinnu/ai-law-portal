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
