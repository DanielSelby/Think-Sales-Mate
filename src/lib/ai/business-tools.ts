import "server-only";
import { FunctionDeclaration, Schema, Type, type Tool } from "@google/genai";
import { z } from "zod";
import type { CurrentOrgContext } from "@/lib/organizations/current";
import { loadPermissionMatrix } from "@/lib/rbac/permissions";
import { aiLocationScope, canReadAiBusinessModule } from "@/lib/ai/access";
import { defaultDateRange } from "@/lib/accounting/metrics";
import { isValidDateRange } from "@/lib/ai/chat-validation";
import { createClient } from "@/lib/supabase/server";
import { getCustomerOutstandingBalances } from "@/lib/sales/customer-outstanding";

const MAX_DATA_ROWS = 5_000;
const PAGE_SIZE = 1_000;
const optionalRangeSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
}).strict();

type BusinessTool = {
  declaration: FunctionDeclaration;
  execute(args: unknown): Promise<Record<string, unknown>>;
};

function dateRange(args: unknown) {
  const parsed = optionalRangeSchema.safeParse(args ?? {});
  if (!parsed.success) throw new Error("Invalid business data date range.");
  const defaults = defaultDateRange();
  const from = parsed.data.from ?? defaults.from;
  const to = parsed.data.to ?? defaults.to;
  if (!isValidDateRange(from, to)) throw new Error("Choose a valid date range of up to 90 days.");
  return { from, to };
}

function rangeParameters(): Schema {
  return {
    type: Type.OBJECT,
    properties: {
      from: { type: Type.STRING, description: "Optional start date, YYYY-MM-DD. Defaults to the last 30 days." },
      to: { type: Type.STRING, description: "Optional inclusive end date, YYYY-MM-DD. Defaults to today." },
    },
    propertyOrdering: ["from", "to"],
  };
}

async function collectRows<T>(
  load: (from: number, to: number) => Promise<{ data: T[] | null; error: { message: string } | null; count?: number | null }>
): Promise<{ rows: T[]; complete: boolean }> {
  const rows: T[] = [];
  let totalCount: number | null = null;
  let hitLimit = false;
  for (let offset = 0; offset < MAX_DATA_ROWS; offset += PAGE_SIZE) {
    const result = await load(offset, offset + PAGE_SIZE - 1);
    if (result.error) throw new Error("Business data query failed.");
    if (typeof result.count === "number") totalCount = result.count;
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
    if (offset + PAGE_SIZE >= MAX_DATA_ROWS) hitLimit = true;
  }
  return {
    rows,
    complete: totalCount !== null ? totalCount <= rows.length : !hitLimit,
  };
}

export async function createAuthorizedBusinessTools(
  context: CurrentOrgContext
): Promise<{ tools: Tool[]; execute(name: string, args: unknown): Promise<Record<string, unknown>> }> {
  const permissionMatrix = await loadPermissionMatrix(context.orgId, context.role, context.accessPermissions);
  const canView = (module: string) => canReadAiBusinessModule(context.role, permissionMatrix, module);
  const supabase = await createClient();
  const available: BusinessTool[] = [];

  if (canView("sales")) {
    available.push({
      declaration: {
        name: "get_sales_performance",
        description: "Get completed sales revenue and count for a date range. Branch users see only their assigned branches. Defaults to the last 30 days.",
        parameters: rangeParameters(),
      },
      async execute(args) {
        const range = dateRange(args);
        const locationIds = aiLocationScope(context);
        const query = async (from: number, to: number) => {
          let request = supabase
            .from("sales")
            .select("total, sale_date, location_id", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("status", "completed")
            .gte("sale_date", range.from)
            .lte("sale_date", range.to)
            .range(from, to);
          if (locationIds) request = request.in("location_id", locationIds);
          return request;
        };
        const { rows, complete } = await collectRows(query);
        const revenue = rows.reduce((sum, sale) => sum + Number(sale.total ?? 0), 0);
        const byBranch = new Map<string, { sales: number; revenue: number }>();
        for (const sale of rows) {
          if (!sale.location_id) continue;
          const current = byBranch.get(sale.location_id) ?? { sales: 0, revenue: 0 };
          current.sales += 1;
          current.revenue += Number(sale.total ?? 0);
          byBranch.set(sale.location_id, current);
        }
        let branchNames = new Map<string, string>();
        if (byBranch.size > 0) {
          let branchQuery = supabase
            .from("business_locations")
            .select("id, name")
            .eq("org_id", context.orgId)
            .in("id", [...byBranch.keys()]);
          if (locationIds) branchQuery = branchQuery.in("id", locationIds);
          const { data, error } = await branchQuery;
          if (error) throw new Error("Business data query failed.");
          branchNames = new Map((data ?? []).map((location) => [location.id, String(location.name).slice(0, 120)]));
        }
        return {
          source: "completed sales records",
          from: range.from,
          to: range.to,
          complete,
          sales_count: rows.length,
          revenue,
          average_sale_value: rows.length ? revenue / rows.length : 0,
          ...(complete ? {
            branch_breakdown: [...byBranch.entries()]
              .sort(([, left], [, right]) => right.revenue - left.revenue)
              .slice(0, 25)
              .map(([locationId, values]) => ({
                branch: branchNames.get(locationId) ?? "Unknown branch",
                ...values,
              })),
            ...(byBranch.size > 25 ? { branch_breakdown_note: "Branch breakdown shows the 25 branches with recorded sales in this result." } : {}),
          } : {}),
          ...(complete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} records were read. Do not treat totals as complete.` }),
        };
      },
    });
    if (canView("customers")) available.push({
      declaration: {
        name: "get_customer_sales_ranking",
        description: "Return the top 25 customers ranked separately by completed sales revenue and order count for a date range. Branch users see only sales from their assigned branches. Defaults to the last 30 days.",
        parameters: rangeParameters(),
      },
      async execute(args) {
        const range = dateRange(args);
        const locationIds = aiLocationScope(context);
        const query = async (from: number, to: number) => {
          let request = supabase
            .from("sales")
            .select("customer_id, customer_name, total", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("status", "completed")
            .gte("sale_date", range.from)
            .lte("sale_date", range.to)
            .range(from, to);
          if (locationIds) request = request.in("location_id", locationIds);
          return request;
        };
        const { rows, complete } = await collectRows(query);
        const customerIds = [...new Set(rows.flatMap((sale) => sale.customer_id ? [sale.customer_id] : []))];
        const customerNameBatches = await Promise.all(
          Array.from({ length: Math.ceil(customerIds.length / 250) }, (_, index) =>
            supabase
              .from("customers")
              .select("id, name")
              .eq("org_id", context.orgId)
              .in("id", customerIds.slice(index * 250, (index + 1) * 250))
          )
        );
        if (customerNameBatches.some(({ error }) => error)) throw new Error("Customer sales lookup failed.");
        const customerNames = new Map(
          customerNameBatches.flatMap(({ data }) =>
            (data ?? []).map((customer) => [customer.id, String(customer.name).slice(0, 120)] as const)
          )
        );

        const byCustomer = new Map<string, { customer: string; revenue: number; order_count: number }>();
        for (const sale of rows) {
          const customerName = String(
            (sale.customer_id && customerNames.get(sale.customer_id)) ||
            sale.customer_name ||
            (sale.customer_id ? `Customer ${sale.customer_id.slice(0, 8)}` : "Walk-in customer")
          ).slice(0, 120);
          const key = sale.customer_id
            ? `id:${sale.customer_id}`
            : `name:${customerName.trim().toLocaleLowerCase()}`;
          const current = byCustomer.get(key) ?? { customer: customerName, revenue: 0, order_count: 0 };
          current.revenue += Number(sale.total ?? 0);
          current.order_count += 1;
          byCustomer.set(key, current);
        }
        const customers = [...byCustomer.values()];
        const topByRevenue = [...customers].sort((left, right) => right.revenue - left.revenue).slice(0, 25);
        const topByOrderCount = [...customers].sort((left, right) => right.order_count - left.order_count).slice(0, 25);
        return {
          source: "completed sales records grouped by customer",
          from: range.from,
          to: range.to,
          complete,
          sales_count: rows.length,
          customer_count: customers.length,
          top_by_revenue: topByRevenue,
          top_by_order_count: topByOrderCount,
          rankings_truncated: customers.length > 25,
          ...(complete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} sales were read. Do not treat totals or rankings as complete.` }),
        };
      },
    });
    available.push({
      declaration: {
        name: "get_top_selling_products",
        description: "Get the top 10 products by units sold in an inclusive date range. Branch users see only sales from their assigned branches. Defaults to the last 30 days.",
        parameters: rangeParameters(),
      },
      async execute(args) {
        const range = dateRange(args);
        const locationIds = aiLocationScope(context);
        const query = async (from: number, to: number) => {
          let request = supabase
            .from("sale_items")
            .select("product_id, quantity, line_total, products(name), sales!inner(location_id, status, sale_date)", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("sales.status", "completed")
            .gte("sales.sale_date", range.from)
            .lte("sales.sale_date", range.to)
            .range(from, to);
          if (locationIds) request = request.in("sales.location_id", locationIds);
          return request;
        };
        const { rows, complete } = await collectRows(query);
        const byProduct = new Map<string, { name: string; quantity: number; revenue: number }>();
        for (const item of rows) {
          const productJoin = item.products;
          const product = Array.isArray(productJoin) ? productJoin[0] : productJoin;
          const entry = byProduct.get(item.product_id) ?? {
            name: String(product?.name ?? "Unknown product").slice(0, 120),
            quantity: 0,
            revenue: 0,
          };
          entry.quantity += Number(item.quantity ?? 0);
          entry.revenue += Number(item.line_total ?? 0);
          byProduct.set(item.product_id, entry);
        }
        const products = [...byProduct.values()].sort((left, right) => right.quantity - left.quantity);
        return {
          source: "completed sale line items",
          from: range.from,
          to: range.to,
          complete,
          top_products: products.slice(0, 10),
          ...(complete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} records were read. Do not treat rankings as complete.` }),
        };
      },
    });
  }

  if (canView("inventory")) {
    available.push({
      declaration: {
        name: "get_inventory_overview",
        description: "Get authorized on-hand inventory totals, low-stock and out-of-stock counts, plus up to 25 low-stock product names. Branch users see only stock at assigned branches.",
        parameters: {},
      },
      async execute() {
        const locationIds = aiLocationScope(context);
        const stock = await collectRows(async (from, to) => {
          let request = supabase
            .from("product_stock_levels")
            .select("product_id, location_id, quantity", { count: "exact" })
            .eq("org_id", context.orgId)
            .range(from, to);
          if (locationIds) request = request.in("location_id", locationIds);
          return request;
        });
        const quantities = new Map<string, number>();
        for (const row of stock.rows) {
          quantities.set(row.product_id, (quantities.get(row.product_id) ?? 0) + Number(row.quantity ?? 0));
        }
        const products = await collectRows(async (from, to) => supabase
          .from("products")
          .select("id, name, stock_quantity, low_stock_threshold", { count: "exact" })
          .eq("org_id", context.orgId)
          .eq("is_active", true)
          .range(from, to));
        const scopedProducts = products.rows.filter((product) =>
          !context.isBranchScoped || quantities.has(product.id)
        );
        const lowStock = scopedProducts.map((product) => ({
          name: String(product.name).slice(0, 120),
          quantity: context.isBranchScoped
            ? quantities.get(product.id) ?? 0
            : quantities.has(product.id) ? quantities.get(product.id)! : Number(product.stock_quantity ?? 0),
          threshold: Number(product.low_stock_threshold ?? 0),
        })).filter((product) => product.quantity <= product.threshold);
        const stockComplete = stock.complete && products.complete;
        return {
          source: "active product catalog and authorized stock-level records",
          complete: stockComplete,
          products_with_visible_stock: scopedProducts.length,
          low_stock_count: lowStock.length,
          out_of_stock_count: lowStock.filter((product) => product.quantity <= 0).length,
          low_stock_products: lowStock.slice(0, 25),
          low_stock_products_truncated: lowStock.length > 25,
          ...(stockComplete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} rows per table were read.` }),
        };
      },
    });
  }

  if (canView("expenses")) {
    available.push({
      declaration: {
        name: "get_expense_summary",
        description: "Get approved expense totals grouped by category for a date range. Branch users see only expenses at assigned branches. Defaults to the last 30 days.",
        parameters: rangeParameters(),
      },
      async execute(args) {
        const range = dateRange(args);
        const locationIds = aiLocationScope(context);
        const query = async (from: number, to: number) => {
          let request = supabase
            .from("expenses")
            .select("amount, category, expense_date, location_id", { count: "exact" })
            .eq("org_id", context.orgId)
            .eq("status", "approved")
            .gte("expense_date", range.from)
            .lte("expense_date", range.to)
            .range(from, to);
          if (locationIds) request = request.in("location_id", locationIds);
          return request;
        };
        const { rows, complete } = await collectRows(query);
        const byCategory = new Map<string, number>();
        for (const expense of rows) {
          const category = String(expense.category || "Uncategorized").slice(0, 80);
          byCategory.set(category, (byCategory.get(category) ?? 0) + Number(expense.amount ?? 0));
        }
        return {
          source: "approved expense records",
          from: range.from,
          to: range.to,
          complete,
          expense_count: rows.length,
          total: rows.reduce((sum, expense) => sum + Number(expense.amount ?? 0), 0),
          by_category: [...byCategory.entries()].slice(0, 25).map(([category, amount]) => ({ category, amount })),
          categories_truncated: byCategory.size > 25,
          ...(complete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} records were read. Do not treat totals as complete.` }),
        };
      },
    });
  }

  if (canView("customers") && (canView("sales") || canView("accounting"))) {
    available.push({
      declaration: {
        name: "get_outstanding_customer_balances",
        description: "Get current unpaid credit-sale balances grouped by customer, including outstanding sent and overdue invoices when accounting access is available. Branch users only see balances from their assigned branches; legacy invoices are excluded for branch users because invoices are not branch-scoped.",
        parameters: {},
      },
      async execute() {
        const salesAccess = canView("sales");
        const accountingAccess = canView("accounting");
        const balances = salesAccess
          ? await getCustomerOutstandingBalances(
              supabase,
              context.orgId,
              aiLocationScope(context),
              undefined,
              false
            )
          : { byCustomerId: new Map<string, number>(), byCustomerName: new Map<string, number>() };
        const [customersResult, invoices] = await Promise.all([
          salesAccess
            ? supabase.from("customers").select("id, name").eq("org_id", context.orgId)
            : Promise.resolve({ data: [], error: null }),
          accountingAccess && !context.isBranchScoped
            ? collectRows(async (from, to) => supabase
                .from("invoices")
                .select("customer_name, amount", { count: "exact" })
                .eq("org_id", context.orgId)
                .in("status", ["sent", "overdue"])
                .range(from, to))
            : Promise.resolve({ rows: [], complete: true }),
        ]);
        if (customersResult.error) throw new Error("Customer balance query failed.");

        const customerNameById = new Map((customersResult.data ?? []).map((customer) => [customer.id, customer.name]));
        const byCustomer = new Map<string, { customer: string; balance: number }>();
        const addBalance = (customer: string, balance: number) => {
          const normalized = customer.trim().toLocaleLowerCase();
          if (!normalized || balance <= 0) return;
          const current = byCustomer.get(normalized) ?? { customer: customer.trim(), balance: 0 };
          current.balance += balance;
          byCustomer.set(normalized, current);
        };
        for (const [customerId, balance] of balances.byCustomerId) {
          addBalance(customerNameById.get(customerId) ?? "Unspecified customer", balance);
        }
        for (const [customerName, balance] of balances.byCustomerName) {
          addBalance(customerName, balance);
        }
        for (const invoice of invoices.rows) {
          addBalance(String(invoice.customer_name || "Unspecified customer"), Number(invoice.amount ?? 0));
        }

        const customersWithBalances = [...byCustomer.values()]
          .sort((left, right) => right.balance - left.balance);
        const outstandingTotal = customersWithBalances.reduce((sum, customer) => sum + customer.balance, 0);
        return {
          source: "unpaid completed or returned credit sales and available outstanding invoices",
          outstanding_total: outstandingTotal,
          customers: customersWithBalances.slice(0, 25),
          customers_truncated: customersWithBalances.length > 25,
          ...(invoices.complete ? {} : { note: `Invoice results are partial: at most ${MAX_DATA_ROWS} invoices were read.` }),
        };
      },
    });
  }

  if (canView("purchases")) {
    available.push({
      declaration: {
        name: "get_purchase_summary",
        description: "Get non-cancelled purchase totals, paid amounts and counts grouped by status for a date range. Branch users see only assigned locations. Defaults to the last 30 days.",
        parameters: rangeParameters(),
      },
      async execute(args) {
        const range = dateRange(args);
        const locationIds = aiLocationScope(context);
        const query = async (from: number, to: number) => {
          let request = supabase
            .from("purchases")
            .select("total, paid_amount, status, purchase_date, location_id", { count: "exact" })
            .eq("org_id", context.orgId)
            .in("status", ["ordered", "partially_received", "received"])
            .gte("purchase_date", range.from)
            .lte("purchase_date", range.to)
            .range(from, to);
          if (locationIds) request = request.in("location_id", locationIds);
          return request;
        };
        const { rows, complete } = await collectRows(query);
        const byStatus = new Map<string, number>();
        for (const purchase of rows) {
          byStatus.set(purchase.status, (byStatus.get(purchase.status) ?? 0) + 1);
        }
        const total = rows.reduce((sum, purchase) => sum + Number(purchase.total ?? 0), 0);
        const paid = rows.reduce((sum, purchase) => sum + Number(purchase.paid_amount ?? 0), 0);
        return {
          source: "ordered, partially received, and received purchase records",
          from: range.from,
          to: range.to,
          complete,
          purchase_count: rows.length,
          total,
          paid,
          outstanding: total - paid,
          by_status: [...byStatus.entries()].map(([status, count]) => ({ status, count })),
          ...(complete ? {} : { note: `Partial result: at most ${MAX_DATA_ROWS} records were read. Do not treat totals as complete.` }),
        };
      },
    });
  }

  const byName = new Map(available.map((tool) => [tool.declaration.name ?? "", tool]));
  const declarations = available.map((tool) => tool.declaration);
  return {
    tools: declarations.length ? [{ functionDeclarations: declarations }] : [],
    async execute(name, args) {
      const tool = byName.get(name);
      if (!tool) return { error: "This read-only data lookup is not available for the current user." };
      return tool.execute(args);
    },
  };
}
