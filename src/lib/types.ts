export interface Lead {
  id: string;
  user_id?: string | null;
  email: string;
  name: string | null;
  subscribed: boolean;
  created_at: string;
  consent_source?: string;
  consent_date?: string;
  consent_note?: string | null;
  suppression_status?: string;
  suppression_reason?: string | null;
}

export interface Campaign {
  id: string;
  user_id?: string | null;
  subject: string;
  body_html: string;
  offer_url: string | null;
  status: string;
  sent_at: string | null;
  created_at: string;
  scheduled_for?: string | null;
  recipient_count?: number | null;
}

export interface Send {
  attempt_count: number;
  id: string;
  user_id?: string | null;
  campaign_id: string;
  lead_id: string;
  status: "queued" | "sending" | "sent" | "failed" | "skipped";
  failure_reason: string | null;
  last_attempt_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  clicked_at: string | null;
}

export interface EventRow {
  id: string;
  user_id?: string | null;
  event_type: string;
  reason: string | null;
  created_at: string;
  send_id: string | null;
  campaign_id: string | null;
  lead_id: string | null;
  lead_email: string | null;
  campaign_subject: string | null;
}

export const EVENT_TYPES = [
  "delivered",
  "opened",
  "clicked",
  "bounced",
  "complained",
  "unsubscribed",
  "failed",
] as const;
