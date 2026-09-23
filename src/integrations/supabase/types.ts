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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity: string | null
          entity_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity?: string | null
          entity_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          address_number: string | null
          city: string | null
          complement: string | null
          created_at: string
          created_by: string
          district: string | null
          email: string | null
          id: string
          legal_name: string
          notes: string | null
          phone: string | null
          phone_normalized: string | null
          postal_code: string | null
          state: string | null
          status: Database["public"]["Enums"]["record_status"]
          tax_id: string
          trade_name: string
          updated_at: string
          whatsapp: string | null
          whatsapp_normalized: string | null
        }
        Insert: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tax_id: string
          trade_name: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Update: {
          address?: string | null
          address_number?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          created_by?: string
          district?: string | null
          email?: string | null
          id?: string
          legal_name?: string
          notes?: string | null
          phone?: string | null
          phone_normalized?: string | null
          postal_code?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          tax_id?: string
          trade_name?: string
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string
          created_at: string
          created_by: string
          email: string | null
          id: string
          is_primary: boolean
          job_title: string | null
          name: string
          phone: string | null
          phone_normalized: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          whatsapp: string | null
          whatsapp_normalized: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by: string
          email?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name: string
          phone?: string | null
          phone_normalized?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string
          email?: string | null
          id?: string
          is_primary?: boolean
          job_title?: string | null
          name?: string
          phone?: string | null
          phone_normalized?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          whatsapp?: string | null
          whatsapp_normalized?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          channel: Database["public"]["Enums"]["ticket_channel"]
          company_id: string | null
          contact_id: string | null
          created_at: string
          display_name: string | null
          id: string
          last_message_at: string
          last_message_preview: string | null
          phone: string
          phone_normalized: string | null
          status: Database["public"]["Enums"]["conversation_status"]
          ticket_id: string | null
          unread_count: number
          updated_at: string
        }
        Insert: {
          channel?: Database["public"]["Enums"]["ticket_channel"]
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone: string
          phone_normalized?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          ticket_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Update: {
          channel?: Database["public"]["Enums"]["ticket_channel"]
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          last_message_at?: string
          last_message_preview?: string | null
          phone?: string
          phone_normalized?: string | null
          status?: Database["public"]["Enums"]["conversation_status"]
          ticket_id?: string | null
          unread_count?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_mime: string | null
          attachment_name: string | null
          attachment_path: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          content: string | null
          conversation_id: string
          created_at: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id: string | null
          id: string
          message_type: Database["public"]["Enums"]["message_kind"]
          phone: string | null
          sent_at: string
          status: Database["public"]["Enums"]["message_state"]
        }
        Insert: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          content?: string | null
          conversation_id: string
          created_at?: string
          direction: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_kind"]
          phone?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_state"]
        }
        Update: {
          attachment_mime?: string | null
          attachment_name?: string | null
          attachment_path?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          content?: string | null
          conversation_id?: string
          created_at?: string
          direction?: Database["public"]["Enums"]["message_direction"]
          external_id?: string | null
          id?: string
          message_type?: Database["public"]["Enums"]["message_kind"]
          phone?: string | null
          sent_at?: string
          status?: Database["public"]["Enums"]["message_state"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          event_type: string
          id: string
          read_at: string | null
          ticket_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_type: string
          id?: string
          read_at?: string | null
          ticket_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          event_type?: string
          id?: string
          read_at?: string | null
          ticket_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["record_status"]
          theme_preference: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          theme_preference?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          theme_preference?: string
          updated_at?: string
        }
        Relationships: []
      }
      sla_policies: {
        Row: {
          acknowledgment_minutes: number
          first_response_minutes: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          acknowledgment_minutes: number
          first_response_minutes: number
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          acknowledgment_minutes?: number
          first_response_minutes?: number
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolution_minutes?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      technicians: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          phone: string | null
          specialty: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name: string
          phone?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          phone?: string | null
          specialty?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "technicians_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_attachments: {
        Row: {
          created_at: string
          file_name: string
          file_size: number | null
          id: string
          mime_type: string | null
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          ticket_id: string
          uploaded_by: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          ticket_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_attachments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          parent_id: string | null
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          parent_id?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_events: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          new_value: Json | null
          note: string | null
          old_value: Json | null
          ticket_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          ticket_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          new_value?: Json | null
          note?: string | null
          old_value?: Json | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_events_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_schedules: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string | null
          scheduled_at: string
          technician_id: string | null
          ticket_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          scheduled_at: string
          technician_id?: string | null
          ticket_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string | null
          scheduled_at?: string
          technician_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_schedules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_schedules_technician_id_fkey"
            columns: ["technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_schedules_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by_id: string | null
          acknowledged_by_user_id: string | null
          assigned_technician_id: string | null
          cancel_reason: string | null
          category_id: string | null
          channel: Database["public"]["Enums"]["ticket_channel"]
          closed_at: string | null
          company_id: string
          contact_id: string
          created_by: string
          description: string
          first_response_at: string | null
          id: string
          internal_notes: string | null
          last_activity_at: string
          number: string
          opened_at: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          reopen_count: number
          reopened_at: string | null
          requester_phone: string | null
          requester_phone_normalized: string | null
          resolved_at: string | null
          scheduled_at: string | null
          scheduled_note: string | null
          solution: string | null
          status: Database["public"]["Enums"]["ticket_status"]
          subcategory_id: string | null
          subject: string
          transfer_reason: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          acknowledged_by_user_id?: string | null
          assigned_technician_id?: string | null
          cancel_reason?: string | null
          category_id?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          closed_at?: string | null
          company_id: string
          contact_id: string
          created_by: string
          description: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          number?: string
          opened_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reopen_count?: number
          reopened_at?: string | null
          requester_phone?: string | null
          requester_phone_normalized?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          scheduled_note?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory_id?: string | null
          subject: string
          transfer_reason?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by_id?: string | null
          acknowledged_by_user_id?: string | null
          assigned_technician_id?: string | null
          cancel_reason?: string | null
          category_id?: string | null
          channel?: Database["public"]["Enums"]["ticket_channel"]
          closed_at?: string | null
          company_id?: string
          contact_id?: string
          created_by?: string
          description?: string
          first_response_at?: string | null
          id?: string
          internal_notes?: string | null
          last_activity_at?: string
          number?: string
          opened_at?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          reopen_count?: number
          reopened_at?: string | null
          requester_phone?: string | null
          requester_phone_normalized?: string | null
          resolved_at?: string | null
          scheduled_at?: string | null
          scheduled_note?: string | null
          solution?: string | null
          status?: Database["public"]["Enums"]["ticket_status"]
          subcategory_id?: string | null
          subject?: string
          transfer_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_acknowledged_by_id_fkey"
            columns: ["acknowledged_by_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_acknowledged_by_user_id_fkey"
            columns: ["acknowledged_by_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_technician_id_fkey"
            columns: ["assigned_technician_id"]
            isOneToOne: false
            referencedRelation: "technicians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "ticket_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_operations: { Args: { _user_id: string }; Returns: boolean }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      normalize_phone: { Args: { value: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "supervisor" | "technician" | "viewer"
      conversation_status: "new" | "triage" | "linked" | "finished"
      message_direction: "inbound" | "outbound"
      message_kind: "text" | "image" | "document" | "audio" | "video" | "other"
      message_state:
        | "pending"
        | "sent"
        | "delivered"
        | "read"
        | "received"
        | "failed"
      record_status: "active" | "inactive"
      ticket_channel: "manual" | "whatsapp" | "email" | "portal" | "other"
      ticket_priority: "low" | "normal" | "high" | "urgent"
      ticket_status:
        | "new"
        | "triage"
        | "in_progress"
        | "waiting_customer"
        | "waiting_third_party"
        | "scheduled"
        | "resolved"
        | "closed"
        | "reopened"
        | "cancelled"
        | "duplicate"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "supervisor", "technician", "viewer"],
      conversation_status: ["new", "triage", "linked", "finished"],
      message_direction: ["inbound", "outbound"],
      message_kind: ["text", "image", "document", "audio", "video", "other"],
      message_state: [
        "pending",
        "sent",
        "delivered",
        "read",
        "received",
        "failed",
      ],
      record_status: ["active", "inactive"],
      ticket_channel: ["manual", "whatsapp", "email", "portal", "other"],
      ticket_priority: ["low", "normal", "high", "urgent"],
      ticket_status: [
        "new",
        "triage",
        "in_progress",
        "waiting_customer",
        "waiting_third_party",
        "scheduled",
        "resolved",
        "closed",
        "reopened",
        "cancelled",
        "duplicate",
      ],
    },
  },
} as const
