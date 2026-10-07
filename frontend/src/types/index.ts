export interface User {
  id: string;
  name: string;
  email: string;
  role_name: string;
  designation?: string | null;
  timezone: string;
  daily_briefing_time?: string | null;
}

export interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
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
