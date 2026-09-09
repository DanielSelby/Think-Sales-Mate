export type PlatformRole =
  | "platform_owner"
  | "platform_administrator"
  | "support_administrator"
  | "billing_administrator"
  | "technical_administrator";

export interface PlatformDatabase {
  public: {
    Tables: {
      platform_admins: {
        Row: {
          id: string;
          auth_user_id: string;
          email: string;
          display_name: string;
          role: PlatformRole;
          is_active: boolean;
          mfa_required: boolean;
          last_login_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          auth_user_id: string;
          email: string;
          display_name?: string;
          role?: PlatformRole;
          is_active?: boolean;
          mfa_required?: boolean;
          last_login_at?: string | null;
          created_at?: string;
        };
        Update: Partial<PlatformDatabase["public"]["Tables"]["platform_admins"]["Row"]>;
        Relationships: [];
      };
      platform_organizations: {
        Row: {
          id: string;
          organization_id: string;
          name: string;
          plan_id: string | null;
          status: "active" | "trial" | "suspended" | "expired";
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          name: string;
          plan_id?: string | null;
          status?: "active" | "trial" | "suspended" | "expired";
          expires_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<PlatformDatabase["public"]["Tables"]["platform_organizations"]["Row"]>;
        Relationships: [];
      };
      subscription_plans: {
        Row: {
          id: string;
          name: string;
          max_users: number | null;
          max_branches: number | null;
          storage_limit_gb: number | null;
          monthly_price: number;
          ai_access: boolean;
          api_access: boolean;
          included_modules: string[];
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          max_users?: number | null;
          max_branches?: number | null;
          storage_limit_gb?: number | null;
          monthly_price?: number;
          ai_access?: boolean;
          api_access?: boolean;
          included_modules?: string[];
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<PlatformDatabase["public"]["Tables"]["subscription_plans"]["Row"]>;
        Relationships: [];
      };
      platform_audit_logs: {
        Row: {
          id: string;
          admin_id: string | null;
          organization_id: string | null;
          action: string;
          module: string;
          metadata: Record<string, unknown>;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          organization_id?: string | null;
          action: string;
          module: string;
          metadata?: Record<string, unknown>;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: Partial<PlatformDatabase["public"]["Tables"]["platform_audit_logs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
