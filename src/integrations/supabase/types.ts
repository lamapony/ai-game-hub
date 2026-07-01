export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      challenges: {
        Row: {
          ai_feedback: string | null;
          created_at: string;
          id: string;
          operator_id: string;
          operator_name: string;
          room_id: string;
          round_id: string;
          score: number | null;
          task: string;
          transcript: string | null;
          video_url: string | null;
        };
        Insert: {
          ai_feedback?: string | null;
          created_at?: string;
          id?: string;
          operator_id: string;
          operator_name: string;
          room_id: string;
          round_id: string;
          score?: number | null;
          task: string;
          transcript?: string | null;
          video_url?: string | null;
        };
        Update: {
          ai_feedback?: string | null;
          created_at?: string;
          id?: string;
          operator_id?: string;
          operator_name?: string;
          room_id?: string;
          round_id?: string;
          score?: number | null;
          task?: string;
          transcript?: string | null;
          video_url?: string | null;
        };
        Relationships: [];
      };
      photos: {
        Row: {
          ai_comment: string | null;
          created_at: string;
          id: string;
          photo_url: string;
          player_id: string;
          player_name: string;
          points: number | null;
          rank: number | null;
          room_id: string;
          round_id: string;
          team_id: string;
        };
        Insert: {
          ai_comment?: string | null;
          created_at?: string;
          id?: string;
          photo_url: string;
          player_id: string;
          player_name: string;
          points?: number | null;
          rank?: number | null;
          room_id: string;
          round_id: string;
          team_id: string;
        };
        Update: {
          ai_comment?: string | null;
          created_at?: string;
          id?: string;
          photo_url?: string;
          player_id?: string;
          player_name?: string;
          points?: number | null;
          rank?: number | null;
          room_id?: string;
          round_id?: string;
          team_id?: string;
        };
        Relationships: [];
      };
      rooms: {
        Row: {
          code: string;
          created_at: string;
          host_secret: string;
          id: string;
          state: Json;
          updated_at: string;
        };
        Insert: {
          code: string;
          created_at?: string;
          host_secret: string;
          id?: string;
          state?: Json;
          updated_at?: string;
        };
        Update: {
          code?: string;
          created_at?: string;
          host_secret?: string;
          id?: string;
          state?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          audio_url: string | null;
          created_at: string;
          duration_seconds: number | null;
          id: string;
          player_id: string;
          player_name: string;
          room_id: string;
          round_id: string;
          team_id: string;
          transcript: string | null;
        };
        Insert: {
          audio_url?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          player_id: string;
          player_name: string;
          room_id: string;
          round_id: string;
          team_id: string;
          transcript?: string | null;
        };
        Update: {
          audio_url?: string | null;
          created_at?: string;
          duration_seconds?: number | null;
          id?: string;
          player_id?: string;
          player_name?: string;
          room_id?: string;
          round_id?: string;
          team_id?: string;
          transcript?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
      votes: {
        Row: {
          category: string;
          created_at: string;
          id: string;
          room_id: string;
          round_id: string;
          target_team_id: string;
          voter_player_id: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          id?: string;
          room_id: string;
          round_id: string;
          target_team_id: string;
          voter_player_id: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          id?: string;
          room_id?: string;
          round_id?: string;
          target_team_id?: string;
          voter_player_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "votes_room_id_fkey";
            columns: ["room_id"];
            isOneToOne: false;
            referencedRelation: "rooms";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
