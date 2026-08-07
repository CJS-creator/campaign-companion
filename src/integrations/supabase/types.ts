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
      settings: {
        Row: {
          id: string
          business_name: string
          postal_address: string
          support_email: string
          sender_domain: string
          daily_cap: number
          monthly_cap: number
          timezone: string
          throttle_pause_ms: number
          owner_password_hash: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          business_name?: string
          postal_address?: string
          support_email?: string
          sender_domain?: string
          daily_cap?: number
          monthly_cap?: number
          timezone?: string
          throttle_pause_ms?: number
          owner_password_hash?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          business_name?: string
          postal_address?: string
          support_email?: string
          sender_domain?: string
          daily_cap?: number
          monthly_cap?: number
          timezone?: string
          throttle_pause_ms?: number
          owner_password_hash?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          id: string
          action: string
          details: Json
          created_at: string
        }
        Insert: {
          id?: string
          action: string
          details?: Json
          created_at?: string
        }
        Update: {
          id?: string
          action?: string
          details?: Json
          created_at?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          id: string
          lead_id: string | null
          campaign_id: string | null
          event_type: string
          reason: string | null
          metadata: Json
          created_at: string
        }
        Insert: {
          id?: string
          lead_id?: string | null
          campaign_id?: string | null
          event_type: string
          reason?: string | null
          metadata?: Json
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string | null
          campaign_id?: string | null
          event_type?: string
          reason?: string | null
          metadata?: Json
          created_at?: string
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
          recipient_count: number | null
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
          recipient_count?: number | null
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
          recipient_count?: number | null
          scheduled_for?: string | null
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          consent_date: string | null
          consent_note: string | null
          consent_source: string | null
          created_at: string
          email: string
          id: string
          name: string | null
          subscribed: boolean
          suppressed_at: string | null
          suppression_reason: string | null
          suppression_status: string | null
        }
        Insert: {
          consent_date?: string | null
          consent_note?: string | null
          consent_source?: string | null
          created_at?: string
          email: string
          id?: string
          name?: string | null
          subscribed?: boolean
          suppressed_at?: string | null
          suppression_reason?: string | null
          suppression_status?: string | null
        }
        Update: {
          consent_date?: string | null
          consent_note?: string | null
          consent_source?: string | null
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          subscribed?: boolean
          suppressed_at?: string | null
          suppression_reason?: string | null
          suppression_status?: string | null
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_queued_sends: {
        Args: {
          p_campaign_id: string
          p_batch_size?: number
        }
        Returns: {
          attempt_count: number
          campaign_id: string
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
