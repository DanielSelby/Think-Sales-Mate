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
          location_type: LocationType;
          address: string | null;
          city: string | null;
          region: string | null;
          country: string | null;
          phone: string | null;
          is_primary: boolean;
          is_active: boolean;
          created_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          location_type?: LocationType;
          address?: string | null;
          city?: string | null;
          region?: string | null;
          country?: string | null;
          phone?: string | null;
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
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sku: string;
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
          is_active?: boolean;
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
          created_by: string;
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
          created_by: string;
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
          full_name: string;
          email: string | null;
          phone: string | null;
          job_title: string | null;
          department: string | null;
          monthly_salary: number;
          hire_date: string;
          status: "active" | "inactive";
          created_by: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          full_name: string;
          email?: string | null;
          phone?: string | null;
          job_title?: string | null;
          department?: string | null;
          monthly_salary: number;
          hire_date?: string;
          status?: "active" | "inactive";
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
          total_amount: number;
          employee_count: number;
          expense_id: string | null;
          run_by: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          period_label: string;
          period_month: string;
          total_amount: number;
          employee_count: number;
          expense_id?: string | null;
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
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          payroll_run_id: string;
          org_id: string;
          employee_id?: string | null;
          employee_name: string;
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
    Views: Record<string, never>;
    Functions: {
      adjust_product_stock_at_location: {
        Args: { p_product_id: string; p_location_id: string; p_org_id: string; p_delta: number };
        Returns: void;
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
    };
    CompositeTypes: Record<string, never>;
  };
}