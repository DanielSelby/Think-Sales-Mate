export type MemberRole = "owner" | "admin" | "manager" | "staff" | "viewer";
export type MemberStatus = "invited" | "active" | "suspended";
export type OrgPlan = "trial" | "starter" | "growth" | "enterprise";
export type InvoiceStatus = "draft" | "sent" | "paid" | "overdue" | "void";
export type BankAccountType = "cash" | "checking" | "savings" | "mobile_money" | "other";
export type BankTransactionType = "deposit" | "withdrawal";
export type TransferStatus = "pending" | "in_transit" | "completed" | "cancelled";
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
export type AttendanceStatus = "present" | "absent" | "late" | "early_leave" | "on_leave";
export type LeaveStatus = "pending" | "approved" | "rejected";
export type HeldSaleKind = "hold" | "draft";
export type CustomerAccountRequirement = "optional" | "required" | "guest_only";
export type CustomerOrderStatus = "new" | "approved" | "picking" | "packing" | "delivery" | "completed" | "cancelled" | "returned" | "processing" | "reviewed";
export type OrderPaymentStatus = "paid" | "partial" | "unpaid";
export type OrderDeliveryStatus = "not_shipped" | "picking" | "packing" | "in_delivery" | "delivered";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          avatar_url: string | null;
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
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          plan?: OrgPlan;
          currency?: string;
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
          }
        ];
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
          website: string | null;
          tin: string | null;
          description: string | null;
          logo_url: string | null;
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
          website?: string | null;
          tin?: string | null;
          description?: string | null;
          logo_url?: string | null;
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
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["org_general_settings"]["Row"]>;
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
          hsn_code: string | null;
          tax_rate: number | null;
          expiry_date: string | null;
          warranty_months: number | null;
          wholesale_price: number | null;
          mrp: number | null;
          track_inventory: boolean;
          allow_sale: boolean;
          allow_purchase: boolean;
          allow_negative_stock: boolean;
          has_variants: boolean;
          tags: string[];
          image_urls: string[];
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
          hsn_code?: string | null;
          tax_rate?: number | null;
          expiry_date?: string | null;
          warranty_months?: number | null;
          wholesale_price?: number | null;
          mrp?: number | null;
          track_inventory?: boolean;
          allow_sale?: boolean;
          allow_purchase?: boolean;
          allow_negative_stock?: boolean;
          has_variants?: boolean;
          tags?: string[];
          image_urls?: string[];
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
          customer_name: string | null;
          customer_id: string | null;
          location_id: string | null;
          reference: string | null;
          sale_date: string;
          subtotal: number;
          discount_amount: number;
          tax_amount: number;
          shipping_amount: number;
          total: number;
          payment_method: string | null;
          amount_paid: number | null;
          sold_by: string;
          status: SaleStatus;
          refunded_amount: number;
          status_note: string | null;
          status_changed_by: string | null;
          status_changed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sale_number?: number;
          customer_name?: string | null;
          customer_id?: string | null;
          location_id?: string | null;
          reference?: string | null;
          sale_date?: string;
          subtotal?: number;
          discount_amount?: number;
          tax_amount?: number;
          shipping_amount?: number;
          total?: number;
          payment_method?: string | null;
          amount_paid?: number | null;
          sold_by: string;
          status?: SaleStatus;
          refunded_amount?: number;
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
          scope: "all" | "individual";
          cashier_id: string | null;
          cashier_name: string | null;
          period_start: string;
          period_end: string;
          sales_count: number;
          sales_total: number;
          cash_total: number;
          card_total: number;
          momo_total: number;
          other_total: number;
          expenses_total: number;
          net_total: number;
          closed_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          location_id?: string | null;
          scope?: "all" | "individual";
          cashier_id?: string | null;
          cashier_name?: string | null;
          period_start: string;
          period_end: string;
          sales_count?: number;
          sales_total?: number;
          cash_total?: number;
          card_total?: number;
          momo_total?: number;
          other_total?: number;
          expenses_total?: number;
          net_total?: number;
          closed_by: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["register_closures"]["Row"]>;
        Relationships: [];
      };
      customer_portal_settings: {
        Row: {
          id: string;
          org_id: string;
          is_enabled: boolean;
          account_requirement: CustomerAccountRequirement;
          require_approval_before_processing: boolean;
          allow_customer_select_delivery: boolean;
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
          updated_by: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          is_enabled?: boolean;
          account_requirement?: CustomerAccountRequirement;
          require_approval_before_processing?: boolean;
          allow_customer_select_delivery?: boolean;
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
        };
        Insert: {
          id?: string;
          org_id: string;
          order_number?: string;
          customer_id?: string | null;
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
          transaction_date: string;
          recorded_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          account_id: string;
          type: BankTransactionType;
          amount: number;
          description?: string | null;
          transaction_date?: string;
          recorded_by: string;
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
          }
        ];
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
        };
        Relationships: [];
      };
    };
    Functions: {
      adjust_product_stock_at_location: {
        Args: { p_product_id: string; p_location_id: string; p_org_id: string; p_delta: number };
        Returns: void;
      };
      peek_product_sku_seq: {
        Args: Record<string, never>;
        Returns: number;
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