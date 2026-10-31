import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import type { Database, Json } from "@/types/database";
import RestaurantView from "./restaurant-view";

type RestaurantViewKey = "orders" | "kitchen" | "menu" | "online-ordering" | "tables" | "reservations" | "catering" | "reports" | "ingredients";
type RestaurantReport = {
  summary: {
    order_count: number;
    completed_count: number;
    cancelled_count: number;
    gross_sales: number;
    collected_payments: number;
    average_order: number;
  };
  daily: Array<{ date: string; order_count: number; gross_sales: number }>;
  by_type: Array<{ order_type: "dine_in" | "takeaway" | "pickup" | "delivery"; order_count: number; gross_sales: number }>;
  top_items: Array<{ item_name: string; quantity_sold: number; sales: number }>;
};
type RestaurantInvoiceReconciliationHistory = Database["public"]["Functions"]["get_restaurant_invoice_reconciliation_history"]["Returns"][number] & {
  recorded_by_name: string;
};
type RestaurantLaborSummary = {
  total_hours: number;
  staff_count: number;
  record_count: number;
  by_branch: Array<{
    location_id: string;
    location_name: string;
    total_hours: number;
    staff_count: number;
    record_count: number;
  }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRestaurantLaborBranch(value: unknown): value is RestaurantLaborSummary["by_branch"][number] {
  return isRecord(value)
    && typeof value.location_id === "string"
    && typeof value.location_name === "string"
    && typeof value.total_hours === "number"
    && typeof value.staff_count === "number"
    && typeof value.record_count === "number";
}

function isRestaurantReport(value: unknown): value is RestaurantReport {
  if (!isRecord(value)) return false;
  const summary = value.summary;
  if (!isRecord(summary)) return false;
  const summaryKeys = ["order_count", "completed_count", "cancelled_count", "gross_sales", "collected_payments", "average_order"];
  if (summaryKeys.some((key) => typeof summary[key] !== "number")) return false;
  if (!Array.isArray(value.daily) || !Array.isArray(value.by_type) || !Array.isArray(value.top_items)) return false;
  return value.daily.every((row: unknown) => isRecord(row) && typeof row.date === "string" && typeof row.order_count === "number" && typeof row.gross_sales === "number")
    && value.by_type.every((row: unknown) => isRecord(row)
      && (row.order_type === "dine_in" || row.order_type === "takeaway" || row.order_type === "pickup" || row.order_type === "delivery")
      && typeof row.order_count === "number" && typeof row.gross_sales === "number")
    && value.top_items.every((row: unknown) => isRecord(row) && typeof row.item_name === "string" && typeof row.quantity_sold === "number" && typeof row.sales === "number");
}

function isDateValue(value: string | undefined): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export default async function RestaurantPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string; locationId?: string }>;
}) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/login");

  const { view: requestedView, from, to, locationId: requestedLocationId } = await searchParams;
  const validViews: RestaurantViewKey[] = ["orders", "kitchen", "menu", "online-ordering", "tables", "reservations", "catering", "reports", "ingredients"];
  const view: RestaurantViewKey = requestedView && validViews.includes(requestedView as RestaurantViewKey) ? requestedView as RestaurantViewKey : "orders";
  const enabledModules = await getEnabledOrganizationModules(context.orgId);
  if (!enabledModules.includes("Restaurant")) {
    redirect("/dashboard?moduleDisabled=Restaurant");
  }
  const permissionTab = view === "online-ordering" ? "menu" : view === "catering" ? "orders" : view;
  if (!(await canTabPermission("restaurant", "operations", permissionTab, "view"))) {
    redirect("/dashboard?accessDenied=restaurant.operations");
  }

  const supabase = await createClient();
  const [
    { data: organization, error: organizationError },
    { data: locations, error: locationsError },
    { data: categories, error: categoriesError },
    { data: menuItems, error: menuItemsError },
    { data: modifierGroups, error: modifierGroupsError },
    { data: modifierOptions, error: modifierOptionsError },
    { data: tables, error: tablesError },
    { data: reservations, error: reservationsError },
    { data: orders, error: ordersError },
    { data: openOrders, error: openOrdersError },
  ] = await Promise.all([
    supabase.from("organizations").select("slug").eq("id", context.orgId).single(),
    supabase.from("business_locations").select("id, name, customer_portal_slug").eq("org_id", context.orgId).eq("is_active", true).order("name"),
    supabase.from("restaurant_menu_categories").select("*").eq("org_id", context.orgId).order("sort_order").order("name"),
    supabase.from("restaurant_menu_items").select("*").eq("org_id", context.orgId).order("sort_order").order("name"),
    supabase.from("restaurant_modifier_groups").select("*").eq("org_id", context.orgId).order("created_at"),
    supabase.from("restaurant_modifier_options").select("*").eq("org_id", context.orgId).order("created_at"),
    supabase.from("restaurant_tables").select("*").eq("org_id", context.orgId).order("table_name"),
    supabase.from("restaurant_reservations").select("*").eq("org_id", context.orgId)
      .order("starts_at", { ascending: false }).limit(300),
    supabase.from("restaurant_orders").select("*").eq("org_id", context.orgId).order("created_at", { ascending: false }).limit(100),
    supabase.from("restaurant_orders").select("*").eq("org_id", context.orgId).in("status", ["pending_payment", "new", "confirmed", "preparing", "ready", "served"]),
  ]);
  const dataError = [organizationError, locationsError, categoriesError, menuItemsError, modifierGroupsError, modifierOptionsError, tablesError, reservationsError, ordersError, openOrdersError].find((error) => error);
  if (dataError) throw new Error(`Could not load restaurant management data: ${dataError.message}`);
  if (!organization) throw new Error("Could not load restaurant organization settings.");

  const accessibleLocations = (locations ?? []).filter((location) => canAccessLocation(context, location.id));
  const locationIds = accessibleLocations.map(({ id }) => id);
  let deliveryEmployees: Array<{ id: string; fullName: string; locationId: string | null }> = [];
  if (view === "orders") {
    const { data: employeeRows, error: employeeError } = await supabase.from("employees")
      .select("id, full_name, location_id").eq("org_id", context.orgId).eq("status", "active").order("full_name");
    if (employeeError) throw new Error(`Could not load Restaurant delivery staff: ${employeeError.message}`);
    deliveryEmployees = (employeeRows ?? [])
      .filter((employee) => employee.location_id === null || locationIds.includes(employee.location_id))
      .map((employee) => ({ id: employee.id, fullName: employee.full_name, locationId: employee.location_id }));
  }
  const { data: cateringEvents, error: cateringEventsError } = view === "catering" && locationIds.length > 0
    ? await supabase.from("restaurant_catering_events").select("*").eq("org_id", context.orgId)
      .in("location_id", locationIds).order("starts_at", { ascending: true }).limit(300)
    : { data: [], error: null };
  const cateringEventIds = (cateringEvents ?? []).map((event) => event.id);
  const { data: cateringEventHistory, error: cateringEventHistoryError } = !cateringEventsError && cateringEventIds.length > 0
    ? await supabase.from("restaurant_catering_event_status_history").select("*")
      .eq("org_id", context.orgId).in("event_id", cateringEventIds)
      .order("changed_at", { ascending: false }).limit(1000)
    : { data: [], error: null };
  const { data: cateringQuotes, error: cateringQuotesError } = !cateringEventsError && cateringEventIds.length > 0
    ? await supabase.from("restaurant_catering_quotes").select("*")
      .eq("org_id", context.orgId).in("event_id", cateringEventIds)
      .order("version", { ascending: false })
    : { data: [], error: null };
  const cateringQuoteIds = (cateringQuotes ?? []).map((quote) => quote.id);
  const { data: cateringPayments, error: cateringPaymentsError } = cateringQuoteIds.length > 0
    ? await supabase.from("restaurant_catering_payments").select("*")
      .eq("org_id", context.orgId).in("quote_id", cateringQuoteIds)
      .order("paid_at", { ascending: false })
    : { data: [], error: null };
  const { data: cateringInvoices, error: cateringInvoicesError } = cateringEventIds.length > 0
    ? await supabase.from("invoices").select("*")
      .eq("org_id", context.orgId).in("source_catering_event_id", cateringEventIds)
    : { data: [], error: null };
  const { data: cateringPrepTasks, error: cateringPrepTasksError } = !cateringEventsError && cateringEventIds.length > 0
    ? await supabase.from("restaurant_catering_prep_tasks").select("*")
      .eq("org_id", context.orgId).in("event_id", cateringEventIds)
      .order("due_at", { ascending: true })
    : { data: [], error: null };
  const { data: cateringMenuPlans, error: cateringMenuPlansError } = !cateringEventsError && cateringEventIds.length > 0
    ? await supabase.from("restaurant_catering_menu_items").select("*")
      .eq("org_id", context.orgId).in("event_id", cateringEventIds)
      .order("created_at", { ascending: true })
    : { data: [], error: null };
  const { data: cateringMembers, error: cateringMembersError } = view === "catering"
    ? await supabase.from("organization_members")
      .select("user_id, branch_scope, location_id, secondary_location_ids")
      .eq("org_id", context.orgId).eq("status", "active").not("user_id", "is", null)
    : { data: [], error: null };
  const cateringMemberIds = Array.from(new Set((cateringMembers ?? [])
    .map((member) => member.user_id)
    .filter((userId): userId is string => Boolean(userId))));
  const { data: cateringProfiles, error: cateringProfilesError } = cateringMemberIds.length > 0
    ? await supabase.from("profiles").select("id, full_name").in("id", cateringMemberIds)
    : { data: [], error: null };
  const cateringProfileNames = new Map((cateringProfiles ?? []).map((profile) => [
    profile.id,
    profile.full_name?.trim() || "Restaurant staff",
  ]));
  const cateringStaff = (cateringMembers ?? []).flatMap((member) => {
    if (!member.user_id || !cateringProfileNames.has(member.user_id)) return [];
    const assignedLocationIds = member.branch_scope === "all"
      ? locationIds
      : [member.location_id, ...(member.secondary_location_ids ?? [])]
        .filter((memberLocationId): memberLocationId is string => typeof memberLocationId === "string" && locationIds.includes(memberLocationId));
    if (assignedLocationIds.length === 0) return [];
    return [{
      userId: member.user_id,
      fullName: cateringProfileNames.get(member.user_id) ?? "Restaurant staff",
      locationIds: assignedLocationIds,
    }];
  });
  const cateringDataError = cateringEventsError ?? cateringEventHistoryError ?? cateringQuotesError
    ?? cateringPaymentsError ?? cateringInvoicesError ?? cateringPrepTasksError ?? cateringMenuPlansError
    ?? cateringMembersError ?? cateringProfilesError;
  const cateringDataErrorMessage = cateringDataError
    ? ["42P01", "42703", "PGRST205", "PGRST204"].includes(cateringDataError.code ?? "")
      ? "The catering database schema is not up to date. Apply the restaurant catering event, quotation/payment, preparation-task, ingredient-plan, and final-invoice migrations, then reload this page."
      : `Could not load catering event data: ${cateringDataError.message}`
    : null;
  const { data: onlineSettings, error: onlineSettingsError } = view === "online-ordering" && locationIds.length > 0
    ? await createAdminClient().from("restaurant_online_settings").select("*").eq("org_id", context.orgId).in("location_id", locationIds)
    : { data: [], error: null };
  if (onlineSettingsError) throw new Error(`Could not load restaurant online ordering settings: ${onlineSettingsError.message}`);
  const [
    { data: ingredients, error: ingredientsError },
    { data: ingredientStocks, error: ingredientStocksError },
    { data: recipeIngredients, error: recipeIngredientsError },
    { data: ingredientMovements, error: ingredientMovementsError },
  ] = view === "ingredients" || view === "catering"
    ? await Promise.all([
        supabase.from("restaurant_ingredients").select("*").eq("org_id", context.orgId).order("name"),
        supabase.from("restaurant_ingredient_stock").select("*").eq("org_id", context.orgId).in("location_id", locationIds),
        supabase.from("restaurant_recipe_ingredients").select("*").eq("org_id", context.orgId),
        supabase.from("restaurant_ingredient_movements").select("*").eq("org_id", context.orgId)
          .in("location_id", locationIds).order("created_at", { ascending: false }).limit(100),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const ingredientDataError = [ingredientsError, ingredientStocksError, recipeIngredientsError, ingredientMovementsError].find((error) => error);
  if (ingredientDataError) throw new Error(`Could not load restaurant ingredient inventory: ${ingredientDataError.message}`);
  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);
  const defaultFromDate = new Date(todayDate);
  defaultFromDate.setUTCDate(defaultFromDate.getUTCDate() - 29);
  const defaultFrom = defaultFromDate.toISOString().slice(0, 10);
  const reportFrom = isDateValue(from) ? from : defaultFrom;
  const reportTo = isDateValue(to) ? to : today;
  const reportStart = new Date(`${reportFrom}T00:00:00.000Z`);
  const reportEnd = new Date(`${reportTo}T00:00:00.000Z`);
  reportEnd.setUTCDate(reportEnd.getUTCDate() + 1);
  if (reportEnd <= reportStart || reportEnd.getTime() - reportStart.getTime() > 367 * 24 * 60 * 60 * 1000) {
    throw new Error("Choose a valid restaurant report date range of no more than 366 days.");
  }
  const selectedReportLocationId = requestedLocationId && locationIds.includes(requestedLocationId)
    ? requestedLocationId
    : "all";
  let reportData: RestaurantReport | null = null;
  let attendanceSummary: RestaurantLaborSummary | null = null;
  if (view === "reports") {
    const reportAdmin = createAdminClient();
    const { data: reportResult, error: reportError } = await reportAdmin.rpc("get_restaurant_report", {
      p_org_id: context.orgId,
      p_location_ids: selectedReportLocationId === "all" ? locationIds : [selectedReportLocationId],
      p_start_at: reportStart.toISOString(),
      p_end_at: reportEnd.toISOString(),
    });
    if (reportError) throw new Error(`Could not load restaurant report: ${reportError.message}`);
    if (!isRestaurantReport(reportResult)) throw new Error("The restaurant report returned invalid data.");
    reportData = reportResult;
    if (enabledModules.includes("HRM") && locationIds.length > 0 && await canPermission("hrm", "view")) {
      const { data: attendanceResult, error: attendanceError } = await reportAdmin.rpc("get_restaurant_labor_hours", {
        p_org_id: context.orgId,
        p_start_date: reportFrom,
        p_end_date: reportTo,
        p_location_ids: selectedReportLocationId === "all" ? locationIds : [selectedReportLocationId],
      });
      if (attendanceError) throw new Error(`Could not load Restaurant labor summary: ${attendanceError.message}`);
      if (!isRecord(attendanceResult)
        || typeof attendanceResult.total_hours !== "number"
        || typeof attendanceResult.staff_count !== "number"
        || typeof attendanceResult.record_count !== "number"
        || !Array.isArray(attendanceResult.by_branch)) {
        throw new Error("The Restaurant labor summary returned invalid data.");
      }
      const byBranch = attendanceResult.by_branch.map((branch: unknown) => {
        if (!isRestaurantLaborBranch(branch)) throw new Error("The Restaurant labor summary returned invalid data.");
        return branch;
      });
      attendanceSummary = {
        total_hours: attendanceResult.total_hours,
        staff_count: attendanceResult.staff_count,
        record_count: attendanceResult.record_count,
        by_branch: byBranch,
      };
    }
  }
  let ingredientSuppliers: Array<{ id: string; name: string }> = [];
  let purchaseOrders: Database["public"]["Tables"]["restaurant_ingredient_purchase_orders"]["Row"][] = [];
  let purchaseItems: Database["public"]["Tables"]["restaurant_ingredient_purchase_items"]["Row"][] = [];
  let ingredientReceipts: Database["public"]["Tables"]["restaurant_ingredient_receipts"]["Row"][] = [];
  let ingredientPayments: Database["public"]["Tables"]["restaurant_ingredient_payments"]["Row"][] = [];
  let invoiceReconciliationHistory: RestaurantInvoiceReconciliationHistory[] = [];
  let ingredientBankAccounts: Array<{ id: string; name: string }> = [];
  let supplierInvoiceAging: Database["public"]["Functions"]["get_restaurant_supplier_invoice_aging"]["Returns"] = [];
  if (view === "ingredients" && locationIds.length > 0) {
    const restaurantAdmin = createAdminClient();
    const [
      { data: supplierRows, error: supplierError },
      { data: purchaseRows, error: purchaseError },
    ] = await Promise.all([
      restaurantAdmin.from("suppliers").select("id, name").eq("org_id", context.orgId).eq("is_active", true).order("name"),
      restaurantAdmin.from("restaurant_ingredient_purchase_orders").select("*")
        .eq("org_id", context.orgId).in("location_id", locationIds)
        .order("created_at", { ascending: false }).limit(100),
    ]);
    if (supplierError) throw new Error(`Could not load Restaurant suppliers: ${supplierError.message}`);
    if (purchaseError) throw new Error(`Could not load Restaurant ingredient purchase orders: ${purchaseError.message}`);
    ingredientSuppliers = supplierRows ?? [];
    purchaseOrders = purchaseRows ?? [];
    const purchaseOrderIds = purchaseOrders.map((order) => order.id);
    if (purchaseOrderIds.length > 0) {
      const [
        { data: itemRows, error: itemError },
        { data: receiptRows, error: receiptError },
        { data: paymentRows, error: paymentError },
        { data: historyRows, error: historyError },
      ] = await Promise.all([
        restaurantAdmin.from("restaurant_ingredient_purchase_items")
          .select("*").eq("org_id", context.orgId).in("purchase_order_id", purchaseOrderIds),
        restaurantAdmin.from("restaurant_ingredient_receipts")
          .select("*").eq("org_id", context.orgId).in("purchase_order_id", purchaseOrderIds),
        restaurantAdmin.from("restaurant_ingredient_payments")
          .select("*").eq("org_id", context.orgId).in("purchase_order_id", purchaseOrderIds)
          .order("payment_date", { ascending: false }),
        restaurantAdmin.rpc("get_restaurant_invoice_reconciliation_history", {
          p_org_id: context.orgId,
          p_purchase_order_ids: purchaseOrderIds,
          p_per_order_limit: 11,
        }),
      ]);
      if (itemError) throw new Error(`Could not load Restaurant purchase order lines: ${itemError.message}`);
      if (receiptError) throw new Error(`Could not load Restaurant purchase receipts: ${receiptError.message}`);
      if (paymentError) throw new Error(`Could not load Restaurant supplier payments: ${paymentError.message}`);
      if (historyError) throw new Error(`Could not load Restaurant invoice reconciliation history: ${historyError.message}`);
      purchaseItems = itemRows ?? [];
      ingredientReceipts = receiptRows ?? [];
      ingredientPayments = paymentRows ?? [];
      const history = historyRows ?? [];
      const recorderIds = Array.from(new Set(history.map((entry) => entry.recorded_by)));
      const { data: recorderProfiles, error: recorderProfilesError } = recorderIds.length
        ? await restaurantAdmin.from("profiles").select("id, full_name").in("id", recorderIds)
        : { data: [], error: null };
      if (recorderProfilesError) throw new Error(`Could not load invoice reconciliation recorders: ${recorderProfilesError.message}`);
      const recorderNames = new Map((recorderProfiles ?? []).map((profile) => [
        profile.id,
        profile.full_name?.trim() || "Unknown user",
      ]));
      invoiceReconciliationHistory = history.map((entry) => ({
        ...entry,
        recorded_by_name: recorderNames.get(entry.recorded_by) ?? "Unknown user",
      }));
    }
    if (await canPermission("banking", "edit")
      && await canTabPermission("banking", "banking", "accounts", "edit")) {
      const { data: bankRows, error: bankError } = await restaurantAdmin.from("bank_accounts")
        .select("id, name").eq("org_id", context.orgId).order("name");
      if (bankError) throw new Error(`Could not load Bank Accounts for Restaurant supplier payments: ${bankError.message}`);
      ingredientBankAccounts = bankRows ?? [];
    }
    const { data: invoiceRows, error: invoiceError } = await restaurantAdmin.rpc("get_restaurant_supplier_invoice_aging", {
      p_org_id: context.orgId,
      p_location_ids: locationIds,
    });
    if (invoiceError) throw new Error(`Could not load Restaurant supplier invoice aging: ${invoiceError.message}`);
    supplierInvoiceAging = invoiceRows ?? [];
  }
  const accessibleTables = (tables ?? []).filter((table) => locationIds.includes(table.location_id));
  const accessibleOrders = Array.from(new Map([...(orders ?? []), ...(openOrders ?? [])]
    .filter((order) => locationIds.includes(order.location_id))
    .map((order) => [order.id, order])).values())
    .sort((first, second) => second.created_at.localeCompare(first.created_at));
  const orderIds = accessibleOrders.map(({ id }) => id);
  const [
    { data: orderItems, error: orderItemsError },
    { data: payments, error: paymentsError },
    { data: bills, error: billsError },
  ] = orderIds.length
    ? await Promise.all([
        supabase.from("restaurant_order_items").select("*").eq("org_id", context.orgId).in("order_id", orderIds).order("created_at"),
        supabase.from("restaurant_order_payments").select("*").eq("org_id", context.orgId).in("order_id", orderIds).order("paid_at"),
        supabase.from("restaurant_bills").select("*").eq("org_id", context.orgId).in("order_id", orderIds).order("created_at"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
        { data: [], error: null },
      ];
  const billIds = (bills ?? []).map(({ id }) => id);
  const { data: billItems, error: billItemsError } = billIds.length
    ? await supabase.from("restaurant_bill_items").select("*").eq("org_id", context.orgId).in("bill_id", billIds)
    : { data: [], error: null };
  const orderDetailError = [orderItemsError, paymentsError, billsError, billItemsError].find((error) => error);
  if (orderDetailError) {
    throw new Error(`Could not load restaurant order details: ${orderDetailError.message}`);
  }

  return (
    <RestaurantView
      view={view}
      cateringEvents={cateringEvents ?? []}
      cateringEventHistory={cateringEventHistory ?? []}
      cateringQuotes={cateringQuotes ?? []}
      cateringPayments={cateringPayments ?? []}
      cateringInvoices={cateringInvoices ?? []}
      cateringPrepTasks={cateringPrepTasks ?? []}
      cateringMenuPlans={cateringMenuPlans ?? []}
      cateringStaff={cateringStaff}
      cateringDataError={cateringDataErrorMessage}
      canIssueCateringInvoices={await canPermission("accounting", "create")
        && await canTabPermission("accounting", "accounting", "receivables", "create")}
      reportData={reportData}
      reportFrom={reportFrom}
      reportTo={reportTo}
      reportLocationId={selectedReportLocationId}
      orgSlug={organization.slug}
      orgId={context.orgId}
      currency={context.currency}
      onlineSettings={onlineSettings ?? []}
      branchScoped={context.isBranchScoped}
      canCreateOrders={await canTabPermission("restaurant", "operations", "orders", "create")}
      canEditOrders={await canTabPermission("restaurant", "operations", "orders", "edit")}
      canCreateMenu={!context.isBranchScoped && await canTabPermission("restaurant", "operations", "menu", "create")}
      canEditMenu={!context.isBranchScoped && await canTabPermission("restaurant", "operations", "menu", "edit")}
      canCreateTables={await canTabPermission("restaurant", "operations", "tables", "create")}
      canEditTables={await canTabPermission("restaurant", "operations", "tables", "edit")}
      canCreateReservations={await canTabPermission("restaurant", "operations", "reservations", "create")}
      canEditReservations={await canTabPermission("restaurant", "operations", "reservations", "edit")}
      canCreateIngredients={!context.isBranchScoped && await canTabPermission("restaurant", "operations", "ingredients", "create")}
      canCreateIngredientPurchases={await canTabPermission("restaurant", "operations", "ingredients", "create")}
      canEditIngredients={await canTabPermission("restaurant", "operations", "ingredients", "edit")}
      canPayIngredientInvoices={await canTabPermission("restaurant", "operations", "ingredients", "edit")}
      locations={accessibleLocations.map((location) => ({
        id: location.id,
        name: location.name,
        storefrontSlug: location.customer_portal_slug,
      }))}
      categories={categories ?? []}
      menuItems={menuItems ?? []}
      modifierGroups={modifierGroups ?? []}
      modifierOptions={modifierOptions ?? []}
      tables={accessibleTables}
      reservations={(reservations ?? []).filter((reservation) => locationIds.includes(reservation.location_id))}
      orders={accessibleOrders}
      orderItems={orderItems ?? []}
      payments={payments ?? []}
      bills={bills ?? []}
      billItems={(billItems ?? []).filter((item) => (bills ?? []).some((bill) => bill.id === item.bill_id))}
      ingredients={ingredients ?? []}
      ingredientStocks={(ingredientStocks ?? []).filter((stock) => locationIds.includes(stock.location_id))}
      recipeIngredients={recipeIngredients ?? []}
      ingredientMovements={(ingredientMovements ?? []).filter((movement) => locationIds.includes(movement.location_id))}
      suppliers={ingredientSuppliers}
      purchaseOrders={purchaseOrders}
      purchaseItems={purchaseItems}
      ingredientReceipts={ingredientReceipts}
      ingredientPayments={ingredientPayments}
      invoiceReconciliationHistory={invoiceReconciliationHistory}
      ingredientBankAccounts={ingredientBankAccounts}
      supplierInvoiceAging={supplierInvoiceAging}
      attendanceSummary={attendanceSummary}
      deliveryEmployees={deliveryEmployees}
    />
  );
}
