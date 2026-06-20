export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      content_blog_post_comments: {
        Row: {
          author_id: string
          blog_post_id: string
          body: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          blog_post_id: string
          body: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          blog_post_id?: string
          body?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_blog_post_comments_blog_post_id_fkey"
            columns: ["blog_post_id"]
            isOneToOne: false
            referencedRelation: "content_blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blog_posts: {
        Row: {
          author_id: string
          body: string
          created_at: string
          excerpt: string | null
          id: string
          is_published: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          is_published?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      private_items: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          owner_id: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          name: string
          owner_id?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          owner_id?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          id: string
          company_name: string
          created_at: string
        }
        Insert: {
          id: string
          company_name?: string
          created_at?: string
        }
        Update: {
          id?: string
          company_name?: string
          created_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          id: string
          installer_id: string
          name: string
          email: string
          phone: string
          address: string
          roof_type: string | null
          monthly_bill: number
          status: Database["public"]["Enums"]["lead_status"]
          created_at: string
        }
        Insert: {
          id?: string
          installer_id: string
          name: string
          email: string
          phone: string
          address: string
          roof_type?: string | null
          monthly_bill: number
          status?: Database["public"]["Enums"]["lead_status"]
          created_at?: string
        }
        Update: {
          id?: string
          installer_id?: string
          name?: string
          email?: string
          phone?: string
          address?: string
          roof_type?: string | null
          monthly_bill?: number
          status?: Database["public"]["Enums"]["lead_status"]
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_installer_id_fkey"
            columns: ["installer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          id: string
          lead_id: string
          system_size_kw: number
          total_cost: number
          financing_type: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          system_size_kw: number
          total_cost: number
          financing_type: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          system_size_kw?: number
          total_cost?: number
          financing_type?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      strategies: {
        Row: {
          id: string
          lead_id: string
          persona_detected: "family" | "investor" | "environmentalist" | "skeptic"
          persona_confidence: number | null
          signals: string[]
          strategy_summary: string
          rationale: string
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          persona_detected: "family" | "investor" | "environmentalist" | "skeptic"
          persona_confidence?: number | null
          signals?: string[]
          strategy_summary: string
          rationale: string
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          persona_detected?: "family" | "investor" | "environmentalist" | "skeptic"
          persona_confidence?: number | null
          signals?: string[]
          strategy_summary?: string
          rationale?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "strategies_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          id: string
          lead_id: string
          strategy_id: string
          channel_type: Database["public"]["Enums"]["message_channel"]
          subject: string | null
          content: string
          goal: string | null
          sequence_order: number
          audio_path: string | null
          status: Database["public"]["Enums"]["message_status"]
          sent_at: string | null
          error_message: string | null
          provider_message_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          lead_id: string
          strategy_id: string
          channel_type: Database["public"]["Enums"]["message_channel"]
          subject?: string | null
          content: string
          goal?: string | null
          sequence_order: number
          audio_path?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          sent_at?: string | null
          error_message?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          lead_id?: string
          strategy_id?: string
          channel_type?: Database["public"]["Enums"]["message_channel"]
          subject?: string | null
          content?: string
          goal?: string | null
          sequence_order?: number
          audio_path?: string | null
          status?: Database["public"]["Enums"]["message_status"]
          sent_at?: string | null
          error_message?: string | null
          provider_message_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_strategy_id_fkey"
            columns: ["strategy_id"]
            isOneToOne: false
            referencedRelation: "strategies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      lead_status: "new" | "contacted" | "negotiating" | "closed" | "ghosted"
      message_channel: "email" | "sms" | "call" | "voice"
      message_status: "draft" | "sent" | "failed"
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
    Enums: {
      lead_status: ["new", "contacted", "negotiating", "closed", "ghosted"],
      message_channel: ["email", "sms", "call", "voice"],
      message_status: ["draft", "sent", "failed"],
    },
  },
} as const

