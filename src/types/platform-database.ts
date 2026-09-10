export type PlatformRole =
  | "platform_owner"
  | "platform_administrator"
  | "support_administrator"
  | "billing_administrator"
  | "technical_administrator";

export type PlatformModule = string;

type PlatformTable<Row, Insert = Row> = {
  Row: Row;
  Insert: Insert;
  Update: Partial<Row>;
  Relationships: [];
};

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
           industry: string | null;
           suspended_at: string | null;
           suspension_reason: string | null;
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
           industry?: string | null;
           suspended_at?: string | null;
           suspension_reason?: string | null;
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
           annual_price: number | null;
           archived_at: string | null;
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
           annual_price?: number | null;
           archived_at?: string | null;
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
      platform_organization_features: PlatformTable<{
        organization_id: string;
        module: string;
        enabled: boolean;
        access_mode: "enabled" | "disabled" | "read_only";
        updated_by: string | null;
        updated_at: string;
      }, {
        organization_id: string;
        module: string;
        enabled?: boolean;
        access_mode?: "enabled" | "disabled" | "read_only";
        updated_by?: string | null;
        updated_at?: string;
      }>;
      platform_plan_features: PlatformTable<{
        plan_id: string;
        module: string;
        access_mode: "enabled" | "disabled" | "read_only";
      }, {
        plan_id: string;
        module: string;
        access_mode?: "enabled" | "disabled" | "read_only";
      }>;
      platform_feature_flags: PlatformTable<{
        id: string;
        key: string;
        name: string;
        description: string;
        enabled: boolean;
        scope: "platform" | "plan" | "organization";
        plan_id: string | null;
        organization_id: string | null;
        updated_by: string | null;
        updated_at: string;
      }, {
        id?: string;
        key: string;
        name: string;
        description?: string;
        enabled?: boolean;
        scope?: "platform" | "plan" | "organization";
        plan_id?: string | null;
        organization_id?: string | null;
        updated_by?: string | null;
        updated_at?: string;
      }>;
      platform_approvals: PlatformTable<{
        id: string;
        organization_id: string | null;
        requested_by: string;
        approval_type: string;
        status: "pending" | "approved" | "rejected" | "cancelled";
        payload: Record<string, unknown>;
        reviewed_by: string | null;
        reviewed_at: string | null;
        created_at: string;
      }, {
        id?: string;
        organization_id?: string | null;
        requested_by: string;
        approval_type: string;
        status?: "pending" | "approved" | "rejected" | "cancelled";
        payload?: Record<string, unknown>;
        reviewed_by?: string | null;
        reviewed_at?: string | null;
        created_at?: string;
      }>;
      platform_notifications: PlatformTable<{
        id: string;
        admin_id: string | null;
        severity: "info" | "success" | "warning" | "critical";
        title: string;
        message: string;
        read_at: string | null;
        created_at: string;
      }, {
        id?: string;
        admin_id?: string | null;
        severity?: "info" | "success" | "warning" | "critical";
        title: string;
        message: string;
        read_at?: string | null;
        created_at?: string;
      }>;
      platform_usage_metrics: PlatformTable<{
        organization_id: string;
        active_users: number;
        branches: number;
        products: number;
        customers: number;
        orders: number;
        sales_volume: number;
        storage_used_gb: number;
        ai_usage: number;
        api_usage: number;
        monthly_activity: number;
        updated_at: string;
      }>;
      platform_billing_records: PlatformTable<{
        id: string;
        organization_id: string;
        plan_id: string | null;
        invoice_number: string;
        amount: number;
        status: "paid" | "outstanding" | "refunded" | "void";
        issued_at: string;
        due_at: string | null;
        paid_at: string | null;
      }>;
      platform_settings: PlatformTable<{
        key: string;
        value: Record<string, unknown>;
        updated_by: string | null;
        updated_at: string;
      }, {
        key: string;
        value?: Record<string, unknown>;
        updated_by?: string | null;
        updated_at?: string;
      }>;
      platform_security_events: PlatformTable<{
        id: string;
        admin_id: string | null;
        event_type: string;
        email: string | null;
        ip_address: string | null;
        user_agent: string | null;
        metadata: Record<string, unknown>;
        created_at: string;
      }>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
