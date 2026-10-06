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
      historico_edicoes: {
        Row: {
          acao: string
          created_at: string
          detalhe: string | null
          id: string
          os_id: string
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string
          detalhe?: string | null
          id?: string
          os_id: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string
          detalhe?: string | null
          id?: string
          os_id?: string
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "historico_edicoes_os_id_fkey"
            columns: ["os_id"]
            isOneToOne: false
            referencedRelation: "ordens_servico"
            referencedColumns: ["id"]
          },
        ]
      }
      solicitacoes_os: {
        Row: {
          atendida_em: string | null
          criada_em: string
          detalhe_gestor: string | null
          descricao: string | null
          frota: string
          id: string
          localizacao: string | null
          numero_os: string
          ordem_id: string | null
          solicitante_email: string
          solicitante_id: string
          solicitante_nome: string | null
          status: string
          tecnico_email: string
          tecnico_id: string | null
          tecnico_nome: string | null
          updated_at: string
        }
        Insert: {
          atendida_em?: string | null
          criada_em?: string
          detalhe_gestor?: string | null
          descricao?: string | null
          frota: string
          id?: string
          localizacao?: string | null
          numero_os: string
          ordem_id?: string | null
          solicitante_email: string
          solicitante_id: string
          solicitante_nome?: string | null
          status?: string
          tecnico_email: string
          tecnico_id?: string | null
          tecnico_nome?: string | null
          updated_at?: string
        }
        Update: {
          atendida_em?: string | null
          criada_em?: string
          detalhe_gestor?: string | null
          descricao?: string | null
          frota?: string
          id?: string
          localizacao?: string | null
          numero_os?: string
          ordem_id?: string | null
          solicitante_email?: string
          solicitante_id?: string
          solicitante_nome?: string | null
          status?: string
          tecnico_email?: string
          tecnico_id?: string | null
          tecnico_nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ordens_servico: {
        Row: {
          concluida_em: string | null
          created_at: string
          criado_por_email: string | null
          data_inicio: string | null
          descricao: string | null
          frota: string
          id: string
          localizacao: string | null
          notas_fecho: string | null
          numero_os: string | null
          pecas_utilizadas: string | null
          status: string
          tecnico_email: string | null
          tecnico_id: string | null
          tecnico_nome: string | null
          updated_at: string
          valor_total: number | null
          solicitacao_os: boolean
          solicitacao_status: string | null
          solicitada_em: string | null
          regularizada_em: string | null
          regularizada_por_email: string | null
        }
        Insert: {
          concluida_em?: string | null
          created_at?: string
          criado_por_email?: string | null
          data_inicio?: string | null
          descricao?: string | null
          frota: string
          id?: string
          localizacao?: string | null
          notas_fecho?: string | null
          numero_os: string | null
          pecas_utilizadas?: string | null
          status?: string
          tecnico_email?: string | null
          tecnico_id?: string | null
          tecnico_nome?: string | null
          updated_at?: string
          valor_total?: number | null
          solicitacao_os?: boolean
          solicitacao_status?: string | null
          solicitada_em?: string | null
          regularizada_em?: string | null
          regularizada_por_email?: string | null
        }
        Update: {
          concluida_em?: string | null
          created_at?: string
          criado_por_email?: string | null
          data_inicio?: string | null
          descricao?: string | null
          frota?: string
          id?: string
          localizacao?: string | null
          notas_fecho?: string | null
          numero_os?: string | null
          pecas_utilizadas?: string | null
          status?: string
          tecnico_email?: string | null
          tecnico_id?: string | null
          tecnico_nome?: string | null
          updated_at?: string
          valor_total?: number | null
        }
        Relationships: []
      }
      pecas_catalogo: {
        Row: {
          ativo: boolean
          created_at: string
          criado_por_email: string | null
          id: string
          nome: string
          updated_at: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          criado_por_email?: string | null
          id?: string
          nome: string
          updated_at?: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          criado_por_email?: string | null
          id?: string
          nome?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      lookup_email_by_username: { Args: { p_nome: string }; Returns: string }
    }
    Enums: {
      app_role: "gestor" | "tecnico"
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
      app_role: ["gestor", "tecnico"],
    },
  },
} as const
