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
      calculated_emissions: {
        Row: {
          calculated_at: string
          co2e_kg: number
          company_id: string
          entry_id: string
          factor_id_used: string | null
          id: string
        }
        Insert: {
          calculated_at?: string
          co2e_kg: number
          company_id: string
          entry_id: string
          factor_id_used?: string | null
          id?: string
        }
        Update: {
          calculated_at?: string
          co2e_kg?: number
          company_id?: string
          entry_id?: string
          factor_id_used?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calculated_emissions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculated_emissions_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "ghg_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calculated_emissions_factor_id_used_fkey"
            columns: ["factor_id_used"]
            isOneToOne: false
            referencedRelation: "emission_factors"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          contact_email: string | null
          contact_person: string | null
          created_at: string
          id: string
          industry_type: string | null
          location: string | null
          name: string
        }
        Insert: {
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          industry_type?: string | null
          location?: string | null
          name: string
        }
        Update: {
          contact_email?: string | null
          contact_person?: string | null
          created_at?: string
          id?: string
          industry_type?: string | null
          location?: string | null
          name?: string
        }
        Relationships: []
      }
      emission_factors: {
        Row: {
          category: string
          co2e_factor: number
          id: string
          is_proxy_data: boolean
          scope: Database["public"]["Enums"]["ghg_scope"]
          source: string | null
          sub_type: string | null
          unit: string
          verified_date: string | null
          version_year: string | null
        }
        Insert: {
          category: string
          co2e_factor: number
          id?: string
          is_proxy_data?: boolean
          scope: Database["public"]["Enums"]["ghg_scope"]
          source?: string | null
          sub_type?: string | null
          unit: string
          verified_date?: string | null
          version_year?: string | null
        }
        Update: {
          category?: string
          co2e_factor?: number
          id?: string
          is_proxy_data?: boolean
          scope?: Database["public"]["Enums"]["ghg_scope"]
          source?: string | null
          sub_type?: string | null
          unit?: string
          verified_date?: string | null
          version_year?: string | null
        }
        Relationships: []
      }
      ghg_entries: {
        Row: {
          category: string
          company_id: string
          corrects_entry_id: string | null
          created_at: string
          entered_by: string
          entry_date: string
          id: string
          locked_at: string
          notes: string | null
          quantity: number
          reporting_period: string
          scope: Database["public"]["Enums"]["ghg_scope"]
          sub_type: string | null
          unit: string
        }
        Insert: {
          category: string
          company_id: string
          corrects_entry_id?: string | null
          created_at?: string
          entered_by: string
          entry_date: string
          id?: string
          locked_at?: string
          notes?: string | null
          quantity: number
          reporting_period: string
          scope: Database["public"]["Enums"]["ghg_scope"]
          sub_type?: string | null
          unit: string
        }
        Update: {
          category?: string
          company_id?: string
          corrects_entry_id?: string | null
          created_at?: string
          entered_by?: string
          entry_date?: string
          id?: string
          locked_at?: string
          notes?: string | null
          quantity?: number
          reporting_period?: string
          scope?: Database["public"]["Enums"]["ghg_scope"]
          sub_type?: string | null
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "ghg_entries_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ghg_entries_corrects_entry_id_fkey"
            columns: ["corrects_entry_id"]
            isOneToOne: false
            referencedRelation: "ghg_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          company_id: string | null
          created_at: string
          full_name: string | null
          id: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_company_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "admin"
        | "user"
        | "global_admin"
        | "regional_director"
        | "plant_manager"
      ghg_scope: "scope_1" | "scope_2" | "scope_3"
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
      app_role: [
        "admin",
        "user",
        "global_admin",
        "regional_director",
        "plant_manager",
      ],
      ghg_scope: ["scope_1", "scope_2", "scope_3"],
    },
  },
} as const
