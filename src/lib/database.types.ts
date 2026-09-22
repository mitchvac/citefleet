export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      account: {
        Row: {
          accessToken: string | null;
          accessTokenExpiresAt: string | null;
          accountId: string;
          createdAt: string;
          id: string;
          idToken: string | null;
          password: string | null;
          providerId: string;
          refreshToken: string | null;
          refreshTokenExpiresAt: string | null;
          scope: string | null;
          updatedAt: string;
          userId: string;
        };
        Insert: {
          accessToken?: string | null;
          accessTokenExpiresAt?: string | null;
          accountId: string;
          createdAt?: string;
          id: string;
          idToken?: string | null;
          password?: string | null;
          providerId: string;
          refreshToken?: string | null;
          refreshTokenExpiresAt?: string | null;
          scope?: string | null;
          updatedAt: string;
          userId: string;
        };
        Update: {
          accessToken?: string | null;
          accessTokenExpiresAt?: string | null;
          accountId?: string;
          createdAt?: string;
          id?: string;
          idToken?: string | null;
          password?: string | null;
          providerId?: string;
          refreshToken?: string | null;
          refreshTokenExpiresAt?: string | null;
          scope?: string | null;
          updatedAt?: string;
          userId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "account_userId_fkey";
            columns: ["userId"];
            isOneToOne: false;
            referencedRelation: "user";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_auth_failures: {
        Row: {
          client_hash: string;
          failure_count: number;
          last_at: string;
          locked_until: string | null;
        };
        Insert: {
          client_hash: string;
          failure_count: number;
          last_at: string;
          locked_until?: string | null;
        };
        Update: {
          client_hash?: string;
          failure_count?: number;
          last_at?: string;
          locked_until?: string | null;
        };
        Relationships: [];
      };
      citefleet_dns_oauth_states: {
        Row: {
          consumed_at: string | null;
          created_at: string;
          domain: string;
          expires_at: string;
          operation_id: string;
          pkce_verifier: string | null;
          provider: string;
          site_id: string;
          state_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          consumed_at?: string | null;
          created_at?: string;
          domain: string;
          expires_at: string;
          operation_id: string;
          pkce_verifier?: string | null;
          provider: string;
          site_id: string;
          state_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          consumed_at?: string | null;
          created_at?: string;
          domain?: string;
          expires_at?: string;
          operation_id?: string;
          pkce_verifier?: string | null;
          provider?: string;
          site_id?: string;
          state_hash?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_dns_oauth_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citefleet_dns_oauth_states_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_hostinger_install_jobs: {
        Row: {
          capability_hash: string;
          client_id: string;
          created_at: string;
          domain: string;
          encrypted_token: string | null;
          expires_at: string;
          finished_at: string | null;
          id: string;
          result: string | null;
          run_deadline: string | null;
          site_id: string;
          status: string;
          workspace_id: string;
        };
        Insert: {
          capability_hash: string;
          client_id: string;
          created_at?: string;
          domain: string;
          encrypted_token?: string | null;
          expires_at: string;
          finished_at?: string | null;
          id: string;
          result?: string | null;
          run_deadline?: string | null;
          site_id: string;
          status: string;
          workspace_id: string;
        };
        Update: {
          capability_hash?: string;
          client_id?: string;
          created_at?: string;
          domain?: string;
          encrypted_token?: string | null;
          expires_at?: string;
          finished_at?: string | null;
          id?: string;
          result?: string | null;
          run_deadline?: string | null;
          site_id?: string;
          status?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_hostinger_install_jobs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_hostinger_oauth_states: {
        Row: {
          client_id: string;
          created_at: string;
          domain: string;
          expires_at: string;
          pkce_verifier: string;
          site_id: string;
          state_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          created_at?: string;
          domain: string;
          expires_at: string;
          pkce_verifier: string;
          site_id: string;
          state_hash: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          created_at?: string;
          domain?: string;
          expires_at?: string;
          pkce_verifier?: string;
          site_id?: string;
          state_hash?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_hostinger_oauth_states_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citefleet_hostinger_oauth_states_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_mail_events: {
        Row: {
          accepted_at: string | null;
          attempts: number;
          created_at: string;
          failure_code: string | null;
          id: string;
          kind: string;
          latency_ms: number | null;
          provider: string;
          status: string;
          updated_at: string;
          user_id: string | null;
        };
        Insert: {
          accepted_at?: string | null;
          attempts?: number;
          created_at?: string;
          failure_code?: string | null;
          id: string;
          kind: string;
          latency_ms?: number | null;
          provider?: string;
          status: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Update: {
          accepted_at?: string | null;
          attempts?: number;
          created_at?: string;
          failure_code?: string | null;
          id?: string;
          kind?: string;
          latency_ms?: number | null;
          provider?: string;
          status?: string;
          updated_at?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_mail_events_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_mail_limits: {
        Row: {
          kind: string;
          next_allowed_at: string;
          user_id: string;
        };
        Insert: {
          kind: string;
          next_allowed_at: string;
          user_id: string;
        };
        Update: {
          kind?: string;
          next_allowed_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_mail_limits_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_password_resets: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          requested_ip: string | null;
          token_hash: string;
          used_at: string | null;
          user_id: string;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          id: string;
          requested_ip?: string | null;
          token_hash: string;
          used_at?: string | null;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          requested_ip?: string | null;
          token_hash?: string;
          used_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_password_resets_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_sessions: {
        Row: {
          created_at: string;
          expires_at: string;
          operator_token_hash: string | null;
          token_hash: string;
          user_id: string | null;
        };
        Insert: {
          created_at?: string;
          expires_at: string;
          operator_token_hash?: string | null;
          token_hash: string;
          user_id?: string | null;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          operator_token_hash?: string | null;
          token_hash?: string;
          user_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_sessions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_snapshot: {
        Row: {
          id: string;
          payload: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          id: string;
          payload: Json;
          updated_at?: string;
          version?: number;
        };
        Update: {
          id?: string;
          payload?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_snapshot_workspace_fk";
            columns: ["id"];
            isOneToOne: true;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_users: {
        Row: {
          created_at: string;
          email: string;
          github_token: string | null;
          id: string;
          image_url: string | null;
          name: string;
          password_hash: string | null;
          provider: string;
          provider_id: string | null;
        };
        Insert: {
          created_at?: string;
          email: string;
          github_token?: string | null;
          id: string;
          image_url?: string | null;
          name?: string;
          password_hash?: string | null;
          provider?: string;
          provider_id?: string | null;
        };
        Update: {
          created_at?: string;
          email?: string;
          github_token?: string | null;
          id?: string;
          image_url?: string | null;
          name?: string;
          password_hash?: string | null;
          provider?: string;
          provider_id?: string | null;
        };
        Relationships: [];
      };
      citefleet_vercel_installs: {
        Row: {
          client_id: string;
          commit_sha: string | null;
          configuration_id: string | null;
          consumed_at: string | null;
          created_at: string;
          deployment_id: string | null;
          deployment_url: string | null;
          domain: string;
          encrypted_token: string | null;
          expected_files: Json;
          expires_at: string;
          finished_at: string | null;
          id: string;
          lease_id: string | null;
          lease_until: string | null;
          message: string;
          site_id: string;
          site_url: string;
          state_hash: string | null;
          status: string;
          target: Json | null;
          team_id: string | null;
          updated_at: string;
          user_id: string;
          verified_paths: Json;
          workspace_id: string;
        };
        Insert: {
          client_id: string;
          commit_sha?: string | null;
          configuration_id?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          deployment_id?: string | null;
          deployment_url?: string | null;
          domain: string;
          encrypted_token?: string | null;
          expected_files: Json;
          expires_at: string;
          finished_at?: string | null;
          id: string;
          lease_id?: string | null;
          lease_until?: string | null;
          message: string;
          site_id: string;
          site_url: string;
          state_hash?: string | null;
          status: string;
          target?: Json | null;
          team_id?: string | null;
          updated_at?: string;
          user_id: string;
          verified_paths?: Json;
          workspace_id: string;
        };
        Update: {
          client_id?: string;
          commit_sha?: string | null;
          configuration_id?: string | null;
          consumed_at?: string | null;
          created_at?: string;
          deployment_id?: string | null;
          deployment_url?: string | null;
          domain?: string;
          encrypted_token?: string | null;
          expected_files?: Json;
          expires_at?: string;
          finished_at?: string | null;
          id?: string;
          lease_id?: string | null;
          lease_until?: string | null;
          message?: string;
          site_id?: string;
          site_url?: string;
          state_hash?: string | null;
          status?: string;
          target?: Json | null;
          team_id?: string | null;
          updated_at?: string;
          user_id?: string;
          verified_paths?: Json;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_vercel_installs_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citefleet_vercel_installs_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_workspace_members: {
        Row: {
          created_at: string;
          is_default: boolean;
          role: string;
          user_id: string;
          workspace_id: string;
        };
        Insert: {
          created_at?: string;
          is_default?: boolean;
          role?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          is_default?: boolean;
          role?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "citefleet_workspace_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_users";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "citefleet_workspace_members_workspace_id_fkey";
            columns: ["workspace_id"];
            isOneToOne: false;
            referencedRelation: "citefleet_workspaces";
            referencedColumns: ["id"];
          },
        ];
      };
      citefleet_workspaces: {
        Row: {
          archived_at: string | null;
          created_at: string;
          id: string;
          name: string;
          plan: string;
          region: string;
          slug: string;
        };
        Insert: {
          archived_at?: string | null;
          created_at?: string;
          id: string;
          name: string;
          plan?: string;
          region?: string;
          slug: string;
        };
        Update: {
          archived_at?: string | null;
          created_at?: string;
          id?: string;
          name?: string;
          plan?: string;
          region?: string;
          slug?: string;
        };
        Relationships: [];
      };
      session: {
        Row: {
          createdAt: string;
          expiresAt: string;
          id: string;
          ipAddress: string | null;
          token: string;
          updatedAt: string;
          userAgent: string | null;
          userId: string;
        };
        Insert: {
          createdAt?: string;
          expiresAt: string;
          id: string;
          ipAddress?: string | null;
          token: string;
          updatedAt: string;
          userAgent?: string | null;
          userId: string;
        };
        Update: {
          createdAt?: string;
          expiresAt?: string;
          id?: string;
          ipAddress?: string | null;
          token?: string;
          updatedAt?: string;
          userAgent?: string | null;
          userId?: string;
        };
        Relationships: [
          {
            foreignKeyName: "session_userId_fkey";
            columns: ["userId"];
            isOneToOne: false;
            referencedRelation: "user";
            referencedColumns: ["id"];
          },
        ];
      };
      user: {
        Row: {
          createdAt: string;
          email: string;
          emailVerified: boolean;
          id: string;
          image: string | null;
          name: string;
          updatedAt: string;
        };
        Insert: {
          createdAt?: string;
          email: string;
          emailVerified: boolean;
          id: string;
          image?: string | null;
          name: string;
          updatedAt?: string;
        };
        Update: {
          createdAt?: string;
          email?: string;
          emailVerified?: boolean;
          id?: string;
          image?: string | null;
          name?: string;
          updatedAt?: string;
        };
        Relationships: [];
      };
      verification: {
        Row: {
          createdAt: string;
          expiresAt: string;
          id: string;
          identifier: string;
          updatedAt: string;
          value: string;
        };
        Insert: {
          createdAt?: string;
          expiresAt: string;
          id: string;
          identifier: string;
          updatedAt?: string;
          value: string;
        };
        Update: {
          createdAt?: string;
          expiresAt?: string;
          id?: string;
          identifier?: string;
          updatedAt?: string;
          value?: string;
        };
        Relationships: [];
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
