export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          details: Json
          id: string
        }
        Insert: {
          action: string
          created_at?: string
          details?: Json
          id?: string
        }
        Update: {
          action?: string
          created_at?: string
          details?: Json
          id?: string
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          body_html: string
          body_text: string | null
          created_at: string
          id: string
          offer_url: string | null
          recipient_count: number
          scheduled_for: string | null
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          offer_url?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          body_html?: string
          body_text?: string | null
          created_at?: string
          id?: string
          offer_url?: string | null
          recipient_count?: number
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          campaign_id: string | null
          created_at: string
          event_type: string
          id: string
          lead_id: string | null
          metadata: Json
          reason: string | null
          send_id: string | null
        }
        Insert: {
          campaign_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          reason?: string | null
          send_id?: string | null
        }
        Update: {
          campaign_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          lead_id?: string | null
          metadata?: Json
          reason?: string | null
          send_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "events_send_id_fkey"
            columns: ["send_id"]
            isOneToOne: false
            referencedRelation: "sends"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          consent_date: string
          consent_note: string | null
          consent_source: string
          created_at: string
          email: string
          id: string
          name: string | null
          subscribed: boolean
          suppressed_at: string | null
          suppression_reason: string | null
          suppression_status: string
        }
        Insert: {
          consent_date?: string
          consent_note?: string | null
          consent_source?: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          subscribed?: boolean
          suppressed_at?: string | null
          suppression_reason?: string | null
          suppression_status?: string
        }
        Update: {
          consent_date?: string
          consent_note?: string | null
          consent_source?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          subscribed?: boolean
          suppressed_at?: string | null
          suppression_reason?: string | null
          suppression_status?: string
        }
        Relationships: []
      }
      sends: {
        Row: {
          attempt_count: number
          attempt_history: Json
          campaign_id: string
          clicked_at: string | null
          created_at: string
          failure_reason: string | null
          id: string
          last_attempt_at: string | null
          lead_id: string
          opened_at: string | null
          provider_message_id: string | null
          sent_at: string | null
          status: string
        }
        Insert: {
          attempt_count?: number
          attempt_history?: Json
          campaign_id: string
          clicked_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_id: string
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Update: {
          attempt_count?: number
          attempt_history?: Json
          campaign_id?: string
          clicked_at?: string | null
          created_at?: string
          failure_reason?: string | null
          id?: string
          last_attempt_at?: string | null
          lead_id?: string
          opened_at?: string | null
          provider_message_id?: string | null
          sent_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sends_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sends_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          business_name: string
          created_at: string
          daily_cap: number
          from_address: string
          id: string
          monthly_cap: number
          postal_address: string
          sender_domain: string
          support_email: string
          throttle_pause_ms: number
          timezone: string
          updated_at: string
        }
        Insert: {
          business_name?: string
          created_at?: string
          daily_cap?: number
          from_address?: string
          id?: string
          monthly_cap?: number
          postal_address?: string
          sender_domain?: string
          support_email?: string
          throttle_pause_ms?: number
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          daily_cap?: number
          from_address?: string
          id?: string
          monthly_cap?: number
          postal_address?: string
          sender_domain?: string
          support_email?: string
          throttle_pause_ms?: number
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_queued_sends: {
        Args: { p_batch_size: number; p_campaign_id: string }
        Returns: {
          attempt_count: number
          id: string
          lead_id: string
          status: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
