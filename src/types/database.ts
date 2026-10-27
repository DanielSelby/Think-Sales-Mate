export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";
export type MemberStatus = "invited" | "active" | "suspended";
export type OrgPlan = "trial" | "starter" | "growth" | "enterprise";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type BankAccountType = "cash" | "checking" | "savings" | "mobile_money" | "card" | "other";
export type BankTransactionType = "deposit" | "withdrawal";
export type TransferStatus = "pending" | "in_transit" | "received" | "completed" | "cancelled";
export type StockRequestStatus = "draft" | "pending_approval" | "approved" | "rejected" | "completed";
export type LocationType = "warehouse" | "branch" | "store" | "distribution_center" | "mobile_van";
export type SaleStatus = "completed" | "returned" | "cancelled";
export type PurchaseStatus = "draft" | "ordered" | "partially_received" | "received" | "cancelled";
export type SupplierStatus = "active" | "inactive" | "blacklisted";
export type PurchaseReturnStatus = "draft" | "submitted" | "approved" | "rejected";
export type ExpenseStatus = "pending_approval" | "approved" | "rejected";
export type ExpensePaymentStatus = "unpaid" | "paid";
export type ExpenseCategoryStatus = "active" | "inactive";
export type EmploymentType = "full_time" | "part_time" | "contract" | "intern";
export type PayrollRunStatus = "draft" | "processing" | "completed" | "failed";
export type PayslipStatus = "pending" | "generated" | "archived";
export type PayrollApprovalStatus = "pending" | "approved" | "rejected";
export type AttendanceStatus = "present" | "absent" | "late" | "early_leave" | "on_leave";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type HeldSaleKind = "hold" | "draft";
export type CustomerAccountRequirement = "optional" | "required" | "guest_only";
export type CustomerOrderStatus = "new" | "approved" | "picking" | "packing" | "delivery" | "completed" | "cancelled" | "returned" | "processing" | "reviewed";
export type OrderPaymentStatus = "paid" | "partial" | "unpaid";
export type OrderDeliveryStatus = "not_shipped" | "picking" | "packing" | "in_delivery" | "delivered";
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
          location_id: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      organizations: {
        Row: {
          id: string;
          name: string;
          slug: string;
          plan: OrgPlan;
          currency: string;
          use_system_prices: boolean;
          registration_status: "pending" | "approved" | "rejected" | "suspended";
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: OrgPlan;
          currency?: string;
          use_system_prices?: boolean;
          registration_status?: "pending" | "approved" | "rejected" | "suspended";
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organizations"]["Row"]>;
        Relationships: [];
      };

     organization_members: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          invited_email: string | null;
          role: MemberRole;
          status: MemberStatus;
          location_id: string | null;
          username: string | null;
          employee_id: string | null;
          phone: string | null;
          department: string | null;
          contact_email: string | null;
          branch_scope: "all" | "assigned" | "single";
          secondary_location_ids: string[];
          access_permissions: Record<string, unknown>;
          can_view_other_users_transactions: boolean;
          can_check_cross_branch_stock: boolean;
          must_change_password: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          invited_email?: string | null;
          role?: MemberRole;
          status?: MemberStatus;
          location_id?: string | null;
          username?: string | null;
          employee_id?: string | null;
          phone?: string | null;
          department?: string | null;
          contact_email?: string | null;
          branch_scope?: "all" | "assigned" | "single";
          secondary_location_ids?: string[];
          access_permissions?: Record<string, unknown>;
          can_view_other_users_transactions?: boolean;
          can_check_cross_branch_stock?: boolean;
          must_change_password?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_members"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "organization_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "organization_members_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_product_category_id_fkey";
            columns: ["product_category_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          }
        ];
      };

      organization_registration_attempts: {
        Row: { id: string; user_id: string; ip_hash: string | null; created_at: string };
        Insert: { id?: string; user_id: string; ip_hash?: string | null; created_at?: string };
        Update: Partial<Database["public"]["Tables"]["organization_registration_attempts"]["Row"]>;
        Relationships: [];
      };
      organization_registration_messages: {
        Row: {
          id: string;
          organization_id: string;
          author_user_id: string | null;
          author_type: "owner" | "platform_admin" | "system";
          message: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          organization_id: string;
          author_user_id?: string | null;
          author_type: "owner" | "platform_admin" | "system";
          message: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_registration_messages"]["Row"]>;
        Relationships: [];
      };
      restaurant_menu_categories: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_menu_categories"]["Row"]>;
        Relationships: [];
      };
      restaurant_menu_items: {
        Row: {
          id: string;
          org_id: string;
          category_id: string | null;
          name: string;
          sku: string | null;
          description: string | null;
          image_url: string | null;
          price: number;
          prep_station: "kitchen" | "bar" | "dessert";
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          category_id?: string | null;
          name: string;
          sku?: string | null;
          description?: string | null;
          image_url?: string | null;
          price: number;
          prep_station?: "kitchen" | "bar" | "dessert";
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_menu_items"]["Row"]>;
        Relationships: [];
      };
      restaurant_modifier_groups: {
        Row: {
          id: string;
          org_id: string;
          menu_item_id: string;
          name: string;
          min_selections: number;
          max_selections: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          menu_item_id: string;
          name: string;
          min_selections?: number;
          max_selections?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_modifier_groups"]["Row"]>;
        Relationships: [];
      };
      restaurant_modifier_options: {
        Row: {
          id: string;
          org_id: string;
          group_id: string;
          name: string;
          price_delta: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          group_id: string;
          name: string;
          price_delta?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_modifier_options"]["Row"]>;
        Relationships: [];
      };
      restaurant_tables: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          table_name: string;
          seats: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          table_name: string;
          seats?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_tables"]["Row"]>;
        Relationships: [];
      };
      restaurant_reservations: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          table_id: string | null;
          guest_name: string;
          guest_phone: string;
          party_size: number;
          starts_at: string;
          ends_at: string;
          status: "waitlisted" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
          notes: string | null;
          customer_email: string | null;
          created_by: string | null;
          reservation_source: "staff" | "online";
          customer_confirmation_token: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          table_id?: string | null;
          guest_name: string;
          guest_phone: string;
          party_size: number;
          starts_at: string;
          ends_at: string;
          status?: "waitlisted" | "confirmed" | "seated" | "completed" | "cancelled" | "no_show";
          notes?: string | null;
          customer_email?: string | null;
          created_by?: string | null;
          reservation_source?: "staff" | "online";
          customer_confirmation_token?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_reservations"]["Row"]>;
        Relationships: [];
      };
      restaurant_orders: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          order_number: number;
          order_type: "dine_in" | "takeaway" | "delivery";
          table_id: string | null;
          status: "pending_payment" | "new" | "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled";
          payment_status: "unpaid" | "partial" | "paid";
          customer_email: string | null;
          customer_tracking_token: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          delivery_address: string | null;
          delivery_fee: number;
          notes: string | null;
          order_source: "staff" | "online";
          payment_option: "pay_at_fulfillment" | "paystack";
          subtotal: number;
          total: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          order_number?: number;
          order_type: "dine_in" | "takeaway" | "delivery";
          table_id?: string | null;
          status?: "pending_payment" | "new" | "confirmed" | "preparing" | "ready" | "served" | "completed" | "cancelled";
          payment_status?: "unpaid" | "partial" | "paid";
          customer_email?: string | null;
          customer_tracking_token?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          delivery_address?: string | null;
          delivery_fee?: number;
          notes?: string | null;
          order_source?: "staff" | "online";
          payment_option?: "pay_at_fulfillment" | "paystack";
          subtotal: number;
          total: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_orders"]["Row"]>;
        Relationships: [];
      };
      restaurant_order_items: {
        Row: {
          id: string;
          org_id: string;
          order_id: string;
          menu_item_id: string | null;
          item_name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
          prep_station: "kitchen" | "bar" | "dessert";
          notes: string | null;
          kitchen_status: "new" | "preparing" | "ready" | "served" | "cancelled";
          modifier_selections: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          order_id: string;
          menu_item_id?: string | null;
          item_name: string;
          unit_price: number;
          quantity: number;
          line_total: number;
          prep_station?: "kitchen" | "bar" | "dessert";
          notes?: string | null;
          kitchen_status?: "new" | "preparing" | "ready" | "served" | "cancelled";
          modifier_selections?: Json;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_order_items"]["Row"]>;
        Relationships: [];
      };
      restaurant_order_payments: {
        Row: {
          id: string;
          org_id: string;
          order_id: string;
          bill_id: string;
          amount: number;
          tip_amount: number;
          payment_type: "payment" | "refund";
          refund_of_payment_id: string | null;
          payment_method: "cash" | "card" | "mobile_money" | "other";
          received_by: string | null;
          payment_provider: "paystack" | null;
          payment_reference: string | null;
          paid_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          order_id: string;
          bill_id: string;
          amount: number;
          tip_amount?: number;
          payment_type?: "payment" | "refund";
          refund_of_payment_id?: string | null;
          payment_method: "cash" | "card" | "mobile_money" | "other";
          received_by?: string | null;
          payment_provider?: "paystack" | null;
          payment_reference?: string | null;
          paid_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_order_payments"]["Row"]>;
        Relationships: [];
      };
      restaurant_online_settings: {
        Row: {
          org_id: string;
          location_id: string;
          is_enabled: boolean;
          accepts_pickup: boolean;
          accepts_delivery: boolean;
          delivery_fee: number;
          send_order_emails: boolean;
          accepts_online_reservations: boolean;
          reservation_timezone: string;
          reservation_hours: Json;
          reservation_duration_minutes: number;
          reservation_slot_interval_minutes: number;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          location_id: string;
          is_enabled?: boolean;
          accepts_pickup?: boolean;
          accepts_delivery?: boolean;
          delivery_fee?: number;
          send_order_emails?: boolean;
          accepts_online_reservations?: boolean;
          reservation_timezone?: string;
          reservation_hours?: Json;
          reservation_duration_minutes?: number;
          reservation_slot_interval_minutes?: number;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_online_settings"]["Row"]>;
        Relationships: [];
      };
      restaurant_online_payment_attempts: {
        Row: {
          reference: string;
          org_id: string;
          location_id: string;
          order_id: string;
          confirmation_token: string;
          amount_minor: number;
          currency: "GHS" | "NGN" | "USD" | "ZAR";
          status: "pending" | "successful" | "failed";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          reference: string;
          org_id: string;
          location_id: string;
          order_id: string;
          confirmation_token?: string;
          amount_minor: number;
          currency: "GHS" | "NGN" | "USD" | "ZAR";
          status?: "pending" | "successful" | "failed";
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_online_payment_attempts"]["Row"]>;
        Relationships: [];
      };
      restaurant_bills: {
        Row: {
          id: string;
          org_id: string;
          order_id: string;
          name: string;
          split_type: "single" | "items" | "equal";
          amount: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          order_id: string;
          name: string;
          split_type?: "single" | "items" | "equal";
          amount?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_bills"]["Row"]>;
        Relationships: [];
      };
      restaurant_bill_items: {
        Row: {
          id: string;
          org_id: string;
          bill_id: string;
          order_item_id: string;
          quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          bill_id: string;
          order_item_id: string;
          quantity: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_bill_items"]["Row"]>;
        Relationships: [];
      };
      restaurant_ingredients: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          unit: string;
          cost_per_unit: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          unit: string;
          cost_per_unit?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_ingredients"]["Row"]>;
        Relationships: [];
      };
      restaurant_ingredient_stock: {
        Row: {
          org_id: string;
          location_id: string;
          ingredient_id: string;
          quantity: number;
          minimum_quantity: number;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          location_id: string;
          ingredient_id: string;
          quantity?: number;
          minimum_quantity?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_ingredient_stock"]["Row"]>;
        Relationships: [];
      };
      restaurant_recipe_ingredients: {
        Row: {
          id: string;
          org_id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          menu_item_id: string;
          ingredient_id: string;
          quantity: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_recipe_ingredients"]["Row"]>;
        Relationships: [];
      };
      restaurant_ingredient_movements: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          ingredient_id: string;
          order_id: string | null;
          movement_type: "adjustment" | "consumption";
          quantity_delta: number;
          balance_after: number;
          reason: string;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          ingredient_id: string;
          order_id?: string | null;
          movement_type: "adjustment" | "consumption";
          quantity_delta: number;
          balance_after: number;
          reason: string;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["restaurant_ingredient_movements"]["Row"]>;
        Relationships: [];
      };
      business_locations: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          code: string | null;
          location_type: LocationType;
          manager_name: string | null;
          address: string | null;
          city: string | null;
          region: string | null;
          country: string | null;
          phone: string | null;
          email: string | null;
          is_primary: boolean;
          is_active: boolean;
          customer_portal_enabled: boolean;
          customer_portal_slug: string;
          customer_portal_requires_approval: boolean | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          code?: string | null;
          location_type?: LocationType;
          manager_name?: string | null;
          address?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          phone?: string | null;
          email?: string | null;
          is_primary?: boolean;
          is_active?: boolean;
          customer_portal_enabled?: boolean;
          customer_portal_slug?: string | null;
          customer_portal_requires_approval?: boolean | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["business_locations"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "business_locations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          }
        ];
      };
      product_stock_levels: {
        Row: {
          id: string;
          org_id: string;
          product_id: string;
          location_id: string;
          quantity: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          product_id: string;
          location_id: string;
          quantity?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_stock_levels"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "product_stock_levels_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_stock_levels_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };

      stock_transfers: {
        Row: {
          id: string;
          org_id: string;
          transfer_number: number;
          reference_no: string | null;
          reason: string | null;
          transfer_date: string;
          from_location_id: string;
          to_location_id: string;
          status: TransferStatus;
          notes: string | null;
          created_by: string;
          created_at: string;
          completed_at: string | null;
          received_at: string | null;
          received_by: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          transfer_number?: number;
          reference_no?: string | null;
          reason?: string | null;
          transfer_date?: string;
          from_location_id: string;
          to_location_id: string;
          status?: TransferStatus;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          completed_at?: string | null;
          received_at?: string | null;
          received_by?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["stock_transfers"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "stock_transfers_from_location_id_fkey";
            columns: ["from_location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfers_to_location_id_fkey";
            columns: ["to_location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_transfer_items: {
        Row: {
          id: string;
          transfer_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          transfer_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          unit_cost?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_transfer_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "stock_transfer_items_transfer_id_fkey";
            columns: ["transfer_id"];
            isOneToOne: false;
            referencedRelation: "stock_transfers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_transfer_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_requests: {
        Row: {
          id: string;
          org_id: string;
          request_number: number;
          requested_by: string;
          requesting_location_id: string;
          source_location_id: string;
          status: StockRequestStatus;
          priority: "low" | "normal" | "high" | "urgent";
          expected_delivery_date: string | null;
          reference: string | null;
          notes: string | null;
          rejection_reason: string | null;
          transfer_id: string | null;
          submitted_at: string | null;
          approved_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          request_number?: number;
          requested_by: string;
          requesting_location_id: string;
          source_location_id: string;
          status?: StockRequestStatus;
          priority?: "low" | "normal" | "high" | "urgent";
          expected_delivery_date?: string | null;
          reference?: string | null;
          notes?: string | null;
          rejection_reason?: string | null;
          transfer_id?: string | null;
          submitted_at?: string | null;
          approved_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_requests"]["Row"]>;
        Relationships: [];
      };
      stock_request_items: {
        Row: {
          id: string;
          request_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_request_items"]["Row"]>;
        Relationships: [];
      };
      stock_request_approvals: {
        Row: {
          id: string;
          request_id: string;
          org_id: string;
          approver_id: string;
          decision: "approved" | "rejected";
          comment: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          org_id: string;
          approver_id: string;
          decision: "approved" | "rejected";
          comment?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_request_approvals"]["Row"]>;
        Relationships: [];
      };
      stock_request_timeline: {
        Row: {
          id: string;
          request_id: string;
          org_id: string;
          event: string;
          actor_id: string | null;
          details: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          request_id: string;
          org_id: string;
          event: string;
          actor_id?: string | null;
          details?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_request_timeline"]["Row"]>;
        Relationships: [];
      };
      stock_adjustments: {
        Row: {
          id: string;
          org_id: string;
          adjustment_number: number;
          reference_no: string | null;
          adjustment_date: string;
          location_id: string | null;
          reason: string | null;
          note: string | null;
          created_by: string;
          created_at: string;
          count_type: string;
          resposible_person_id: string;
          status: string;
          adjustment_account: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          adjustment_number?: number;
          reference_no?: string | null;
          adjustment_date?: string;
          location_id?: string | null;
          reason?: string | null;
          note?: string | null;
          created_by: string;
          created_at?: string;
          count_type: string;
          resposible_person_id: string;
          status: string;
          adjustment_account: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_adjustments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      stock_adjustment_items: {
        Row: {
          id: string;
          adjustment_id: string;
          org_id: string;
          product_id: string;
          system_stock: number;
          counted_stock: number;
          unit_cost: number;
          reason: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          adjustment_id: string;
          org_id: string;
          product_id: string;
          system_stock: number;
          counted_stock: number;
          unit_cost?: number;
          reason?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["stock_adjustment_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "stock_adjustment_items_adjustment_id_fkey";
            columns: ["adjustment_id"];
            isOneToOne: false;
            referencedRelation: "stock_adjustments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_adjustment_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };

      product_import_batches: {
        Row: {
          id: string;
          org_id: string;
          file_name: string;
          total_rows: number;
          imported_count: number;
          updated_count: number;
          skipped_count: number;
          error_count: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          file_name: string;
          total_rows?: number;
          imported_count?: number;
          updated_count?: number;
          skipped_count?: number;
          error_count?: number;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_import_batches"]["Row"]>;
        Relationships: [];
      };

      currencies: {
        Row: {
          id: string;
          org_id: string;
          code: string;
          name: string;
          symbol: string;
          exchange_rate_to_base: number;
          is_active: boolean;
          is_default: boolean;
          is_base: boolean;
          last_updated_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          code: string;
          name: string;
          symbol: string;
          exchange_rate_to_base?: number;
          is_active?: boolean;
          is_default?: boolean;
          is_base?: boolean;
          last_updated_at?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["currencies"]["Row"]>;
        Relationships: [];
      };
      currency_settings: {
        Row: {
          org_id: string;
          exchange_rate_source: "manual" | "frankfurter";
          rate_update_frequency: "manual" | "hourly" | "daily" | "weekly";
          decimal_places: number;
          rounding_mode: "none" | "nearest_1" | "nearest_5" | "nearest_10" | "nearest_100";
          multi_currency_enabled: boolean;
          home_currency_display: boolean;
          exchange_rate_on_transaction: boolean;
          revaluation_enabled: boolean;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          exchange_rate_source?: "manual" | "frankfurter";
          rate_update_frequency?: "manual" | "hourly" | "daily" | "weekly";
          decimal_places?: number;
          rounding_mode?: "none" | "nearest_1" | "nearest_5" | "nearest_10" | "nearest_100";
          multi_currency_enabled?: boolean;
          home_currency_display?: boolean;
          exchange_rate_on_transaction?: boolean;
          revaluation_enabled?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["currency_settings"]["Row"]>;
        Relationships: [];
      };

      company_profile: {
        Row: {
          org_id: string;
          company_name: string | null;
          registration_no: string | null;
          business_email: string | null;
          business_phone: string | null;
          whatsapp_business_number: string | null;
          customer_portal_whatsapp_message: string | null;
          website: string | null;
          tin: string | null;
          description: string | null;
          logo_url: string | null;
          customer_portal_hero_url: string | null;
          country: string | null;
          address_line1: string | null;
          address_line2: string | null;
          city: string | null;
          postcode: string | null;
          region: string | null;
          contact_name: string | null;
          contact_designation: string | null;
          contact_email: string | null;
          contact_phone: string | null;
          default_sales_tax_percent: number;
          show_logo_on_invoices: boolean;
          show_contact_on_invoices: boolean;
          sales_invoice_template: "standard" | "think-sales" | "retail";
          invoice_slogan: string | null;
          invoice_thank_you_message: string | null;
          invoice_terms_and_conditions: string | null;
          show_info_on_receipts: boolean;
          enable_barcode_on_documents: boolean;
          facebook_url: string | null;
          twitter_url: string | null;
          linkedin_url: string | null;
          youtube_url: string | null;
          vat_number: string | null;
          business_type: string | null;
          industry: string | null;
          postal_address: string | null;
          stamp_url: string | null;
          signature_url: string | null;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          company_name?: string | null;
          registration_no?: string | null;
          business_email?: string | null;
          business_phone?: string | null;
          whatsapp_business_number?: string | null;
          customer_portal_whatsapp_message?: string | null;
          website?: string | null;
          tin?: string | null;
          description?: string | null;
          logo_url?: string | null;
          customer_portal_hero_url?: string | null;
          country?: string | null;
          address_line1?: string | null;
          address_line2?: string | null;
          city?: string | null;
          postcode?: string | null;
          region?: string | null;
          contact_name?: string | null;
          contact_designation?: string | null;
          contact_email?: string | null;
          contact_phone?: string | null;
          default_sales_tax_percent?: number;
          show_logo_on_invoices?: boolean;
          show_contact_on_invoices?: boolean;
          sales_invoice_template?: "standard" | "think-sales" | "retail";
          invoice_slogan?: string | null;
          invoice_thank_you_message?: string | null;
          invoice_terms_and_conditions?: string | null;
          show_info_on_receipts?: boolean;
          enable_barcode_on_documents?: boolean;
          facebook_url?: string | null;
          twitter_url?: string | null;
          linkedin_url?: string | null;
          youtube_url?: string | null;
          vat_number?: string | null;
          business_type?: string | null;
          industry?: string | null;
          postal_address?: string | null;
          stamp_url?: string | null;
          signature_url?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["company_profile"]["Row"]>;
        Relationships: [];
      };

      org_general_settings: {
        Row: {
          org_id: string;
          business_short_name: string | null;
          default_language: string;
          timezone: string;
          date_format: string;
          time_format: "12h" | "24h";
          financial_year_start: string;
          default_tax_rate: number;
          enable_barcode_scanning: boolean;
          enable_notifications: boolean;
          enable_email_alerts: boolean;
          session_timeout_minutes: number;
          auto_logout_minutes: number;
          default_landing_page: string;
           offline_enabled: boolean;
           offline_sync_mode: "automatic" | "approval" | "manual";
           offline_data_load_mode: "automatic" | "approval" | "manual";
           block_credit_limit_exceeded: boolean;
           updated_at: string;
        };
        Insert: {
          org_id: string;
          business_short_name?: string | null;
          default_language?: string;
          timezone?: string;
          date_format?: string;
          time_format?: "12h" | "24h";
          financial_year_start?: string;
          default_tax_rate?: number;
          enable_barcode_scanning?: boolean;
          enable_notifications?: boolean;
          enable_email_alerts?: boolean;
          session_timeout_minutes?: number;
          auto_logout_minutes?: number;
          default_landing_page?: string;
          offline_enabled?: boolean;
          offline_sync_mode?: "automatic" | "approval" | "manual";
          offline_data_load_mode?: "automatic" | "approval" | "manual";
          block_credit_limit_exceeded?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_general_settings"]["Row"]>;
        Relationships: [];
      };

      generated_reports: {
        Row: {
          id: string;
          org_id: string;
          report_name: string;
          report_type: string;
          format: "pdf" | "excel" | "csv";
          generated_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          report_name: string;
          report_type: string;
          format: "pdf" | "excel" | "csv";
          generated_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["generated_reports"]["Row"]>;
        Relationships: [];
      };

      customer_credit_payments: {
        Row: {
          id: string;
          org_id: string;
          customer_id: string | null;
          invoice_id: string;
          amount: number;
          payment_method: string;
          payment_date: string;
          location_id: string | null;
          invoice_location_id: string | null;
          recorded_by: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          customer_id?: string | null;
          invoice_id: string;
          amount: number;
          payment_method: string;
          payment_date?: string;
          location_id?: string | null;
          invoice_location_id?: string | null;
          recorded_by: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_credit_payments"]["Row"]>;
        Relationships: [];
      };

      audit_logs: {
        Row: {
          id: string;
          org_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["audit_logs"]["Row"]>;
        Relationships: [];
      };

     products: {
        Row: {
          id: string;
          org_id: string;
          sku: string;
          name: string;
          description: string | null;
          category: string | null;
          product_category_id: string | null;
          brand: string | null;
          supplier: string | null;
          barcode: string | null;
          location_id: string | null;
          unit_price: number;
          cost_price: number | null;
          stock_quantity: number;
          low_stock_threshold: number;
          unit: string;
          is_active: boolean;
          product_type: "standard" | "service" | "digital";
          is_imported: boolean;
          hsn_code: string | null;
          tax_rate: number | null;
          expiry_date: string | null;
          warranty_months: number | null;
          wholesale_price: number | null;
          vip_price: number | null;
          special_price: number | null;
          mrp: number | null;
          track_inventory: boolean;
          allow_sale: boolean;
          allow_purchase: boolean;
          allow_negative_stock: boolean;
          has_variants: boolean;
          tags: string[];
          image_urls: string[];
          status: "active" | "inactive" | "merged";
          merged_into_product_id: string | null;
          merged_at: string | null;
          merged_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sku?: string;
          name: string;
          description?: string | null;
          category?: string | null;
          product_category_id?: string | null;
          brand?: string | null;
          supplier?: string | null;
          barcode?: string | null;
          location_id?: string | null;
          unit_price?: number;
          cost_price?: number | null;
          stock_quantity?: number;
          low_stock_threshold?: number;
          unit?: string;
          is_active?: boolean;
          product_type?: "standard" | "service" | "digital";
          is_imported?: boolean;
          hsn_code?: string | null;
          tax_rate?: number | null;
          expiry_date?: string | null;
          warranty_months?: number | null;
          wholesale_price?: number | null;
          vip_price?: number | null;
          special_price?: number | null;
          mrp?: number | null;
          track_inventory?: boolean;
          allow_sale?: boolean;
          allow_purchase?: boolean;
          allow_negative_stock?: boolean;
          has_variants?: boolean;
          tags?: string[];
          image_urls?: string[];
          status?: "active" | "inactive" | "merged";
          merged_into_product_id?: string | null;
          merged_at?: string | null;
          merged_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["products"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "products_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      sales: {
        Row: {
          id: string;
          org_id: string;
          sale_number: number;
          offline_operation_id: string | null;
          offline_sync_completed_at: string | null;
          document_status?:"draft" | "quotation" | "proforma" | "final";
          customer_name: string | null;
          customer_id: string | null;
          location_id: string | null;
          register_session_id: string | null;
          reference: string | null;
          sale_date: string;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          shipping_amount: number;
          total: number;
          payment_method: string | null;
          amount_paid: number | null;
          due_date: string | null;
          sold_by: string;
          status: SaleStatus;
          refunded_amount: number;
          refund_payment_method: string | null;
          refund_register_session_id: string | null;
          status_note: string | null;
          status_changed_by: string | null;
          status_changed_at: string;
          created_at: string;
          
        };
        Insert: {
          id?: string;
          org_id: string;
          sale_number?: number;
          offline_operation_id?: string | null;
          offline_sync_completed_at?: string | null;
          document_status?:"draft" | "quotation" | "proforma" | "final";
          customer_name?: string | null;
          customer_id?: string | null;
          location_id?: string | null;
          register_session_id?: string | null;
          reference?: string | null;
          sale_date?: string;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          shipping_amount?: number;
          total?: number;
          payment_method?: string | null;
          amount_paid?: number | null;
          due_date?: string | null;
          sold_by: string;
          status?: SaleStatus;
          refunded_amount?: number;
          refund_payment_method?: string | null;
          refund_register_session_id?: string | null;
          status_note?: string | null;
          status_changed_by?: string | null;
          status_changed_at?: string;
          created_at?: string;
          
        };
        Update: Partial<Database["public"]["Tables"]["sales"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_status_changed_by_fkey";
            columns: ["status_changed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      sale_items: {
        Row: {
          id: string;
          sale_id: string;
          product_id: string;
          org_id: string;
          quantity: number;
          unit_price: number;
          discount_percent: number;
          tax_percent: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          sale_id: string;
          product_id: string;
          org_id: string;
          quantity: number;
          unit_price: number;
          discount_percent?: number;
          tax_percent?: number;
          line_total: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      sale_return_items: {
        Row: {
          id: string;
          org_id: string;
          sale_id: string;
          sale_item_id: string;
          product_id: string;
          quantity: number;
          unit_cost: number | null;
          location_id: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sale_id: string;
          sale_item_id: string;
          product_id: string;
          quantity: number;
          unit_cost?: number | null;
          location_id?: string | null;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_return_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "sale_return_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_return_items_sale_item_id_fkey";
            columns: ["sale_item_id"];
            isOneToOne: false;
            referencedRelation: "sale_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_return_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      suppliers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          contact_person: string | null;
          phone: string | null;
          email: string | null;
          payment_terms: string | null;
          currency: string;
          address: string | null;
          category: string | null;
          country: string | null;
          status: SupplierStatus;
          is_active: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          contact_person?: string | null;
          phone?: string | null;
          email?: string | null;
          payment_terms?: string | null;
          currency?: string;
          address?: string | null;
          category?: string | null;
          country?: string | null;
          status?: SupplierStatus;
          is_active?: boolean;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["suppliers"]["Row"]>;
        Relationships: [];
      };
      purchases: {
        Row: {
          id: string;
          org_id: string;
          purchase_number: number;
          supplier_id: string;
          status: PurchaseStatus;
          purchase_date: string;
          expected_delivery_date: string | null;
          reference: string | null;
          invoice_number: string | null;
          shipping_method: string | null;
          project_id: string | null;
          location_id: string;
          delivery_address: string | null;
          delivery_notes: string | null;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          shipping_cost: number;
          total: number;
          paid_amount: number;
          payment_method: string | null;
          payment_account: string | null;
          payment_account_id: string | null;
          pay_from_account: string | null;
          purchase_note: string | null;
          internal_note: string | null;
          received_at: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          purchase_number?: number;
          supplier_id: string;
          status?: PurchaseStatus;
          purchase_date?: string;
          expected_delivery_date?: string | null;
          reference?: string | null;
          invoice_number?: string | null;
          shipping_method?: string | null;
          project_id?: string | null;
          location_id: string;
          delivery_address?: string | null;
          delivery_notes?: string | null;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          shipping_cost?: number;
          total?: number;
          paid_amount?: number;
          payment_method?: string | null;
          payment_account?: string | null;
          payment_account_id?: string | null;
          pay_from_account?: string | null;
          purchase_note?: string | null;
          internal_note?: string | null;
          received_at?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchases"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "purchases_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchases_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          }
        ];
      };
      purchase_items: {
        Row: {
          id: string;
          purchase_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          quantity_received: number;
          unit: string;
          unit_price: number;
          discount_percent: number;
          tax_percent: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          purchase_id: string;
          org_id: string;
          product_id: string;
          quantity: number;
          quantity_received?: number;
          unit?: string;
          unit_price: number;
          discount_percent?: number;
          tax_percent?: number;
          line_total: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "purchase_items_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      branch_product_returns: {
        Row: {
          id: string;
          org_id: string;
          return_number: number;
          source_location_id: string;
          destination_location_id: string;
          return_date: string;
          requested_by: string;
          created_by: string;
          status: string;
          return_reason: string;
          priority: string;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          return_number?: number;
          source_location_id: string;
          destination_location_id: string;
          return_date?: string;
          requested_by: string;
          created_by: string;
          status?: string;
          return_reason: string;
          priority?: string;
          notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branch_product_returns"]["Row"]>;
        Relationships: [];
      };
      branch_product_return_items: {
        Row: {
          id: string;
          org_id: string;
          return_id: string;
          product_id: string;
          return_qty: number;
          unit_cost: number;
          return_value: number;
          condition: string;
          return_reason: string;
          inspection_notes: string | null;
          original_transfer_id: string | null;
          supplier_id: string | null;
          purchase_id: string | null;
          purchase_item_id: string | null;
          supplier_accepted_qty: number | null;
          supplier_rejected_qty: number | null;
          supplier_response_notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          return_id: string;
          product_id: string;
          return_qty: number;
          unit_cost: number;
          return_value: number;
          condition: string;
          return_reason: string;
          inspection_notes?: string | null;
          original_transfer_id?: string | null;
          supplier_id?: string | null;
          purchase_id?: string | null;
          purchase_item_id?: string | null;
          supplier_accepted_qty?: number | null;
          supplier_rejected_qty?: number | null;
          supplier_response_notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branch_product_return_items"]["Row"]>;
        Relationships: [];
      };
      branch_product_return_consolidations: {
        Row: {
          id: string;
          org_id: string;
          consolidation_number: number;
          supplier_id: string;
          purchase_id: string;
          status: string;
          purchase_return_id: string | null;
          supplier_accepted_qty: number | null;
          supplier_rejected_qty: number | null;
          supplier_response_notes: string | null;
          supplier_responded_by: string | null;
          supplier_responded_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          consolidation_number?: number;
          supplier_id: string;
          purchase_id: string;
          status?: string;
          purchase_return_id?: string | null;
          supplier_accepted_qty?: number | null;
          supplier_rejected_qty?: number | null;
          supplier_response_notes?: string | null;
          supplier_responded_by?: string | null;
          supplier_responded_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branch_product_return_consolidations"]["Row"]>;
        Relationships: [];
      };
      branch_product_return_consolidation_items: {
        Row: {
          consolidation_id: string;
          return_item_id: string;
          org_id: string;
          created_at: string;
        };
        Insert: {
          consolidation_id: string;
          return_item_id: string;
          org_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branch_product_return_consolidation_items"]["Row"]>;
        Relationships: [];
      };
      branch_product_return_attachments: {
        Row: {
          id: string;
          org_id: string;
          return_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          file_size: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          return_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          file_size: number;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["branch_product_return_attachments"]["Row"]>;
        Relationships: [];
      };
      purchase_returns: {
        Row: {
          id: string;
          org_id: string;
          return_number: number;
          purchase_id: string;
          supplier_id: string;
          location_id: string;
          status: PurchaseReturnStatus;
          return_date: string;
          return_reason: string | null;
          invoice_number: string | null;
          reference: string | null;
          notes: string | null;
          internal_notes: string | null;
          payment_status: string | null;
          refund_method: string | null;
          payment_account: string | null;
          refund_status: string;
          restocking_fee: number;
          tax_adjustment: number;
          total_return_value: number;
          refund_amount: number;
          approved_at: string | null;
          approved_by: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          return_number?: number;
          purchase_id: string;
          supplier_id: string;
          location_id: string;
          status?: PurchaseReturnStatus;
          return_date?: string;
          return_reason?: string | null;
          invoice_number?: string | null;
          reference?: string | null;
          notes?: string | null;
          internal_notes?: string | null;
          payment_status?: string | null;
          refund_method?: string | null;
          payment_account?: string | null;
          refund_status?: string;
          restocking_fee?: number;
          tax_adjustment?: number;
          total_return_value?: number;
          refund_amount?: number;
          approved_at?: string | null;
          approved_by?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_returns"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "purchase_returns_purchase_id_fkey";
            columns: ["purchase_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey";
            columns: ["supplier_id"];
            isOneToOne: false;
            referencedRelation: "suppliers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_returns_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      purchase_return_items: {
        Row: {
          id: string;
          return_id: string;
          org_id: string;
          purchase_item_id: string;
          product_id: string;
          batch_serial: string | null;
          purchased_qty: number;
          return_qty: number;
          unit_cost: number;
          return_value: number;
          return_reason: string | null;
          condition: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          return_id: string;
          org_id: string;
          purchase_item_id: string;
          product_id: string;
          batch_serial?: string | null;
          purchased_qty: number;
          return_qty: number;
          unit_cost?: number;
          return_value?: number;
          return_reason?: string | null;
          condition?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["purchase_return_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_return_id_fkey";
            columns: ["return_id"];
            isOneToOne: false;
            referencedRelation: "purchase_returns";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_return_items_purchase_item_id_fkey";
            columns: ["purchase_item_id"];
            isOneToOne: false;
            referencedRelation: "purchase_items";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "purchase_return_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      expenses: {
        Row: {
          id: string;
          org_id: string;
          expense_number: number;
          category: string;
          vendor: string | null;
          description: string | null;
          amount: number;
          expense_date: string;
          payment_method: string | null;
          payment_account: string | null;
          payment_account_id: string | null;
          status: ExpenseStatus;
          payment_status: ExpensePaymentStatus;
          paid_on: string | null;
          due_date: string | null;
          department: string | null;
          location_id: string | null;
          approved_by: string | null;
          approved_at: string | null;
          is_recurring: boolean;
          recurring_frequency: string | null;
          next_recurrence_date: string | null;
          parent_expense_id: string | null;
          reference_number: string | null;
          purchase_order_id: string | null;
          currency: string | null;
          tags: string[];
          expense_type: string | null;
          approver_id: string | null;
          approval_required: boolean;
          transaction_reference: string | null;
          discount_amount: number;
          recorded_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          expense_number?: number;
          category: string;
          vendor?: string | null;
          description?: string | null;
          amount: number;
          expense_date?: string;
          payment_method?: string | null;
          payment_account?: string | null;
          payment_account_id?: string | null;
          status?: ExpenseStatus;
          payment_status?: ExpensePaymentStatus;
          paid_on?: string | null;
          due_date?: string | null;
          department?: string | null;
          location_id?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          is_recurring?: boolean;
          recurring_frequency?: string | null;
          next_recurrence_date?: string | null;
          parent_expense_id?: string | null;
          reference_number?: string | null;
          purchase_order_id?: string | null;
          currency?: string | null;
          tags?: string[];
          expense_type?: string | null;
          approver_id?: string | null;
          approval_required?: boolean;
          transaction_reference?: string | null;
          discount_amount?: number;
          recorded_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expenses"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "expenses_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_payment_account_id_fkey";
            columns: ["payment_account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_parent_expense_id_fkey";
            columns: ["parent_expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_purchase_order_id_fkey";
            columns: ["purchase_order_id"];
            isOneToOne: false;
            referencedRelation: "purchases";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_approver_id_fkey";
            columns: ["approver_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      expense_items: {
        Row: {
          id: string;
          expense_id: string;
          org_id: string;
          description: string;
          category: string | null;
          quantity: number;
          unit_cost: number;
          tax_amount: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          expense_id: string;
          org_id: string;
          description: string;
          category?: string | null;
          quantity?: number;
          unit_cost?: number;
          tax_amount?: number;
          line_total?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expense_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "expense_items_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          }
        ];
      };
      expense_attachments: {
        Row: {
          id: string;
          org_id: string;
          expense_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          file_size: number;
          uploaded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          expense_id: string;
          storage_path: string;
          file_name: string;
          content_type: string;
          file_size: number;
          uploaded_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expense_attachments"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "expense_attachments_expense_id_fkey";
            columns: ["expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          }
        ];
      };
      expense_categories: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          icon: string;
          color: string;
          description: string | null;
          department: string | null;
          budget_limit: number | null;
          status: ExpenseCategoryStatus;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          icon?: string;
          color?: string;
          description?: string | null;
          department?: string | null;
          budget_limit?: number | null;
          status?: ExpenseCategoryStatus;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expense_categories"]["Row"]>;
        Relationships: [];
      };
      expense_budgets: {
        Row: {
          id: string;
          org_id: string;
          category: string;
          monthly_limit: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          category: string;
          monthly_limit: number;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["expense_budgets"]["Row"]>;
        Relationships: [];
      };
      invoices: {
        Row: {
          id: string;
          org_id: string;
          invoice_number: number;
          customer_name: string;
          amount: number;
          status: InvoiceStatus;
          due_date: string;
          paid_at: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          invoice_number?: number;
          customer_name: string;
          amount: number;
          status?: InvoiceStatus;
          due_date: string;
          paid_at?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["invoices"]["Row"]>;
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          email: string | null;
          phone: string | null;
          company: string | null;
          notes: string | null;
          credit_limit: number | null;
          payment_terms_days: number;
          contact_type: string;
          alternate_phone: string | null;
          landline: string | null;
          contact_id: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          email?: string | null;
          phone?: string | null;
          company?: string | null;
          notes?: string | null;
          credit_limit?: number | null;
          payment_terms_days?: number;
          contact_type?: string;
          alternate_phone?: string | null;
          landline?: string | null;
          contact_id?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customers"]["Row"]>;
        Relationships: [];
      };

      employees: {
        Row: {
          id: string;
          org_id: string;
          employee_number: number;
          full_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
          department: string | null;
          location_id: string | null;
          avatar_url: string | null;
          employment_type: EmploymentType;
          monthly_salary: number;
          hire_date: string;
          status: "active" | "inactive";
          on_leave_until: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_number?: number;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          job_title?: string | null;
          department?: string | null;
          location_id?: string | null;
          avatar_url?: string | null;
          employment_type?: EmploymentType;
          monthly_salary: number;
          hire_date?: string;
          status?: "active" | "inactive";
          on_leave_until?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["employees"]["Row"]>;
        Relationships: [];
      };
      payroll_runs: {
        Row: {
          id: string;
          org_id: string;
          period_label: string;
          period_month: string;
          status: PayrollRunStatus;
          approval_status: PayrollApprovalStatus;
          approved_by: string | null;
          approved_at: string | null;
          payroll_type: string | null;
          pay_period_start: string | null;
          pay_period_end: string | null;
          payment_date: string | null;
          total_amount: number;
          gross_pay: number;
          deductions: number;
          allowances: number;
          employer_cost: number;
          net_pay: number;
          employee_count: number;
          expense_id: string | null;
          processed_by: string | null;
          processed_at: string | null;
          run_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          period_label: string;
          period_month: string;
          status?: PayrollRunStatus;
          approval_status?: PayrollApprovalStatus;
          approved_by?: string | null;
          approved_at?: string | null;
          payroll_type?: string | null;
          pay_period_start?: string | null;
          pay_period_end?: string | null;
          payment_date?: string | null;
          total_amount: number;
          gross_pay?: number;
          deductions?: number;
          allowances?: number;
          employer_cost?: number;
          net_pay?: number;
          employee_count: number;
          expense_id?: string | null;
          processed_by?: string | null;
          processed_at?: string | null;
          run_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_runs"]["Row"]>;
        Relationships: [];
      };
      payroll_run_items: {
        Row: {
          id: string;
          payroll_run_id: string;
          org_id: string;
          employee_id: string | null;
          employee_name: string;
          basic_pay: number;
          deductions: number;
          net_pay: number;
          amount: number;
          allowances: number;
          overtime: number;
          bonus: number;
          tax: number;
          ssnit: number;
          payment_status: "pending" | "partially_paid" | "paid";
          paid_at: string | null;
          paid_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          payroll_run_id: string;
          org_id: string;
          employee_id?: string | null;
          employee_name: string;
          basic_pay?: number;
          deductions?: number;
          net_pay?: number;
          amount: number;
          allowances?: number;
          overtime?: number;
          bonus?: number;
          tax?: number;
          ssnit?: number;
          payment_status?: "pending" | "partially_paid" | "paid";
          paid_at?: string | null;
          paid_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_run_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "payroll_run_items_payroll_run_id_fkey";
            columns: ["payroll_run_id"];
            isOneToOne: false;
            referencedRelation: "payroll_runs";
            referencedColumns: ["id"];
          }
        ];
      };
      payroll_approval_history: {
        Row: {
          id: string;
          org_id: string;
          payroll_run_id: string;
          actor_id: string | null;
          action: "draft" | "submitted" | "approved" | "rejected" | "paid";
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          payroll_run_id: string;
          actor_id?: string | null;
          action: "draft" | "submitted" | "approved" | "rejected" | "paid";
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payroll_approval_history"]["Row"]>;
        Relationships: [];
      };
      payslips: {
        Row: {
          id: string;
          org_id: string;
          payroll_run_id: string;
          payroll_run_item_id: string;
          employee_id: string | null;
          employee_name: string;
          employee_number: number | null;
          department: string | null;
          job_title: string | null;
          location_id: string | null;
          employment_type: EmploymentType | null;
          hire_date: string | null;
          period_label: string;
          pay_period_start: string;
          pay_period_end: string;
          payment_date: string;
          payment_method: string | null;
          bank_name: string | null;
          account_number: string | null;
          mobile_money_number: string | null;
          payment_reference: string | null;
          currency: string;
          payroll_reference: string;
          earnings: Array<{ description: string; amount: number }>;
          deductions: Array<{ description: string; amount: number }>;
          total_earnings: number;
          total_deductions: number;
          net_pay: number;
          notes: string | null;
          status: PayslipStatus;
          generated_at: string;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          payroll_run_id: string;
          payroll_run_item_id: string;
          employee_id?: string | null;
          employee_name: string;
          employee_number?: number | null;
          department?: string | null;
          job_title?: string | null;
          location_id?: string | null;
          employment_type?: EmploymentType | null;
          hire_date?: string | null;
          period_label: string;
          pay_period_start: string;
          pay_period_end: string;
          payment_date: string;
          payment_method?: string | null;
          bank_name?: string | null;
          account_number?: string | null;
          mobile_money_number?: string | null;
          payment_reference?: string | null;
          currency?: string;
          payroll_reference: string;
          earnings?: Array<{ description: string; amount: number }>;
          deductions?: Array<{ description: string; amount: number }>;
          total_earnings?: number;
          total_deductions?: number;
          net_pay?: number;
          notes?: string | null;
          status?: PayslipStatus;
          generated_at?: string;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payslips"]["Row"]>;
        Relationships: [];
      };
      payslip_events: {
        Row: {
          id: string;
          org_id: string;
          payslip_id: string;
          actor_id: string | null;
          event_type: "generated" | "viewed" | "downloaded" | "printed" | "emailed" | "regenerated";
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          payslip_id: string;
          actor_id?: string | null;
          event_type: "generated" | "viewed" | "downloaded" | "printed" | "emailed" | "regenerated";
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["payslip_events"]["Row"]>;
        Relationships: [];
      };
      attendance_records: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          work_date: string;
          check_in: string | null;
          check_out: string | null;
          status: AttendanceStatus;
          work_type: string;
          total_hours: number;
          overtime_hours: number;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          work_date: string;
          check_in?: string | null;
          check_out?: string | null;
          status?: AttendanceStatus;
          work_type?: string;
          total_hours?: number;
          overtime_hours?: number;
          notes?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["attendance_records"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "attendance_records_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      leave_types: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          color: string;
          is_paid: boolean;
          default_annual_days: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          color?: string;
          is_paid?: boolean;
          default_annual_days?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_types"]["Row"]>;
        Relationships: [];
      };
      leave_requests: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          duration_days: number;
          reason: string | null;
          status: LeaveStatus;
          applied_on: string;
          decided_by: string | null;
          decided_at: string | null;
          decision_note: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          leave_type_id: string;
          start_date: string;
          end_date: string;
          duration_days: number;
          reason?: string | null;
          status?: LeaveStatus;
          applied_on?: string;
          decided_by?: string | null;
          decided_at?: string | null;
          decision_note?: string | null;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_requests"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "leave_requests_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "leave_requests_leave_type_id_fkey";
            columns: ["leave_type_id"];
            isOneToOne: false;
            referencedRelation: "leave_types";
            referencedColumns: ["id"];
          }
        ];
      };
      leave_balances: {
        Row: {
          id: string;
          org_id: string;
          employee_id: string;
          year: number;
          allocated_days: number;
          used_days: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          employee_id: string;
          year: number;
          allocated_days?: number;
          used_days?: number;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leave_balances"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "leave_balances_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          }
        ];
      };
      held_sales: {
        Row: {
          id: string;
          org_id: string;
          location_id: string | null;
          kind: HeldSaleKind;
          customer_id: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          order_note: string | null;
          items: unknown;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          total: number;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id?: string | null;
          kind?: HeldSaleKind;
          customer_id?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          order_note?: string | null;
          items?: unknown;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          total?: number;
          created_by?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["held_sales"]["Row"]>;
        Relationships: [];
      };
      register_closures: {
        Row: {
          id: string;
          org_id: string;
          location_id: string | null;
          register_session_id: string | null;
          scope: "all" | "individual";
          cashier_id: string | null;
          cashier_name: string | null;
          period_start: string;
          period_end: string;
          sales_count: number;
          sales_total: number;
          cash_total: number;
          cash_in: number;
          cash_out: number;
          card_total: number;
          momo_total: number;
          other_total: number;
          expenses_total: number;
          net_total: number;
          actual_cash: number | null;
          opening_cash: number;
          variance: number | null;
          variance_reason: string | null;
          status: "approved" | "pending_approval" | "rejected" | "reopened";
          approved_by: string | null;
          approved_at: string | null;
          closed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id?: string | null;
          register_session_id?: string | null;
          scope?: "all" | "individual";
          cashier_id?: string | null;
          cashier_name?: string | null;
          period_start: string;
          period_end: string;
          sales_count?: number;
          sales_total?: number;
          cash_total?: number;
          cash_in?: number;
          cash_out?: number;
          card_total?: number;
          momo_total?: number;
          other_total?: number;
          expenses_total?: number;
          net_total?: number;
          actual_cash?: number | null;
          opening_cash?: number;
          variance?: number | null;
          variance_reason?: string | null;
          status?: "approved" | "pending_approval" | "rejected" | "reopened";
          approved_by?: string | null;
          approved_at?: string | null;
          closed_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["register_closures"]["Row"]>;
        Relationships: [];
      };
      pos_register_sessions: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          cashier_id: string;
          cashier_name: string | null;
          register_name: string;
          shift: string | null;
          opening_cash: number;
          notes: string | null;
          status: "open" | "closed";
          opened_at: string;
          closed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          cashier_id: string;
          cashier_name?: string | null;
          register_name?: string;
          shift?: string | null;
          opening_cash?: number;
          notes?: string | null;
          status?: "open" | "closed";
          opened_at?: string;
          closed_at?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pos_register_sessions"]["Row"]>;
        Relationships: [];
      };
      pos_cash_movements: {
        Row: {
          id: string;
          org_id: string;
          location_id: string;
          register_session_id: string;
          movement_type: "cash_in" | "cash_out" | "paid_out";
          amount: number;
          reason: string;
          reference: string | null;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id: string;
          register_session_id: string;
          movement_type: "cash_in" | "cash_out" | "paid_out";
          amount: number;
          reason: string;
          reference?: string | null;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["pos_cash_movements"]["Row"]>;
        Relationships: [];
      };
      customer_portal_settings: {
        Row: {
          id: string;
          org_id: string;
          portal_theme: "light" | "dark";
          portal_color_theme: "green" | "navy" | "teal" | "plum" | "fintech" | "royal" | "harvest" | "eclipse";
          is_enabled: boolean;
          branch_storefronts_enabled: boolean;
          schedule_enabled: boolean;
          active_from: string;
          active_until: string;
          schedule_timezone: string;
          account_requirement: CustomerAccountRequirement;
          require_approval_before_processing: boolean;
          allow_customer_select_delivery: boolean;
          standard_delivery_fee: number;
          express_delivery_fee: number;
          pickup_delivery_fee: number;
          allow_order_notes: boolean;
          allow_view_order_status: boolean;
          allow_create_account: boolean;
          require_email_verification: boolean;
          show_prices_to_customers: boolean;
          allow_customer_location_selection: boolean;
          allow_guest_orders: boolean;
          require_customer_account: boolean;
          auto_reserve_stock_on_approval: boolean;
          send_email_notifications: boolean;
          send_whatsapp_notifications: boolean;
          allow_customer_invoice_download: boolean;
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          portal_theme?: "light" | "dark";
          portal_color_theme?: "green" | "navy" | "teal" | "plum" | "fintech" | "royal" | "harvest" | "eclipse";
          is_enabled?: boolean;
          branch_storefronts_enabled?: boolean;
          schedule_enabled?: boolean;
          active_from?: string;
          active_until?: string;
          schedule_timezone?: string;
          account_requirement?: CustomerAccountRequirement;
          require_approval_before_processing?: boolean;
          allow_customer_select_delivery?: boolean;
          standard_delivery_fee?: number;
          express_delivery_fee?: number;
          pickup_delivery_fee?: number;
          allow_order_notes?: boolean;
          allow_view_order_status?: boolean;
          allow_create_account?: boolean;
          require_email_verification?: boolean;
          show_prices_to_customers?: boolean;
          allow_customer_location_selection?: boolean;
          allow_guest_orders?: boolean;
          require_customer_account?: boolean;
          auto_reserve_stock_on_approval?: boolean;
          send_email_notifications?: boolean;
          send_whatsapp_notifications?: boolean;
          allow_customer_invoice_download?: boolean;
          updated_by?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_portal_settings"]["Row"]>;
        Relationships: [];
      };
      customer_orders: {
        Row: {
          id: string;
          org_id: string;
          order_number: string;
          customer_id: string | null;
          voice_note_url?: string | null;
          guest_name: string;
          guest_phone: string;
          guest_email: string | null;
          delivery_address: string;
          delivery_option: string | null;
          delivery_fee: number;
          notes: string | null;
          subtotal: number;
          total: number;
          payment_method: string;
          payment_status: OrderPaymentStatus;
          delivery_status: OrderDeliveryStatus;
          status: CustomerOrderStatus;
          admin_notes: string | null;
          stock_checked: boolean;
          location_id: string | null;
          sales_person_id: string | null;
          expected_delivery_date: string | null;
          stock_reserved: boolean;
          rejection_reason: string | null;
          approved_by: string | null;
          approved_at: string | null;
          linked_sale_id: string | null;
          access_token: string;
          created_at: string;
          updated_at: string;
          customer_received_at: string | null;
          customer_feedback: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          order_number?: string;
          customer_id?: string | null;
          voice_note_url?: string | null;
          guest_name: string;
          guest_phone: string;
          guest_email?: string | null;
          delivery_address: string;
          delivery_option?: string | null;
          delivery_fee?: number;
          notes?: string | null;
          subtotal?: number;
          total?: number;
          payment_method?: string;
          payment_status?: OrderPaymentStatus;
          delivery_status?: OrderDeliveryStatus;
          status?: CustomerOrderStatus;
          admin_notes?: string | null;
          stock_checked?: boolean;
          location_id?: string | null;
          sales_person_id?: string | null;
          expected_delivery_date?: string | null;
          stock_reserved?: boolean;
          rejection_reason?: string | null;
          approved_by?: string | null;
          approved_at?: string | null;
          linked_sale_id?: string | null;
          access_token?: string;
          created_at?: string;
          updated_at?: string;
          customer_received_at?: string | null;
          customer_feedback?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["customer_orders"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "customer_orders_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_orders_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_orders_linked_sale_id_fkey";
            columns: ["linked_sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_orders_sales_person_id_fkey";
            columns: ["sales_person_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_order_items: {
        Row: {
          id: string;
          order_id: string;
          org_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          org_id: string;
          product_id: string;
          product_name: string;
          quantity: number;
          unit_price: number;
          line_total: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_order_items"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "customer_order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "customer_orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "customer_order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          }
        ];
      };
      customer_order_timeline: {
        Row: {
          id: string;
          order_id: string;
          org_id: string;
          title: string;
          actor_name: string;
          actor_id: string | null;
          status: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          org_id: string;
          title: string;
          actor_name: string;
          actor_id?: string | null;
          status?: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["customer_order_timeline"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "customer_order_timeline_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "customer_orders";
            referencedColumns: ["id"];
          }
        ];
      };
      notifications: {
        Row: {
          id: string;
          org_id: string;
          user_id: string | null;
          location_id: string | null;
          title: string;
          message: string;
          type: string;
          channel: "in_app" | "email" | "whatsapp";
          entity_type: string;
          entity_id: string | null;
          recipient_contact: string | null;
          is_read: boolean;
          status: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id?: string | null;
          location_id?: string | null;
          title: string;
          message: string;
          type: string;
          channel?: "in_app" | "email" | "whatsapp";
          entity_type?: string;
          entity_id?: string | null;
          recipient_contact?: string | null;
          is_read?: boolean;
          status?: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["notifications"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "notifications_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      bank_accounts: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          account_type: BankAccountType;
          account_number: string | null;
          logo_url: string | null;
          opening_balance: number;
          current_balance: number;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          account_type?: BankAccountType;
          account_number?: string | null;
          logo_url?: string | null;
          opening_balance?: number;
          current_balance?: number;
          created_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_accounts"]["Row"]>;
        Relationships: [];
      };
      bank_transactions: {
        Row: {
          id: string;
          org_id: string;
          account_id: string;
          type: BankTransactionType;
          amount: number;
          description: string | null;
          counterparty_name: string | null;
          transaction_category: string | null;
          transaction_date: string;
          recorded_by: string;
          source_expense_id: string | null;
          location_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          account_id: string;
          type: BankTransactionType;
          amount: number;
          description?: string | null;
          counterparty_name?: string | null;
          transaction_category?: string | null;
          transaction_date?: string;
          recorded_by: string;
          source_expense_id?: string | null;
          location_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["bank_transactions"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "bank_transactions_account_id_fkey";
            columns: ["account_id"];
            isOneToOne: false;
            referencedRelation: "bank_accounts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_source_expense_id_fkey";
            columns: ["source_expense_id"];
            isOneToOne: false;
            referencedRelation: "expenses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "bank_transactions_location_id_fkey";
            columns: ["location_id"];
            isOneToOne: false;
            referencedRelation: "business_locations";
            referencedColumns: ["id"];
          }
        ];
      };
      sale_payment_allocations: {
        Row: {
          id: string;
          org_id: string;
          sale_id: string;
          payment_method: string;
          account_id: string | null;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sale_id: string;
          payment_method: string;
          account_id?: string | null;
          amount: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["sale_payment_allocations"]["Row"]>;
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          category: string | null;
          purchase_date: string;
          purchase_cost: number;
          current_value: number;
          status: "in_use" | "under_repair" | "disposed";
          location: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          category?: string | null;
          purchase_date?: string;
          purchase_cost?: number;
          current_value?: number;
          status?: "in_use" | "under_repair" | "disposed";
          location?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["assets"]["Row"]>;
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          customer_id: string | null;
          status: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          start_date: string | null;
          end_date: string | null;
          budget: number | null;
          description: string | null;
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          customer_id?: string | null;
          status?: "planning" | "active" | "on_hold" | "completed" | "cancelled";
          start_date?: string | null;
          end_date?: string | null;
          budget?: number | null;
          description?: string | null;
          created_by: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["projects"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "projects_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          }
        ];
      };
      ai_insights: {
        Row: {
          id: string;
          org_id: string;
          content: string;
          generated_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          content: string;
          generated_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_insights"]["Row"]>;
        Relationships: [];
      };
      ai_chat_conversations: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          title: string;
          messages: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          title: string;
          messages: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["ai_chat_conversations"]["Row"]>;
        Relationships: [];
      };
      ai_usage_events: {
        Row: {
          id: string;
          org_id: string;
          user_id: string;
          model: string;
          status: "pending" | "succeeded" | "failed";
          input_tokens: number;
          output_tokens: number;
          latency_ms: number;
          error_code: string | null;
          created_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          org_id: string;
          user_id: string;
          model: string;
          status?: "pending" | "succeeded" | "failed";
          input_tokens?: number;
          output_tokens?: number;
          latency_ms?: number;
          error_code?: string | null;
          created_at?: string;
          completed_at?: string | null;
        };
        Update: Partial<Database["public"]["Tables"]["ai_usage_events"]["Row"]>;
        Relationships: [];
      };
      organization_role_themes: {
        Row: {
          org_id: string;
          role_key: string;
          theme_key: string;
          updated_at: string;
        };
        Insert: {
          org_id: string;
          role_key: string;
          theme_key: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["organization_role_themes"]["Row"]>;
        Relationships: [];
      };
      communication_channels: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          channel_type: "Branch" | "Group" | "Direct" | "Announcement";
          location_id: string | null;
          created_by: string | null;
          archived: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          channel_type?: "Branch" | "Group" | "Direct" | "Announcement";
          location_id?: string | null;
          created_by?: string | null;
          archived?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["communication_channels"]["Row"]>;
        Relationships: [];
      };
      communication_messages: {
        Row: {
          id: string;
          channel_id: string;
          user_id: string;
          body: string | null;
          pinned: boolean;
          created_at: string;
          attachment_name: string | null;
          attachment_path: string | null;
          attachment_type: string | null;
          attachment_size: number | null;
        };
        Insert: {
          id?: string;
          channel_id: string;
          user_id: string;
          body?: string | null;
          pinned?: boolean;
          created_at?: string;
          attachment_name?: string | null;
          attachment_path?: string | null;
          attachment_type?: string | null;
          attachment_size?: number | null;
        };
        Update: Partial<Database["public"]["Tables"]["communication_messages"]["Row"]>;
        Relationships: [];
      };
      communication_channel_members: {
        Row: {
          channel_id: string;
          user_id: string;
          created_at: string;
        };
        Insert: {
          channel_id: string;
          user_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["communication_channel_members"]["Row"]>;
        Relationships: [];
      };
      product_duplicate_settings: {
        Row: {
          org_id: string;
          control_mode: "allow" | "warn" | "block_exact" | "block_exact_similar";
          similarity_threshold: number;
          barcode_validation: "allow" | "warn" | "block";
          updated_at: string;
        };
        Insert: {
          org_id: string;
          control_mode?: "allow" | "warn" | "block_exact" | "block_exact_similar";
          similarity_threshold?: number;
          barcode_validation?: "allow" | "warn" | "block";
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_duplicate_settings"]["Row"]>;
        Relationships: [];
      };
      product_categories: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          code: string;
          description: string | null;
          status: "active" | "inactive";
          icon: string | null;
          color: string | null;
          parent_id: string | null;
          display_order: number;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          code: string;
          description?: string | null;
          status?: "active" | "inactive";
          icon?: string | null;
          color?: string | null;
          parent_id?: string | null;
          display_order?: number;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["product_categories"]["Row"]>;
        Relationships: [
          {
            foreignKeyName: "product_categories_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_categories_parent_fk";
            columns: ["parent_id"];
            isOneToOne: false;
            referencedRelation: "product_categories";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      public_product_catalog: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          category: string | null;
          brand: string | null;
          unit_price: number;
          stock_quantity: number;
          sku: string;
          image_urls: string[];
        };
        Relationships: [];
      };
    };
    Functions: {
      place_customer_portal_order: {
        Args: {
          p_org_id: string;
          p_guest_name: string;
          p_guest_phone: string;
          p_guest_email: string | null;
          p_delivery_address: string;
          p_delivery_option: string | null;
          p_location_id: string | null;
          p_notes: string | null;
          p_voice_note_url: string | null;
          p_items: Json;
        };
        Returns: {
          order_id: string;
          order_number: string;
          access_token: string;
          branch_name: string | null;
          total: number;
        }[];
      };
      place_customer_portal_order_for_branch: {
        Args: {
          p_org_id: string;
          p_branch_slug: string;
          p_guest_name: string;
          p_guest_phone: string;
          p_guest_email: string | null;
          p_delivery_address: string;
          p_delivery_option: string | null;
          p_notes: string | null;
          p_voice_note_url: string | null;
          p_items: Json;
        };
        Returns: {
          order_id: string;
          order_number: string;
          access_token: string;
          branch_name: string | null;
          total: number;
        }[];
      };
      confirm_customer_portal_order_received: {
        Args: { p_access_token: string; p_feedback: string | null };
        Returns: string;
      };
      get_ai_usage_summary: {
        Args: { p_org_id: string };
        Returns: {
          total_requests: number;
          successful_requests: number;
          failed_requests: number;
          input_tokens: number;
          output_tokens: number;
          average_latency_ms: number;
          recent_errors: Json;
        }[];
      };
      reserve_ai_usage_request: {
        Args: { p_org_id: string; p_user_id: string; p_model: string };
        Returns: string | null;
      };
      list_pos_sales: {
        Args: {
          p_org_id: string;
          p_from: string | null;
          p_to: string | null;
          p_location_ids: string[] | null;
          p_location_id: string | null;
          p_cashier_id: string | null;
          p_payment_method: string;
          p_status: string;
          p_payment_status: string;
          p_search: string;
          p_sort_by: string;
          p_sort_direction: string;
          p_page: number;
          p_page_size: number;
        };
        Returns: Json;
      };
      record_purchase_bank_payment: {
        Args: {
          p_purchase_id: string;
          p_org_id: string;
          p_bank_account_id: string;
          p_amount: number;
          p_actor_id: string;
        };
        Returns: number;
      };
      transfer_bank_funds: {
        Args: {
          p_org_id: string;
          p_source_account_id: string;
          p_destination_account_id: string;
          p_amount: number;
          p_transaction_date: string;
          p_description: string | null;
        };
        Returns: undefined;
      };
      submit_branch_product_return: {
        Args: {
          p_org_id: string;
          p_actor_id: string;
          p_source_location_id: string;
          p_destination_location_id: string;
          p_return_date: string;
          p_return_reason: string;
          p_priority: string;
          p_notes: string | null;
          p_items: { product_id: string; quantity: number; condition: string; reason: string; inspection_notes?: string | null; transfer_id?: string | null }[];
        };
        Returns: { return_id: string; return_number: number }[];
      };
      consolidate_branch_product_returns: {
        Args: { p_org_id: string; p_actor_id: string; p_return_item_ids: string[] };
        Returns: { consolidation_id: string; consolidation_number: number }[];
      };
      create_branch_return_purchase_return: {
        Args: { p_org_id: string; p_actor_id: string; p_consolidation_id: string };
        Returns: { purchase_return_id: string; purchase_return_number: number }[];
      };
      record_branch_product_supplier_response: {
        Args: {
          p_org_id: string;
          p_actor_id: string;
          p_consolidation_id: string;
          p_responses: { return_item_id: string; accepted_quantity: number; rejected_quantity: number }[];
          p_notes: string | null;
        };
        Returns: undefined;
      };
      create_organization_registration: {
        Args: {
          p_user_id: string;
          p_name: string;
          p_slug: string;
          p_ip_hash?: string | null;
        };
        Returns: { organization_id: string; created: boolean }[];
      };
      open_pos_register_sessions: {
        Args: {
          p_org_id: string;
          p_cashier_id: string;
          p_cashier_name: string;
          p_shift: string;
          p_notes: string | null;
          p_sessions: { location_id: string; opening_cash: number }[];
        };
        Returns: { id: string; location_id: string }[];
      };
      adjust_product_stock_at_location: {
        Args: { p_product_id: string; p_location_id: string; p_org_id: string; p_delta: number };
        Returns: void;
      };
      peek_product_sku_seq: {
        Args: Record<string, never>;
        Returns: number;
      };
      create_communication_channel: {
        Args: {
          p_org_id: string;
          p_name: string;
          p_channel_type: string;
          p_location_id?: string | null;
        };
        Returns: Database["public"]["Tables"]["communication_channels"]["Row"][];
      };
      merge_products: {
        Args: {
          p_org_id: string;
          p_master_id: string;
          p_secondary_ids: string[];
          p_actor_id: string;
          p_pricing_strategy?: string;
          p_custom_price?: number | null;
          p_custom_cost?: number | null;
          p_details_options?: Record<string, unknown>;
        };
        Returns: {
          success: boolean;
          master_product_id: string;
          merged_count: number;
          consolidated_stock: number;
          records_transferred: number;
        };
      };
      get_bank_account_trend_changes: {
        Args: {
          p_org_id: string;
          p_month_start: string;
          p_year_start: string;
          p_as_of: string;
        };
        Returns: {
          account_id: string;
          month_change: number;
          year_change: number;
        }[];
      };
      create_restaurant_order: {
        Args: {
          p_org_id: string;
          p_location_id: string;
          p_order_type: string;
          p_table_id: string | null;
          p_customer_name: string | null;
          p_customer_phone: string | null;
          p_delivery_address: string | null;
          p_notes: string | null;
          p_items: Json;
          p_created_by: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_orders"]["Row"];
      };
      consume_restaurant_online_order_rate_limit: {
        Args: { p_location_id: string; p_ip_hash: string };
        Returns: boolean;
      };
      create_restaurant_online_reservation: {
        Args: {
          p_org_id: string;
          p_branch_slug: string;
          p_guest_name: string;
          p_guest_phone: string;
          p_guest_email: string;
          p_party_size: number;
          p_starts_at: string;
          p_notes: string;
        };
        Returns: {
          reservation_id: string;
          confirmation_token: string;
          starts_at: string;
          ends_at: string;
        }[];
      };
      get_restaurant_online_reservation_slots: {
        Args: {
          p_org_id: string;
          p_branch_slug: string;
          p_date: string;
          p_party_size: number;
        };
        Returns: { slot_starts_at: string }[];
      };
      get_restaurant_online_reservation_confirmation: {
        Args: { p_token: string };
        Returns: {
          guest_name: string;
          party_size: number;
          starts_at: string;
          ends_at: string;
          status: string;
          branch_name: string;
        }[];
      };
      cancel_restaurant_online_reservation: {
        Args: { p_token: string };
        Returns: boolean;
      };
      create_restaurant_online_order: {
        Args: {
          p_org_id: string;
          p_branch_slug: string;
          p_fulfillment: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_customer_email: string;
          p_delivery_address: string | null;
          p_notes: string | null;
          p_payment_option: string;
          p_payment_reference: string | null;
          p_currency: string | null;
          p_items: Json;
        };
        Returns: {
          order_id: string;
          order_number: number;
          total: number;
          amount_minor: number;
          confirmation_token: string | null;
        }[];
      };
      cancel_restaurant_online_payment_attempt: {
        Args: { p_reference: string };
        Returns: undefined;
      };
      record_restaurant_online_payment: {
        Args: { p_reference: string; p_amount_minor: number; p_currency: string };
        Returns: string;
      };
      get_restaurant_online_order_confirmation: {
        Args: { p_token: string };
        Returns: {
          order_number: number;
          payment_status: string;
          payment_attempt_status: string;
        }[];
      };
      create_restaurant_reservation: {
        Args: {
          p_org_id: string;
          p_location_id: string;
          p_table_id: string | null;
          p_guest_name: string;
          p_guest_phone: string;
          p_party_size: number;
          p_starts_at: string;
          p_duration_minutes: number;
          p_notes: string | null;
          p_created_by: string;
          p_waitlist: boolean;
        };
        Returns: Database["public"]["Tables"]["restaurant_reservations"]["Row"];
      };
      assign_restaurant_reservation_table: {
        Args: {
          p_org_id: string;
          p_reservation_id: string;
          p_table_id: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_reservations"]["Row"];
      };
      get_restaurant_report: {
        Args: {
          p_org_id: string;
          p_location_ids: string[];
          p_start_at: string;
          p_end_at: string;
        };
        Returns: Json;
      };
      record_restaurant_payment: {
        Args: {
          p_org_id: string;
          p_order_id: string;
          p_amount: number;
          p_payment_method: string;
          p_received_by: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_orders"]["Row"];
      };
      split_restaurant_bill_by_items: {
        Args: {
          p_org_id: string;
          p_order_id: string;
          p_bills: Json;
        };
        Returns: Database["public"]["Tables"]["restaurant_bills"]["Row"][];
      };
      split_restaurant_bill_equally: {
        Args: {
          p_org_id: string;
          p_order_id: string;
          p_share_count: number;
        };
        Returns: Database["public"]["Tables"]["restaurant_bills"]["Row"][];
      };
      record_restaurant_bill_payment: {
        Args: {
          p_org_id: string;
          p_order_id: string;
          p_bill_id: string;
          p_amount: number;
          p_tip_amount: number;
          p_payment_method: string;
          p_received_by: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_orders"]["Row"];
      };
      refund_restaurant_payment: {
        Args: {
          p_org_id: string;
          p_order_id: string;
          p_payment_id: string;
          p_amount: number;
          p_tip_amount: number;
          p_payment_method: string;
          p_received_by: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_orders"]["Row"];
      };
      replace_restaurant_recipe: {
        Args: {
          p_org_id: string;
          p_menu_item_id: string;
          p_ingredients: Json;
        };
        Returns: Database["public"]["Tables"]["restaurant_recipe_ingredients"]["Row"][];
      };
      adjust_restaurant_ingredient_stock: {
        Args: {
          p_org_id: string;
          p_location_id: string;
          p_ingredient_id: string;
          p_quantity_delta: number;
          p_reason: string;
          p_created_by: string;
        };
        Returns: Database["public"]["Tables"]["restaurant_ingredient_stock"]["Row"];
      };
    };
    Enums: {
      org_plan: OrgPlan;
      member_role: MemberRole;
      member_status: MemberStatus;
      invoice_status: InvoiceStatus;
      bank_account_type: BankAccountType;
      bank_transaction_type: BankTransactionType;
      sale_status: SaleStatus;
      purchase_status: PurchaseStatus;
      supplier_status: SupplierStatus;
      purchase_return_status: PurchaseReturnStatus;
      expense_status: ExpenseStatus;
      expense_payment_status: ExpensePaymentStatus;
      expense_category_status: ExpenseCategoryStatus;
      attendance_status: AttendanceStatus;
      leave_status: LeaveStatus;
      held_sale_kind: HeldSaleKind;
      customer_account_requirement: CustomerAccountRequirement;
      customer_order_status: CustomerOrderStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
