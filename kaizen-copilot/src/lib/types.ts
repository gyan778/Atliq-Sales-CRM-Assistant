// Shared domain types for Kaizen Copilot.

export const SERVICE_LINES = [
  "Custom Web App",
  "Data Engineering",
  "Power BI Dashboards",
  "AI/ML Solutions",
  "Staff Augmentation",
] as const;
export type ServiceLine = (typeof SERVICE_LINES)[number];

export const STATUSES = ["New", "Contacted", "Proposal Sent", "Won", "Lost"] as const;
export type Status = (typeof STATUSES)[number];

export const LEAD_SOURCES = ["Referral", "LinkedIn", "Conference", "Website", "Cold Outreach"] as const;

export const SIGNAL_TYPES = ["cross_sell", "revisit", "deadline", "risk", "renewal"] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export type SourceType = "email" | "meeting_note" | "quick_capture";

export interface ThreadMessage {
  fromName: string;
  fromEmail: string | null;
  date: string; // YYYY-MM-DD
  isAtliq: boolean;
  isAutoReply: boolean;
  asks: boolean; // the message contains a question
}

/** A piece of raw interaction text the assistant reads (email thread, meeting note, quick capture). */
export interface Source {
  id: string;
  type: SourceType;
  file: string;
  title: string;
  date: string; // date of the latest message / the note
  text: string; // redacted, editorial notes stripped
  messages: ThreadMessage[]; // empty for notes
  emails: string[]; // every email address in the source
  atliqPeople: string[]; // AtliQ people (first names) on the source
  redactions: number;
}

export interface Activity {
  id: string;
  date: string;
  sourceId: string;
  summary: string;
  withClient: boolean;
}

export interface Opportunity {
  id: string;
  title: string;
  serviceLine: string | null;
  sourceId: string;
  evidence: string;
  createdAt: string;
}

/** A Kaizen CRM record (mirrors crm_export.csv plus fields the assistant maintains). */
export interface CrmRecord {
  lead_id: string;
  company: string;
  contact_name: string;
  contact_email: string;
  source: string;
  service_interest: string;
  status: string;
  est_value_usd: number | null;
  owner: string;
  created_date: string;
  last_contact_date: string;
  next_followup_date: string;
  notes: string;
  activities: Activity[];
  opportunities: Opportunity[];
  merged_into?: string;
  created_by_copilot?: boolean;
}

export type EditableField =
  | "service_interest"
  | "status"
  | "est_value_usd"
  | "contact_name"
  | "contact_email"
  | "next_followup_date"
  | "owner"
  | "last_contact_date";
