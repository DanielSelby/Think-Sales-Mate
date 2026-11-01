"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/currency";
import { searchCustomers, type CustomerOption } from "@/app/(dashboard)/pos/actions";
import type { Database, Json } from "@/types/database";
import {
  createRestaurantOrder,
  createRestaurantReservation,
  assignRestaurantReservationTable,
  createRestaurantCateringEvent,
  createRestaurantCateringQuote,
  issueRestaurantCateringFinalInvoice,
  saveRestaurantCateringMenuPlan,
  createRestaurantCateringPrepTask,
  recordRestaurantCateringPayment,
  adjustRestaurantIngredientStock,
  saveRestaurantIngredientMinimumStock,
  recordRestaurantPayment,
  refundRestaurantPayment,
  saveRestaurantCategory,
  saveRestaurantMenuItem,
  uploadRestaurantMenuImage,
  saveRestaurantOnlineSettings,
  saveRestaurantIngredient,
  createRestaurantIngredientPurchaseOrder,
  reconcileRestaurantIngredientInvoice,
  recordRestaurantIngredientSupplierPayment,
  receiveRestaurantIngredientPurchase,
  saveRestaurantRecipe,
  saveRestaurantModifierGroup,
  saveRestaurantModifierOption,
  saveRestaurantTable,
  updateRestaurantKitchenStatus,
  updateRestaurantOrderStatus,
  updateRestaurantDeliveryDispatch,
  updateRestaurantReservationStatus,
  updateRestaurantCateringEventStatus,
  updateRestaurantCateringPrepTask,
  updateRestaurantCateringPrepChecklistItem,
  splitRestaurantBillByItems,
  splitRestaurantBillEqually,
} from "./actions";
import { RestaurantMenuImporter } from "@/components/restaurant/restaurant-menu-importer";
import { IncomingOrderAlerts } from "@/components/restaurant/incoming-order-alerts";
import { RestaurantSupplierInvoiceAging, type RestaurantSupplierInvoiceAgingRow } from "@/components/restaurant/restaurant-supplier-invoice-aging";

type Category = Database["public"]["Tables"]["restaurant_menu_categories"]["Row"];
type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type ModifierGroup = Database["public"]["Tables"]["restaurant_modifier_groups"]["Row"];
type ModifierOption = Database["public"]["Tables"]["restaurant_modifier_options"]["Row"];
type DiningTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type RestaurantReservation = Database["public"]["Tables"]["restaurant_reservations"]["Row"];
type RestaurantCateringEvent = Database["public"]["Tables"]["restaurant_catering_events"]["Row"];
type RestaurantCateringQuote = Database["public"]["Tables"]["restaurant_catering_quotes"]["Row"];
type RestaurantCateringPayment = Database["public"]["Tables"]["restaurant_catering_payments"]["Row"];
type RestaurantCateringInvoice = Database["public"]["Tables"]["invoices"]["Row"];
type RestaurantCateringPrepTask = Database["public"]["Tables"]["restaurant_catering_prep_tasks"]["Row"];
type RestaurantCateringMenuPlanItem = Database["public"]["Tables"]["restaurant_catering_menu_items"]["Row"];
type RestaurantCateringStaff = { userId: string; fullName: string; locationIds: string[] };
type RestaurantDeliveryEmployee = { id: string; fullName: string; locationId: string | null };
type RestaurantOrder = Database["public"]["Tables"]["restaurant_orders"]["Row"];
type OrderItem = Database["public"]["Tables"]["restaurant_order_items"]["Row"];
type OrderPayment = Database["public"]["Tables"]["restaurant_order_payments"]["Row"];
type RestaurantBill = Database["public"]["Tables"]["restaurant_bills"]["Row"];
type RestaurantBillItem = Database["public"]["Tables"]["restaurant_bill_items"]["Row"];
type Location = { id: string; name: string; storefrontSlug: string };
type OnlineSetting = Database["public"]["Tables"]["restaurant_online_settings"]["Row"];
type ReservationDayHours = { closed: boolean; open: string; close: string };
const reservationDayLabels = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function getReservationHours(value: Json | undefined): ReservationDayHours[] {
  if (!Array.isArray(value) || value.length !== 7) {
    return reservationDayLabels.map(() => ({ closed: false, open: "09:00", close: "21:00" }));
  }
  return value.map((day) => {
    if (typeof day !== "object" || day === null || Array.isArray(day)) {
      return { closed: true, open: "09:00", close: "21:00" };
    }
    return {
      closed: day.closed === true,
      open: typeof day.open === "string" ? day.open : "09:00",
      close: typeof day.close === "string" ? day.close : "21:00",
    };
  });
}
type PrepStation = "kitchen" | "bar" | "dessert";
type ViewKey = "orders" | "kitchen" | "menu" | "online-ordering" | "tables" | "reservations" | "catering" | "reports" | "ingredients";
const prepStationLabels: Record<PrepStation, string> = { kitchen: "Kitchen", bar: "Bar", dessert: "Dessert" };
type RestaurantIngredient = Database["public"]["Tables"]["restaurant_ingredients"]["Row"];
type RestaurantIngredientStock = Database["public"]["Tables"]["restaurant_ingredient_stock"]["Row"];
type RestaurantRecipeIngredient = Database["public"]["Tables"]["restaurant_recipe_ingredients"]["Row"];
type RestaurantIngredientMovement = Database["public"]["Tables"]["restaurant_ingredient_movements"]["Row"];
type RestaurantIngredientPurchaseOrder = Database["public"]["Tables"]["restaurant_ingredient_purchase_orders"]["Row"];
type RestaurantIngredientPurchaseItem = Database["public"]["Tables"]["restaurant_ingredient_purchase_items"]["Row"];
type RestaurantIngredientReceipt = Database["public"]["Tables"]["restaurant_ingredient_receipts"]["Row"];
type RestaurantIngredientPayment = Database["public"]["Tables"]["restaurant_ingredient_payments"]["Row"];
type RestaurantSupplierInvoiceAging = RestaurantSupplierInvoiceAgingRow;
type RestaurantInvoiceReconciliationHistory = Database["public"]["Functions"]["get_restaurant_invoice_reconciliation_history"]["Returns"][number] & {
  recorded_by_name: string;
};
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

const statusLabels: Record<RestaurantOrder["status"], string> = {
  pending_payment: "Awaiting payment",
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
};

const reservationStatusLabels: Record<RestaurantReservation["status"], string> = {
  waitlisted: "Waitlist",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const kitchenStatusLabels: Record<OrderItem["kitchen_status"], string> = {
  new: "New",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  cancelled: "Cancelled",
};

const nextKitchenStatus: Partial<Record<OrderItem["kitchen_status"], OrderItem["kitchen_status"]>> = {
  new: "preparing",
  preparing: "ready",
  ready: "served",
};

function money(value: number, currency: string) {
  return formatMoney(value, currency);
}

function localDateKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function selectedModifierNames(selections: Json) {
  if (!Array.isArray(selections)) return [];
  return selections.flatMap((selection) => {
    if (typeof selection !== "object" || selection === null || Array.isArray(selection)) return [];
    return typeof selection.name === "string" ? [selection.name] : [];
  });
}

export default function RestaurantView({
  view,
  cateringEvents,
  cateringEventHistory,
  cateringQuotes,
  cateringPayments,
  cateringInvoices,
  cateringPrepTasks,
  cateringMenuPlans,
  cateringStaff,
  cateringDataError,
  canIssueCateringInvoices,
  orgId,
  reportData,
  reportFrom,
  reportTo,
  reportLocationId,
  orgSlug,
  currency,
  onlineSettings,
  branchScoped,
  canCreateOrders,
  canEditOrders,
  canCreateMenu,
  canEditMenu,
  canCreateTables,
  canEditTables,
  canCreateReservations,
  canEditReservations,
  canCreateIngredients,
  canCreateIngredientPurchases,
  canEditIngredients,
  canPayIngredientInvoices,
  locations,
  categories,
  menuItems,
  modifierGroups,
  modifierOptions,
  tables,
  reservations,
  orders,
  orderItems,
  payments,
  bills,
  billItems,
  ingredients,
  ingredientStocks,
  recipeIngredients,
  ingredientMovements,
  suppliers,
  purchaseOrders,
  purchaseItems,
  ingredientReceipts,
  ingredientPayments,
  invoiceReconciliationHistory,
  ingredientBankAccounts,
  supplierInvoiceAging,
  attendanceSummary,
  deliveryEmployees,
}: {
  view: ViewKey;
  cateringEvents: RestaurantCateringEvent[];
  cateringEventHistory: Database["public"]["Tables"]["restaurant_catering_event_status_history"]["Row"][];
  cateringQuotes: RestaurantCateringQuote[];
  cateringPayments: RestaurantCateringPayment[];
  cateringInvoices: RestaurantCateringInvoice[];
  cateringPrepTasks: RestaurantCateringPrepTask[];
  cateringMenuPlans: RestaurantCateringMenuPlanItem[];
  cateringStaff: RestaurantCateringStaff[];
  cateringDataError: string | null;
  canIssueCateringInvoices: boolean;
  orgId: string;
  reportData: RestaurantReport | null;
  reportFrom: string;
  reportTo: string;
  reportLocationId: string;
  orgSlug: string;
  currency: string;
  onlineSettings: OnlineSetting[];
  branchScoped: boolean;
  canCreateOrders: boolean;
  canEditOrders: boolean;
  canCreateMenu: boolean;
  canEditMenu: boolean;
  canCreateTables: boolean;
  canEditTables: boolean;
  canCreateReservations: boolean;
  canEditReservations: boolean;
  canCreateIngredients: boolean;
  canCreateIngredientPurchases: boolean;
  canEditIngredients: boolean;
  canPayIngredientInvoices: boolean;
  locations: Location[];
  categories: Category[];
  menuItems: MenuItem[];
  modifierGroups: ModifierGroup[];
  modifierOptions: ModifierOption[];
  tables: DiningTable[];
  reservations: RestaurantReservation[];
  orders: RestaurantOrder[];
  orderItems: OrderItem[];
  payments: OrderPayment[];
  bills: RestaurantBill[];
  billItems: RestaurantBillItem[];
  ingredients: RestaurantIngredient[];
  ingredientStocks: RestaurantIngredientStock[];
  recipeIngredients: RestaurantRecipeIngredient[];
  ingredientMovements: RestaurantIngredientMovement[];
  suppliers: Array<{ id: string; name: string }>;
  purchaseOrders: RestaurantIngredientPurchaseOrder[];
  purchaseItems: RestaurantIngredientPurchaseItem[];
  ingredientReceipts: RestaurantIngredientReceipt[];
  ingredientPayments: RestaurantIngredientPayment[];
  invoiceReconciliationHistory: RestaurantInvoiceReconciliationHistory[];
  ingredientBankAccounts: Array<{ id: string; name: string }>;
  supplierInvoiceAging: RestaurantSupplierInvoiceAging[];
  attendanceSummary: RestaurantLaborSummary | null;
  deliveryEmployees: RestaurantDeliveryEmployee[];
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "unavailable">("connecting");

  useEffect(() => {
    let refreshTimer: number | undefined;
    const refresh = () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      refreshTimer = window.setTimeout(() => router.refresh(), 250);
    };
    const channel = supabase
      .channel(`restaurant-updates:${orgId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_menu_categories", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_menu_items", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_modifier_groups", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_modifier_options", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_tables", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_reservations", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_catering_events", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_catering_menu_items", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_orders", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_order_items", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_order_payments", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_bills", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_bill_items", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_ingredients", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_ingredient_stock", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_recipe_ingredients", filter: `org_id=eq.${orgId}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "restaurant_ingredient_movements", filter: `org_id=eq.${orgId}` }, refresh)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setRealtimeStatus("unavailable");
        else setRealtimeStatus("connecting");
      });

    return () => {
      if (refreshTimer !== undefined) window.clearTimeout(refreshTimer);
      void supabase.removeChannel(channel);
    };
  }, [orgId, router, supabase]);

  async function runAction(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setNotice(null);
    setIsPending(true);
    try {
      const result = await work();
      const emailNotification = typeof result === "object" && result !== null
        && "emailNotification" in result
        ? result.emailNotification
        : null;
      const accountingWarning = typeof result === "object" && result !== null
        && "accountingPosted" in result && result.accountingPosted === false
        ? " Ingredient stock was received, but no accounting journal was posted. Configure both Restaurant ingredient accounts in Accounting."
        : "";
      let emailNotice = "";
      if (typeof emailNotification === "object" && emailNotification !== null
        && "sent" in emailNotification && emailNotification.sent === false) {
        const reason = "reason" in emailNotification && typeof emailNotification.reason === "string"
          ? ` ${emailNotification.reason}`
          : "";
        emailNotice = ` Order status was updated, but the customer email could not be sent.${reason}`;
      }
      setNotice({ type: "success", text: `${success}${emailNotice}${accountingWarning}` });
      router.refresh();
      return true;
    } catch (error) {
      setNotice({ type: "error", text: error instanceof Error ? error.message : "The restaurant action failed." });
      return false;
    } finally {
      setIsPending(false);
    }
  }

  const itemsByOrder = new Map<string, OrderItem[]>();
  orderItems.forEach((item) => {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  });
  const paymentsByOrder = new Map<string, number>();
  payments.forEach((payment) => {
    const signedAmount = payment.payment_type === "payment" ? Number(payment.amount) : -Number(payment.amount);
    paymentsByOrder.set(payment.order_id, (paymentsByOrder.get(payment.order_id) ?? 0) + signedAmount);
  });
  const billsByOrder = new Map<string, RestaurantBill[]>();
  bills.forEach((bill) => billsByOrder.set(bill.order_id, [...(billsByOrder.get(bill.order_id) ?? []), bill]));
  const billItemsByBill = new Map<string, RestaurantBillItem[]>();
  billItems.forEach((item) => billItemsByBill.set(item.bill_id, [...(billItemsByBill.get(item.bill_id) ?? []), item]));
  const branchOrders = orders.filter((order) => order.location_id === locationId);
  const branchActiveOrders = branchOrders.filter((order) => !["completed", "cancelled"].includes(order.status));

  return (
    <div className="restaurant-management-page space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Restaurant Management</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your menu, tables, service orders, kitchen queue, and payments separately from product sales.</p>
        </div>
        {view !== "menu" && view !== "online-ordering" && view !== "reports" && locations.length > 0 && (
          <label className="text-xs font-semibold text-slate-600">
            Branch
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="ml-2 h-10 min-w-48 rounded-lg border bg-white px-3 text-sm">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        )}
        {canCreateOrders && <Link href="/restaurant/pos" className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700">Open Restaurant POS</Link>}
      </header>

      {(view === "orders" || view === "kitchen") && <IncomingOrderAlerts orgId={orgId} locationIds={locations.map((location) => location.id)} />}

      <nav aria-label="Restaurant sections" className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">
        {([
          ["orders", "Orders & Kitchen"],
          ["kitchen", "Kitchen Display"],
          ["menu", "Menu Management"],
          ["online-ordering", "Online Ordering"],
          ["tables", "Dining Tables"],
          ["reservations", "Reservations & Waitlist"],
          ["catering", "Catering & Events"],
          ["reports", "Reports & Analytics"],
          ["ingredients", "Ingredients & Recipes"],
        ] as const).map(([key, label]) => (
          <Link key={key} href={key === "orders" ? "/restaurant" : `/restaurant?view=${key}`} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {view === "kitchen" && <KitchenDisplay
        orders={branchOrders}
        orderItems={orderItems.filter((item) => branchOrders.some((order) => order.id === item.order_id))}
        tables={tables}
        locations={locations}
        locationId={locationId}
        canEdit={canEditOrders}
        isPending={isPending}
        onUpdate={(itemId, status) => runAction(
          () => updateRestaurantKitchenStatus(itemId, status),
          `Kitchen item marked ${kitchenStatusLabels[status]}.`,
        )}
        onOrderUpdate={(orderId, status) => runAction(
          () => updateRestaurantOrderStatus(orderId, status),
          `Order marked ${statusLabels[status]}.`,
        )}
      />}

      {notice && <p role="status" className={`rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}
      {(view === "orders" || view === "kitchen") && <p aria-live="polite" className="text-xs text-slate-500">
        {realtimeStatus === "connected" ? "Live updates on" : realtimeStatus === "connecting" ? "Connecting to live updates..." : "Live updates unavailable. Refresh this page to see the latest orders."}
      </p>}

      {view === "orders" && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["Open orders", branchActiveOrders.length],
              ["In kitchen", branchOrders.filter((order) => ["confirmed", "preparing"].includes(order.status)).length],
              ["Ready to serve", branchOrders.filter((order) => order.status === "ready").length],
            ].map(([label, value]) => <div key={String(label)} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{value}</p></div>)}
          </div>
          {canCreateOrders && (
            <CreateOrderForm
              currency={currency}
              locationId={locationId}
              hasLocations={locations.length > 0}
              menuItems={menuItems.filter((item) => item.is_active)}
              modifierGroups={modifierGroups}
              modifierOptions={modifierOptions}
              tables={tables.filter((table) => table.location_id === locationId && table.is_active && !branchActiveOrders.some((order) => order.table_id === table.id))}
              isPending={isPending}
              onCreate={(input) => runAction(() => createRestaurantOrder(input), "Restaurant order created.")}
            />
          )}
          <section className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div><h2 className="text-lg font-bold text-slate-950">Service & kitchen queue</h2><p className="text-xs text-slate-500">Recent orders and all active orders for branches you can access.</p></div>
              <span className="text-xs text-slate-500">{branchOrders.length} orders loaded</span>
            </div>
            {branchOrders.length === 0 ? <EmptyState title="No restaurant orders yet" message="Create an order above to start the kitchen queue." /> : branchOrders.map((order) => {
              const orderLines = itemsByOrder.get(order.id) ?? [];
              const paid = paymentsByOrder.get(order.id) ?? 0;
              const balance = Math.max(0, Number(order.total) - paid);
              const orderBills = billsByOrder.get(order.id) ?? [];
              const orderPayments = payments.filter((payment) => payment.order_id === order.id);
              const location = locations.find((item) => item.id === order.location_id)?.name ?? "Branch";
              const table = tables.find((item) => item.id === order.table_id)?.table_name;
              return (
                <article key={order.id} className="rounded-xl border bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-bold text-slate-950">Order #{order.order_number}</h3>
                        <span className="rounded-full bg-sky-50 px-2 py-1 text-[11px] font-semibold text-sky-800">Cue No. {order.cue_number}</span>
                        <span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">{statusLabels[order.status]}</span>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] capitalize text-slate-600">{order.order_type.replace("_", " ")}</span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">{location}{table ? ` · Table ${table}` : ""} · {new Date(order.created_at).toLocaleString()}</p>
                      {order.customer_name && <p className="mt-1 text-sm text-slate-700">{order.customer_name}{order.customer_phone ? ` · ${order.customer_phone}` : ""}</p>}
                      {order.delivery_address && <p className="mt-1 text-xs text-slate-600">Delivery to: {order.delivery_address}</p>}
                      {Number(order.delivery_fee) > 0 && <p className="mt-1 text-xs text-slate-600">Items {money(Number(order.subtotal), currency)} · Delivery fee {money(Number(order.delivery_fee), currency)} · Total {money(Number(order.total), currency)}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-slate-950">{money(Number(order.total), currency)}</p>
                      <p className={`text-xs ${balance > 0 ? "text-amber-700" : "text-emerald-700"}`}>{balance > 0 ? `${money(balance, currency)} due` : "Paid"}</p>
                    </div>
                  </div>
                  {order.order_type === "delivery" && <DeliveryDispatchControls
                    order={order}
                    employees={deliveryEmployees.filter((employee) => employee.locationId === null || employee.locationId === order.location_id)}
                    canEdit={canEditOrders}
                    isPending={isPending}
                    onUpdate={(employeeId, status, failureNote) => runAction(
                      () => updateRestaurantDeliveryDispatch({ orderId: order.id, employeeId, status, failureNote }),
                      status === "delivered" ? "Delivery marked delivered." : status === "failed" ? "Delivery failure recorded." : `Delivery dispatch marked ${status.replace("_", " ")}.`,
                    )}
                  />}
                  <ul className="mt-3 divide-y rounded-lg bg-slate-50 px-3">
                    {orderLines.map((item) => {
                      const nextStatus = item.kitchen_status === "ready" && !["ready", "served"].includes(order.status)
                        ? undefined
                        : nextKitchenStatus[item.kitchen_status];
                      return <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1">{item.quantity} × {item.item_name}<span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[10px] text-slate-500">{prepStationLabels[item.prep_station]}</span>{selectedModifierNames(item.modifier_selections).length > 0 && <span className="block text-xs text-slate-500">Options: {selectedModifierNames(item.modifier_selections).join(", ")}</span>}{item.notes && <span className="block text-xs text-slate-500">{item.notes}</span>}</span>
                        <span className="text-xs text-slate-500">{kitchenStatusLabels[item.kitchen_status]}</span>
                        {canEditOrders && nextStatus && !["pending_payment", "completed", "cancelled"].includes(order.status) && <button type="button" disabled={isPending} onClick={() => runAction(() => updateRestaurantKitchenStatus(item.id, nextStatus), "Kitchen item updated.")} className="rounded border bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">Mark {kitchenStatusLabels[nextStatus]}</button>}
                        <strong className="w-24 text-right">{money(Number(item.line_total), currency)}</strong>
                      </li>;
                    })}
                  </ul>
                  {order.notes && <p className="mt-2 text-xs text-slate-500">Order note: {order.notes}</p>}
                  <div className="mt-3 border-t pt-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>Payment status: <strong className="capitalize">{order.payment_status}</strong> · Net received {money(paid, currency)}{balance > 0 ? ` · ${money(balance, currency)} due` : ""}</span>
                      {canEditOrders && !["pending_payment", "completed", "cancelled"].includes(order.status) && (
                        <OrderStatusControls order={order} isPending={isPending} onUpdate={(status) => runAction(() => updateRestaurantOrderStatus(order.id, status), `Order marked ${statusLabels[status]}.`)} />
                      )}
                    </div>
                    {canEditOrders && orderBills.length === 1 && orderPayments.length === 0 && !["pending_payment", "cancelled"].includes(order.status) && (
                      <SplitBillForm
                        items={orderLines}
                        orderTotal={Number(order.total)}
                        allowItemSplit={Number(order.delivery_fee) === 0}
                        currency={currency}
                        isPending={isPending}
                        onSplitItems={(splitBills) => runAction(
                          () => splitRestaurantBillByItems({ orderId: order.id, bills: splitBills }),
                          "Bill split by items.",
                        )}
                        onSplitEqually={(shareCount) => runAction(
                          () => splitRestaurantBillEqually({ orderId: order.id, shareCount }),
                          "Bill split into equal shares.",
                        )}
                      />
                    )}
                    <div className="mt-3 space-y-3">
                      {orderBills.map((bill) => {
                        const billPayments = orderPayments.filter((payment) => payment.bill_id === bill.id);
                        const billPaid = billPayments.reduce((sum, payment) => sum + (payment.payment_type === "payment" ? Number(payment.amount) : -Number(payment.amount)), 0);
                        const billTips = billPayments.reduce((sum, payment) => sum + (payment.payment_type === "payment" ? Number(payment.tip_amount) : -Number(payment.tip_amount)), 0);
                        const due = Math.max(0, Number(bill.amount) - billPaid);
                        const allocations = billItemsByBill.get(bill.id) ?? [];
                        return <section key={bill.id} className="rounded-lg border bg-slate-50 p-3">
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div>
                              <h4 className="text-sm font-bold text-slate-900">{bill.name}</h4>
                              <p className="text-xs capitalize text-slate-500">{bill.split_type === "single" ? "Full check" : `${bill.split_type} split`} · {money(Number(bill.amount), currency)} · {money(due, currency)} due{billTips !== 0 ? ` · Net tips ${money(billTips, currency)}` : ""}</p>
                            </div>
                            <Link href={`/restaurant/receipt?orderId=${encodeURIComponent(order.id)}&billId=${encodeURIComponent(bill.id)}`} target="_blank" rel="noreferrer" className="rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700">Print receipt</Link>
                          </div>
                          {bill.split_type !== "equal" && <ul className="mt-2 space-y-1 text-xs text-slate-600">
                            {allocations.map((allocation) => {
                              const line = orderLines.find((item) => item.id === allocation.order_item_id);
                              return line ? <li key={allocation.id}>{allocation.quantity} × {line.item_name} · {money(Number(line.unit_price) * Number(allocation.quantity), currency)}</li> : null;
                            })}
                          </ul>}
                          {bill.split_type === "equal" && <p className="mt-2 text-xs text-slate-500">Equal share of the order; items are not assigned to individual checks.</p>}
                          {billPayments.length > 0 && <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-slate-600">
                            {billPayments.map((payment) => {
                              const refunded = orderPayments.filter((entry) => entry.refund_of_payment_id === payment.id);
                              const refundedAmount = refunded.reduce((sum, entry) => sum + Number(entry.amount), 0);
                              const refundedTip = refunded.reduce((sum, entry) => sum + Number(entry.tip_amount), 0);
                              return <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2">
                                <span>{payment.payment_type === "refund" ? "Refund" : "Payment"} · {payment.payment_provider ?? payment.payment_method.replace("_", " ")} · {new Date(payment.paid_at).toLocaleString()} · {payment.payment_type === "refund" ? "-" : ""}{money(Number(payment.amount), currency)}{Number(payment.tip_amount) > 0 ? ` ${payment.payment_type === "refund" ? "-" : "+"} ${money(Number(payment.tip_amount), currency)} tip` : ""}</span>
                                {canEditOrders && payment.payment_type === "payment"
                                  && payment.payment_provider !== "paystack"
                                  && (Number(payment.amount) > refundedAmount || Number(payment.tip_amount) > refundedTip)
                                  && <RefundForm
                                    key={`${payment.id}:${(Number(payment.amount) - refundedAmount).toFixed(2)}:${(Number(payment.tip_amount) - refundedTip).toFixed(2)}`}
                                    amount={Number(payment.amount) - refundedAmount}
                                    tipAmount={Number(payment.tip_amount) - refundedTip}
                                    isPending={isPending}
                                    onSubmit={(amount, tipAmount, method) => runAction(
                                      () => refundRestaurantPayment({ orderId: order.id, paymentId: payment.id, amount, tipAmount, method }),
                                      "Refund recorded.",
                                    )}
                                  />}
                                {canEditOrders && payment.payment_type === "payment" && payment.payment_provider === "paystack"
                                  && <span className="text-[10px] text-slate-500">Refund through Paystack</span>}
                              </li>;
                            })}
                          </ul>}
                          {canCreateOrders && due > 0 && !["pending_payment", "cancelled"].includes(order.status) && <div className="mt-3 border-t pt-3">
                            <PaymentForm
                              key={due.toFixed(2)}
                              balance={due}
                              isPending={isPending}
                              onSubmit={(amount, tipAmount, method) => runAction(
                                () => recordRestaurantPayment({ orderId: order.id, billId: bill.id, amount, tipAmount, method }),
                                "Payment and tip recorded.",
                              )}
                            />
                          </div>}
                        </section>;
                      })}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      )}

      {view === "online-ordering" && <RestaurantOnlineSettingsPanel
        orgSlug={orgSlug}
        locations={locations}
        settings={onlineSettings}
        canEdit={canEditMenu}
        isPending={isPending}
        onAction={runAction}
      />}
      {view === "menu" && <>
        <MenuManagement currency={currency} categories={categories} menuItems={menuItems} modifierGroups={modifierGroups} modifierOptions={modifierOptions} canCreate={canCreateMenu} canEdit={canEditMenu} isPending={isPending} onAction={runAction} />
      </>}
      {view === "tables" && <TableManagement locations={locations} tables={tables} orders={orders} selectedLocationId={locationId} branchScoped={branchScoped} canCreate={canCreateTables} canEdit={canEditTables} isPending={isPending} onAction={runAction} />}
      {view === "reservations" && <ReservationsManagement
        locationId={locationId}
        locations={locations}
        tables={tables.filter((table) => table.location_id === locationId)}
        reservations={reservations.filter((reservation) => reservation.location_id === locationId)}
        canCreate={canCreateReservations}
        canEdit={canEditReservations}
        isPending={isPending}
        onAction={runAction}
      />}
      {view === "catering" && <CateringEventsManagement
        locationId={locationId}
        locations={locations}
        events={cateringEvents}
        statusHistory={cateringEventHistory}
        quotes={cateringQuotes}
        payments={cateringPayments}
        invoices={cateringInvoices}
        prepTasks={cateringPrepTasks}
        menuPlans={cateringMenuPlans}
        menuItems={menuItems}
        ingredients={ingredients}
        ingredientStocks={ingredientStocks}
        recipeIngredients={recipeIngredients}
        staff={cateringStaff}
        currency={currency}
        dataError={cateringDataError}
        canIssueInvoice={canIssueCateringInvoices}
        canCreate={canCreateOrders}
        canEdit={canEditOrders}
        isPending={isPending}
        onAction={runAction}
      />}
      {view === "reports" && <RestaurantReports
        currency={currency}
        locations={locations}
        report={reportData}
        from={reportFrom}
        to={reportTo}
        locationId={reportLocationId}
        attendanceSummary={attendanceSummary}
      />}
      {view === "ingredients" && <RestaurantIngredientManagement
        currency={currency}
        locationId={locationId}
        locations={locations}
        menuItems={menuItems}
        ingredients={ingredients}
        stocks={ingredientStocks}
        recipes={recipeIngredients}
        movements={ingredientMovements}
        suppliers={suppliers}
        purchaseOrders={purchaseOrders}
        purchaseItems={purchaseItems}
        receipts={ingredientReceipts}
        supplierPayments={ingredientPayments}
        invoiceReconciliationHistory={invoiceReconciliationHistory}
        bankAccounts={ingredientBankAccounts}
        supplierInvoiceAging={supplierInvoiceAging}
        branchScoped={branchScoped}
        canCreate={canCreateIngredients}
        canCreatePurchases={canCreateIngredientPurchases}
        canEdit={canEditIngredients}
        canPayInvoices={canPayIngredientInvoices}
        isPending={isPending}
        onAction={runAction}
      />}
    </div>
  );
}

function KitchenDisplay({
  orders,
  orderItems,
  tables,
  locations,
  locationId,
  canEdit,
  isPending,
  onUpdate,
  onOrderUpdate,
}: {
  orders: RestaurantOrder[];
  orderItems: OrderItem[];
  tables: DiningTable[];
  locations: Location[];
  locationId: string;
  canEdit: boolean;
  isPending: boolean;
  onUpdate: (itemId: string, status: OrderItem["kitchen_status"]) => void;
  onOrderUpdate: (orderId: string, status: RestaurantOrder["status"]) => void;
}) {
  const [station, setStation] = useState<PrepStation | "all">("all");
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const updateNow = () => setNow(Date.now());
    updateNow();
    const interval = window.setInterval(updateNow, 60_000);
    return () => window.clearInterval(interval);
  }, []);
  const activeOrders = orders.filter((order) => !["pending_payment", "completed", "cancelled"].includes(order.status));
  const tickets = orderItems
    .filter((item) => item.kitchen_status !== "served" && item.kitchen_status !== "cancelled"
      && (station === "all" || item.prep_station === station)
      && activeOrders.some((order) => order.id === item.order_id))
    .map((item) => ({
      item,
      order: activeOrders.find((order) => order.id === item.order_id)!,
    }))
    .sort((a, b) => a.order.created_at.localeCompare(b.order.created_at));
  const progressOrders = activeOrders.filter((order) => orderItems.some((item) =>
    item.order_id === order.id && (station === "all" || item.prep_station === station)));
  const stationCounts = {
    all: orderItems.filter((item) => item.kitchen_status !== "served" && item.kitchen_status !== "cancelled"
      && activeOrders.some((order) => order.id === item.order_id)).length,
    kitchen: orderItems.filter((item) => item.prep_station === "kitchen" && item.kitchen_status !== "served" && item.kitchen_status !== "cancelled"
      && activeOrders.some((order) => order.id === item.order_id)).length,
    bar: orderItems.filter((item) => item.prep_station === "bar" && item.kitchen_status !== "served" && item.kitchen_status !== "cancelled"
      && activeOrders.some((order) => order.id === item.order_id)).length,
    dessert: orderItems.filter((item) => item.prep_station === "dessert" && item.kitchen_status !== "served" && item.kitchen_status !== "cancelled"
      && activeOrders.some((order) => order.id === item.order_id)).length,
  };

  return <section className="space-y-4">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-slate-950">Kitchen display</h2>
        <p className="text-xs text-slate-500">Live preparation tickets for {locations.find((location) => location.id === locationId)?.name ?? "this branch"}, grouped by their menu prep station.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {(["all", "kitchen", "bar", "dessert"] as const).map((value) => <button key={value} type="button" onClick={() => setStation(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${station === value ? "bg-slate-900 text-white" : "border bg-white text-slate-700"}`}>
          {value === "all" ? "All stations" : prepStationLabels[value]} ({stationCounts[value]})
        </button>)}
      </div>
    </header>
    {!canEdit && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">You have view-only kitchen access.</p>}
    {canEdit && progressOrders.length > 0 && <section className="space-y-2 rounded-xl border bg-white p-3">
      <h3 className="text-sm font-bold text-slate-800">Order progression</h3>
      {progressOrders.map((order) => {
        const orderItemsForProgress = orderItems.filter((item) => item.order_id === order.id);
        const nextOrderStatus = order.status === "new" ? "confirmed"
          : order.status === "confirmed" ? "preparing"
            : order.status === "preparing" ? "ready"
              : order.status === "ready" ? (order.order_type === "dine_in" ? "served" : "completed")
                : order.status === "served" ? "completed" : undefined;
        const canAdvance = nextOrderStatus === "ready"
          ? orderItemsForProgress.length > 0 && orderItemsForProgress.every((item) => ["ready", "served", "cancelled"].includes(item.kitchen_status))
          : nextOrderStatus === "served"
            ? orderItemsForProgress.length > 0 && orderItemsForProgress.every((item) => ["served", "cancelled"].includes(item.kitchen_status))
            : true;
        return <div key={order.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2">
          <span className="text-xs font-semibold text-slate-700">Cue No. {order.cue_number} · Order #{order.order_number} · {statusLabels[order.status]}</span>
          <OrderStatusControls
            order={order}
            isPending={isPending}
            canAdvance={canAdvance}
            onUpdate={(status) => onOrderUpdate(order.id, status)}
          />
        </div>;
      })}
    </section>}
    {tickets.length === 0
      ? <EmptyState title={stationCounts.all === 0 ? "Kitchen is clear" : "No tickets at this station"} message={stationCounts.all === 0 ? "New restaurant orders will appear here as soon as they are placed." : "Choose another preparation station to see its active tickets."} />
      : <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {tickets.map(({ item, order }) => {
          const ageMinutes = now === null ? 0 : Math.max(0, Math.floor((now - new Date(order.created_at).getTime()) / 60000));
          const nextStatus = nextKitchenStatus[item.kitchen_status];
          const canServe = item.kitchen_status === "ready" && ["ready", "served"].includes(order.status);
          const targetStatus = canServe ? "served" : nextStatus;
          const table = tables.find((entry) => entry.id === order.table_id)?.table_name;
          return <article key={item.id} className={`rounded-xl border-l-4 bg-white p-4 shadow-sm ${ageMinutes >= 15 ? "border-red-500" : item.kitchen_status === "ready" ? "border-emerald-500" : "border-orange-500"}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-lg font-bold text-slate-950">Cue No. {order.cue_number}</p>
                <p className="text-xs capitalize text-slate-500">Order #{order.order_number} · {order.order_type.replace("_", " ")}{table ? ` · Table ${table}` : ""} · {new Date(order.created_at).toLocaleTimeString()}</p>
              </div>
              <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${ageMinutes >= 15 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-600"}`}>{ageMinutes} min</span>
            </div>
            <div className="mt-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-bold text-slate-950">{item.quantity} × {item.item_name}</p>
                <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-orange-700">{prepStationLabels[item.prep_station]} · {kitchenStatusLabels[item.kitchen_status]}</p>
                {selectedModifierNames(item.modifier_selections).length > 0 && <p className="mt-2 text-xs text-slate-600">Options: {selectedModifierNames(item.modifier_selections).join(", ")}</p>}
                {item.notes && <p className="mt-2 rounded bg-amber-50 p-2 text-xs text-amber-900">Note: {item.notes}</p>}
                {order.notes && <p className="mt-1 text-xs text-slate-500">Order note: {order.notes}</p>}
              </div>
              {canEdit && targetStatus && <button type="button" disabled={isPending} onClick={() => onUpdate(item.id, targetStatus)} className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                {targetStatus === "preparing" ? "Start" : targetStatus === "ready" ? "Mark ready" : "Mark served"}
              </button>}
              {canEdit && item.kitchen_status !== "cancelled" && <button type="button" disabled={isPending} onClick={() => onUpdate(item.id, "cancelled")} className="shrink-0 rounded-lg border border-red-200 px-2 py-2 text-[10px] font-semibold text-red-700 disabled:opacity-50">Cancel item</button>}
            </div>
          </article>;
        })}
      </div>}
  </section>;
}

function RestaurantOnlineSettingsPanel({
  orgSlug,
  locations,
  settings,
  canEdit,
  isPending,
  onAction,
}: {
  orgSlug: string;
  locations: Location[];
  settings: OnlineSetting[];
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const setting = settings.find((entry) => entry.location_id === locationId);
  const location = locations.find((entry) => entry.id === locationId);

  return <section className="space-y-3 rounded-xl border border-orange-200 bg-orange-50/50 p-4">
    <div>
      <h2 className="font-bold text-slate-950">Online ordering</h2>
      <p className="mt-1 text-xs text-slate-600">Publish the Restaurant menu for pickup and delivery. This is separate from the ERP product storefront.</p>
    </div>
    {locations.length === 0 ? <p className="text-sm text-amber-800">Create an active branch before enabling online ordering.</p> : <>
      <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_minmax(12rem,1fr)_auto] md:items-end">
        <label className="text-xs font-semibold text-slate-600">Branch
          <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            {locations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}
          </select>
        </label>
      </div>
      {location && <RestaurantOnlineLocationSettings
        key={location.id}
        orgSlug={orgSlug}
        location={location}
        setting={setting}
        canEdit={canEdit}
        isPending={isPending}
        onAction={onAction}
      />}
      <p className="text-[11px] text-slate-500">Customers can pay at pickup/delivery or use Paystack when server credentials are configured. Pickup and delivery are both enabled; the delivery fee is added to delivery orders.</p>
    </>}
  </section>;
}

function RestaurantOnlineLocationSettings({
  orgSlug,
  location,
  setting,
  canEdit,
  isPending,
  onAction,
}: {
  orgSlug: string;
  location: Location;
  setting: OnlineSetting | undefined;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [isEnabled, setIsEnabled] = useState(setting?.is_enabled ?? false);
  const [deliveryFee, setDeliveryFee] = useState(String(setting?.delivery_fee ?? 0));
  const [sendOrderEmails, setSendOrderEmails] = useState(setting?.send_order_emails ?? true);
  const [acceptsOnlineReservations, setAcceptsOnlineReservations] = useState(setting?.accepts_online_reservations ?? false);
  const [acceptsOnlineEventInquiries, setAcceptsOnlineEventInquiries] = useState(setting?.accepts_online_event_inquiries ?? false);
  const [reservationTimezone, setReservationTimezone] = useState(setting?.reservation_timezone ?? "UTC");
  const [reservationHours, setReservationHours] = useState(() => getReservationHours(setting?.reservation_hours));
  const [reservationDurationMinutes, setReservationDurationMinutes] = useState(String(setting?.reservation_duration_minutes ?? 90));
  const [reservationSlotIntervalMinutes, setReservationSlotIntervalMinutes] = useState(String(setting?.reservation_slot_interval_minutes ?? 30));
  const storefrontPath = `/restaurant-order/${encodeURIComponent(orgSlug)}/branch/${encodeURIComponent(location.storefrontSlug)}`;
  const reservationPath = `/restaurant-reservation/${encodeURIComponent(orgSlug)}/branch/${encodeURIComponent(location.storefrontSlug)}`;

  return <>
    <div className="grid gap-3 md:grid-cols-[minmax(12rem,1fr)_auto] md:items-end">
      <label className="text-xs font-semibold text-slate-600">Delivery fee
        <input type="number" min="0" step="0.01" value={deliveryFee} onChange={(event) => setDeliveryFee(event.target.value)} disabled={!canEdit} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm disabled:bg-slate-100" />
      </label>
      {canEdit && <button type="button" disabled={isPending} onClick={() => onAction(
        () => saveRestaurantOnlineSettings({
          locationId: location.id,
          isEnabled,
          deliveryFee: Number(deliveryFee),
          sendOrderEmails,
          acceptsOnlineReservations,
          acceptsOnlineEventInquiries,
          reservationTimezone,
          reservationHours,
          reservationDurationMinutes: Number(reservationDurationMinutes),
          reservationSlotIntervalMinutes: Number(reservationSlotIntervalMinutes),
        }),
        "Online ordering settings saved.",
      )} className="h-10 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white disabled:opacity-50">Save settings</button>}
    </div>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={isEnabled} onChange={(event) => setIsEnabled(event.target.checked)} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300" />
      Accept online pickup and delivery orders
    </label>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={acceptsOnlineReservations} onChange={(event) => setAcceptsOnlineReservations(event.target.checked)} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300" />
      Accept online table reservations
    </label>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={acceptsOnlineEventInquiries} onChange={(event) => setAcceptsOnlineEventInquiries(event.target.checked)} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300" />
      Show event inquiries on the customer portal
    </label>
    <div className="space-y-3 rounded-xl border bg-slate-50 p-4">
      <h3 className="text-sm font-bold text-slate-800">Reservation hours and slots</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Timezone (IANA)
          <input value={reservationTimezone} onChange={(event) => setReservationTimezone(event.target.value)} disabled={!canEdit} placeholder="Africa/Accra" className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm disabled:bg-slate-100" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Reservation duration (minutes)
          <input type="number" min={30} max={240} step={15} value={reservationDurationMinutes} onChange={(event) => setReservationDurationMinutes(event.target.value)} disabled={!canEdit} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm disabled:bg-slate-100" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Booking interval (minutes)
          <input type="number" min={15} max={120} step={15} value={reservationSlotIntervalMinutes} onChange={(event) => setReservationSlotIntervalMinutes(event.target.value)} disabled={!canEdit} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm disabled:bg-slate-100" />
        </label>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[7rem_5rem_1fr_1fr] gap-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          <span>Day</span><span>Closed</span><span>Opens</span><span>Closes</span>
        </div>
        {reservationHours.map((day, index) => <div key={reservationDayLabels[index]} className="grid grid-cols-[7rem_5rem_1fr_1fr] items-center gap-2">
          <span className="text-xs font-medium text-slate-700">{reservationDayLabels[index]}</span>
          <label className="flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" checked={day.closed} onChange={(event) => setReservationHours((current) => current.map((entry, dayIndex) => dayIndex === index ? { ...entry, closed: event.target.checked } : entry))} disabled={!canEdit} />
            Closed
          </label>
          <input aria-label={`${reservationDayLabels[index]} opening time`} type="time" value={day.open} onChange={(event) => setReservationHours((current) => current.map((entry, dayIndex) => dayIndex === index ? { ...entry, open: event.target.value } : entry))} disabled={!canEdit || day.closed} className="h-9 rounded-lg border bg-white px-2 text-xs disabled:bg-slate-100" />
          <input aria-label={`${reservationDayLabels[index]} closing time`} type="time" value={day.close} onChange={(event) => setReservationHours((current) => current.map((entry, dayIndex) => dayIndex === index ? { ...entry, close: event.target.value } : entry))} disabled={!canEdit || day.closed} className="h-9 rounded-lg border bg-white px-2 text-xs disabled:bg-slate-100" />
        </div>)}
      </div>
      <p className="text-xs text-slate-500">Guests will only see slots that fit the reservation duration and have a suitable free table. Times use this branch timezone.</p>
    </div>
    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
      <input type="checkbox" checked={sendOrderEmails} onChange={(event) => setSendOrderEmails(event.target.checked)} disabled={!canEdit} className="h-4 w-4 rounded border-slate-300" />
      Email customers about online orders and reservations
    </label>
    <p className="text-xs text-slate-500">Requires RESEND_API_KEY and RESEND_FROM_EMAIL to be configured on the server.</p>
    {!canEdit && <p className="text-xs text-amber-800">You have view-only menu access.</p>}
    <p className="text-xs text-slate-600">
      Storefront URL: <Link href={storefrontPath} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 underline">{storefrontPath}</Link>
      {!isEnabled && <span className="ml-1">(currently offline)</span>}
    </p>
    {acceptsOnlineReservations && <p className="text-xs text-slate-600">
      Reservation URL: <Link href={reservationPath} target="_blank" rel="noreferrer" className="font-semibold text-orange-700 underline">{reservationPath}</Link>
    </p>}
  </>;
}

function RestaurantIngredientManagement({
  currency,
  locationId,
  locations,
  menuItems,
  ingredients,
  stocks,
  recipes,
  movements,
  suppliers,
  purchaseOrders,
  purchaseItems,
  receipts,
  supplierPayments,
  invoiceReconciliationHistory,
  bankAccounts,
  supplierInvoiceAging,
  branchScoped,
  canCreate,
  canCreatePurchases,
  canEdit,
  canPayInvoices,
  isPending,
  onAction,
}: {
  currency: string;
  locationId: string;
  locations: Location[];
  menuItems: MenuItem[];
  ingredients: RestaurantIngredient[];
  stocks: RestaurantIngredientStock[];
  recipes: RestaurantRecipeIngredient[];
  movements: RestaurantIngredientMovement[];
  suppliers: Array<{ id: string; name: string }>;
  purchaseOrders: RestaurantIngredientPurchaseOrder[];
  purchaseItems: RestaurantIngredientPurchaseItem[];
  receipts: RestaurantIngredientReceipt[];
  supplierPayments: RestaurantIngredientPayment[];
  invoiceReconciliationHistory: RestaurantInvoiceReconciliationHistory[];
  bankAccounts: Array<{ id: string; name: string }>;
  supplierInvoiceAging: RestaurantSupplierInvoiceAging[];
  branchScoped: boolean;
  canCreate: boolean;
  canCreatePurchases: boolean;
  canEdit: boolean;
  canPayInvoices: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [menuItemId, setMenuItemId] = useState(menuItems[0]?.id ?? "");
  const [recipeLines, setRecipeLines] = useState<Array<{ ingredientId: string; quantity: string }>>([]);
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? "");
  const [purchaseReference, setPurchaseReference] = useState("");
  const [invoiceReference, setInvoiceReference] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [purchaseLines, setPurchaseLines] = useState<Array<{ ingredientId: string; quantity: string; unitCost: string }>>([{ ingredientId: "", quantity: "1", unitCost: "0" }]);
  const selectedMenuItem = menuItems.find((item) => item.id === menuItemId);
  const selectedRecipe = recipes.filter((recipe) => recipe.menu_item_id === menuItemId);
  const recipeCost = selectedRecipe.reduce((sum, line) => {
    const ingredient = ingredients.find((entry) => entry.id === line.ingredient_id);
    return sum + Number(line.quantity) * Number(ingredient?.cost_per_unit ?? 0);
  }, 0);
  const stockAtLocation = stocks.filter((stock) => stock.location_id === locationId);
  const lowStockIngredients = ingredients.filter((ingredient) => {
    if (!ingredient.is_active) return false;
    const stock = stockAtLocation.find((entry) => entry.ingredient_id === ingredient.id);
    return Number(stock?.minimum_quantity ?? 0) > 0
      && Number(stock?.quantity ?? 0) <= Number(stock?.minimum_quantity ?? 0);
  });
  const recentMovements = movements.filter((movement) => movement.location_id === locationId);

  async function submitIngredient(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onAction(() => saveRestaurantIngredient({
      id: ingredientId || undefined,
      name,
      unit,
      costPerUnit: Number(costPerUnit),
      isActive: ingredients.find((entry) => entry.id === ingredientId)?.is_active ?? true,
    }), ingredientId ? "Ingredient updated." : "Ingredient added.");
    if (saved) {
      setIngredientId("");
      setName("");
      setUnit("");
      setCostPerUnit("");
    }
  }

  async function submitRecipe(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onAction(() => saveRestaurantRecipe({
      menuItemId,
      ingredients: recipeLines.map((line) => ({ ingredientId: line.ingredientId, quantity: Number(line.quantity) })),
    }), "Recipe saved.");
    if (saved) setRecipeLines([]);
  }

  async function submitPurchaseOrder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const saved = await onAction(() => createRestaurantIngredientPurchaseOrder({
      locationId,
      supplierId,
      reference: purchaseReference,
      invoiceReference,
      dueDate: invoiceDueDate || undefined,
      items: purchaseLines.map((line) => ({
        ingredientId: line.ingredientId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost),
      })),
    }), "Restaurant ingredient purchase order created.");
    if (saved) {
      setPurchaseReference("");
      setInvoiceReference("");
      setInvoiceDueDate("");
      setPurchaseLines([{ ingredientId: "", quantity: "1", unitCost: "0" }]);
    }
  }

  return <section className="space-y-5">
    <div>
      <h2 className="text-lg font-bold text-slate-950">Restaurant ingredients & recipes</h2>
      <p className="mt-1 text-xs text-slate-600">This ingredient catalog is separate from ERP inventory products. Stock is tracked by branch and recipe quantities use the ingredient’s listed unit.</p>
      <p className="mt-1 text-xs text-amber-700">Recipe stock is deducted only when an order is completed. Completion is blocked if a required ingredient is short.</p>
    </div>
    {locations.length === 0
      ? <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Create an active branch before managing restaurant ingredient stock.</p>
      : <>
        <div className="grid gap-5 xl:grid-cols-2">
          <section className="space-y-3 rounded-xl border bg-white p-4">
            <div>
              <h3 className="font-bold text-slate-950">Ingredient catalog</h3>
              <p className="text-xs text-slate-500">Set your purchase cost per stock unit. Recipe costs use this value.</p>
            </div>

            <section className="space-y-4 rounded-xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-950 dark:text-white">Ingredient purchasing</h3>
                  <p className="text-xs text-slate-500">Uses the existing supplier directory. Receipts increase Restaurant branch stock only; ERP product inventory is not changed. Record invoice details and settle supplier balances here.</p>
                </div>
                <Link href="/purchases/suppliers" className="text-xs font-semibold text-orange-700">Supplier directory</Link>
              </div>
              <RestaurantSupplierInvoiceAging
                invoices={supplierInvoiceAging.filter((invoice) => invoice.location_id === locationId)}
                currency={currency}
              />
              {canCreatePurchases && <form onSubmit={submitPurchaseOrder} className="space-y-3 rounded-lg border p-3 dark:border-slate-700">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  <label className="text-xs font-semibold">Supplier<select required value={supplierId} onChange={(event) => setSupplierId(event.target.value)} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900"><option value="">Select supplier</option>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}</select></label>
                  <label className="text-xs font-semibold">Reference<input required maxLength={80} value={purchaseReference} onChange={(event) => setPurchaseReference(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" placeholder="Supplier order reference" /></label>
                  <label className="text-xs font-semibold">Invoice number<input maxLength={80} value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                  <label className="text-xs font-semibold">Due date<input type="date" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                  <p className="self-end text-xs text-slate-500">Branch: {locations.find((location) => location.id === locationId)?.name ?? "Selected branch"}</p>
                </div>
                <div className="hidden grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto] gap-2 text-[10px] font-semibold text-slate-500 sm:grid">
                  <span>Ingredient</span><span>Order quantity</span><span>Unit cost ({currency})</span><span />
                </div>
                {purchaseLines.map((line, index) => <div key={index} className="grid gap-2 sm:grid-cols-[minmax(0,1.4fr)_1fr_1fr_auto]">
                  <select required aria-label="Purchase ingredient" value={line.ingredientId} onChange={(event) => setPurchaseLines((current) => current.map((entry, row) => row === index ? { ...entry, ingredientId: event.target.value } : entry))} className="h-9 min-w-0 rounded border bg-white px-2 text-xs dark:bg-slate-900"><option value="">Select ingredient</option>{ingredients.filter((ingredient) => ingredient.is_active).map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}</select>
                  <input aria-label="Ordered quantity" required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setPurchaseLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} className="h-9 rounded border px-2 text-xs" />
                  <input aria-label="Purchase unit cost" required type="number" min="0" step="0.0001" value={line.unitCost} onChange={(event) => setPurchaseLines((current) => current.map((entry, row) => row === index ? { ...entry, unitCost: event.target.value } : entry))} className="h-9 rounded border px-2 text-xs" />
                  <button type="button" disabled={purchaseLines.length < 2} onClick={() => setPurchaseLines((current) => current.filter((_, row) => row !== index))} className="rounded border px-2 text-xs disabled:opacity-40">Remove</button>
                </div>)}
                <div className="flex flex-wrap gap-2">
                  <button type="button" disabled={purchaseLines.length >= 100 || ingredients.every((ingredient) => !ingredient.is_active)} onClick={() => setPurchaseLines((current) => [...current, { ingredientId: "", quantity: "1", unitCost: "0" }])} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Add ingredient line</button>
                  <button disabled={isPending || !supplierId || ingredients.every((ingredient) => !ingredient.is_active)} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Create purchase order</button>
                </div>
                {suppliers.length === 0 && <p className="text-xs text-amber-700">Add an active supplier in the Supplier directory before creating a purchase order.</p>}
              </form>}
              <div className="space-y-3">
                {purchaseOrders.filter((order) => order.location_id === locationId).length === 0
                  ? <p className="text-sm text-slate-500">No ingredient purchase orders for this branch yet.</p>
                  : purchaseOrders.filter((order) => order.location_id === locationId).map((order) => <IngredientPurchaseOrderCard
                      key={order.id}
                      order={order}
                      currency={currency}
                      supplierName={suppliers.find((supplier) => supplier.id === order.supplier_id)?.name ?? "Supplier"}
                      items={purchaseItems.filter((item) => item.purchase_order_id === order.id)}
                      ingredients={ingredients}
                      canReceive={canEdit}
                      receipts={receipts.filter((receipt) => receipt.purchase_order_id === order.id)}
                      supplierPayments={supplierPayments.filter((payment) => payment.purchase_order_id === order.id)}
                      reconciliationHistory={invoiceReconciliationHistory.filter((entry) => entry.purchase_order_id === order.id)}
                      bankAccounts={bankAccounts}
                      canReconcile={canEdit}
                      canPay={canPayInvoices}
                      isPending={isPending}
                      onReconcile={(invoice) => onAction(
                        () => reconcileRestaurantIngredientInvoice({
                          purchaseOrderId: order.id,
                          ...invoice,
                        }),
                        "Restaurant supplier invoice reconciled.",
                      )}
                      onReceive={(items, requestKey) => onAction(() => receiveRestaurantIngredientPurchase({ purchaseOrderId: order.id, requestKey, items }), "Restaurant ingredients received into branch stock.")}
                      onPay={(amount, paymentDate, paymentMethod, bankAccountId, requestKey) => onAction(
                        () => recordRestaurantIngredientSupplierPayment({
                          purchaseOrderId: order.id,
                          requestKey,
                          amount,
                          paymentDate,
                          paymentMethod,
                          bankAccountId,
                        }),
                        "Restaurant supplier payment recorded.",
                      )}
                    />)}
              </div>
            </section>
            {ingredients.length === 0
              ? <EmptyState title="No ingredients yet" message="Add ingredients such as flour, milk, or cooking oil." />
              : <ul className="divide-y">
                {ingredients.map((ingredient) => {
                  const quantity = Number(stockAtLocation.find((stock) => stock.ingredient_id === ingredient.id)?.quantity ?? 0);
                  return <li key={ingredient.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className={`text-sm font-semibold ${ingredient.is_active ? "text-slate-900" : "text-slate-400"}`}>{ingredient.name}{!ingredient.is_active && <span className="ml-1 text-xs">(inactive)</span>}</p>
                      <p className="text-xs text-slate-500">{money(Number(ingredient.cost_per_unit), currency)} / {ingredient.unit} · {quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit} in {locations.find((location) => location.id === locationId)?.name ?? "branch"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {canEdit && !branchScoped && <>
                        <button type="button" onClick={() => { setIngredientId(ingredient.id); setName(ingredient.name); setUnit(ingredient.unit); setCostPerUnit(String(ingredient.cost_per_unit)); }} className="rounded border px-2 py-1 text-xs">Edit</button>
                        <button type="button" disabled={isPending} onClick={() => onAction(
                          () => saveRestaurantIngredient({
                            id: ingredient.id,
                            name: ingredient.name,
                            unit: ingredient.unit,
                            costPerUnit: Number(ingredient.cost_per_unit),
                            isActive: !ingredient.is_active,
                          }),
                          ingredient.is_active ? "Ingredient deactivated." : "Ingredient activated.",
                        )} className="rounded border px-2 py-1 text-xs disabled:opacity-50">{ingredient.is_active ? "Deactivate" : "Activate"}</button>
                      </>}
                    </div>
                  </li>;
                })}
              </ul>}
            {!branchScoped && (canCreate || (ingredientId && canEdit)) && <form onSubmit={submitIngredient} className="border-t pt-3">
              <h4 className="text-sm font-semibold">{ingredientId ? "Edit ingredient" : "Add ingredient"}</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-semibold">Name<input required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                <label className="text-xs font-semibold">Base unit<input required maxLength={20} placeholder="g, ml, each" value={unit} onChange={(event) => setUnit(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
                <label className="text-xs font-semibold">Cost per unit<input required type="number" min="0" step="0.0001" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" /></label>
              </div>
              <div className="mt-2 flex gap-2">
                <button disabled={isPending} className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{ingredientId ? "Save ingredient" : "Add ingredient"}</button>
                {ingredientId && <button type="button" onClick={() => { setIngredientId(""); setName(""); setUnit(""); setCostPerUnit(""); }} className="rounded-lg border px-3 py-2 text-xs">Cancel</button>}
              </div>
            </form>}
          </section>

          <section className="space-y-3 rounded-xl border bg-white p-4">
            <div>
              <h3 className="font-bold text-slate-950">Recipe & food cost</h3>
              <p className="text-xs text-slate-500">Define ingredient quantities for one menu item serving. Costs are estimates from the latest ingredient costs.</p>
            </div>
            <label className="block text-xs font-semibold">Menu item<select value={menuItemId} onChange={(event) => { setMenuItemId(event.target.value); setRecipeLines([]); }} className="mt-1 h-10 w-full rounded border px-3 text-sm">
              {menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select></label>
            {!selectedMenuItem && <p className="text-sm text-slate-500">Add a menu item before defining a recipe.</p>}
            {selectedMenuItem && <>
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <p>Menu price: <strong>{money(Number(selectedMenuItem.price), currency)}</strong></p>
                <p>Estimated ingredient cost: <strong>{money(recipeCost, currency)}</strong></p>
                {selectedRecipe.length > 0 && <p className="text-xs text-slate-500">Estimated gross margin: {money(Number(selectedMenuItem.price) - recipeCost, currency)} ({Number(selectedMenuItem.price) > 0 ? `${Math.max(0, ((Number(selectedMenuItem.price) - recipeCost) / Number(selectedMenuItem.price)) * 100).toFixed(1)}%` : "n/a"})</p>}
              </div>
              <div className="space-y-2">
                {selectedRecipe.length === 0
                  ? <p className="text-xs text-slate-500">No recipe has been saved for this menu item.</p>
                  : selectedRecipe.map((line) => {
                    const ingredient = ingredients.find((entry) => entry.id === line.ingredient_id);
                    return <p key={line.id} className="flex justify-between gap-3 text-sm"><span>{ingredient?.name ?? "Inactive ingredient"} · {line.quantity} {ingredient?.unit ?? ""}</span><span>{money(Number(line.quantity) * Number(ingredient?.cost_per_unit ?? 0), currency)}</span></p>;
                  })}
              </div>
              {canEdit && !branchScoped && <form onSubmit={submitRecipe} className="border-t pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-sm font-semibold">Edit recipe</h4>
                  <button type="button" onClick={() => setRecipeLines(selectedRecipe.map((line) => ({ ingredientId: line.ingredient_id, quantity: String(line.quantity) })))} className="text-xs font-semibold text-orange-700">Load current recipe</button>
                </div>
                {recipeLines.map((line, index) => <div key={index} className="mt-2 grid grid-cols-[minmax(0,1fr)_7rem_auto] gap-2">
                  <select required value={line.ingredientId} onChange={(event) => setRecipeLines((current) => current.map((entry, row) => row === index ? { ...entry, ingredientId: event.target.value } : entry))} className="h-9 min-w-0 rounded border px-2 text-xs">
                    <option value="">Select ingredient</option>
                    {ingredients.filter((ingredient) => ingredient.is_active).map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
                  </select>
                  <input aria-label="Recipe ingredient quantity" required type="number" min="0.001" step="0.001" value={line.quantity} onChange={(event) => setRecipeLines((current) => current.map((entry, row) => row === index ? { ...entry, quantity: event.target.value } : entry))} className="h-9 rounded border px-2 text-xs" />
                  <button type="button" onClick={() => setRecipeLines((current) => current.filter((_, row) => row !== index))} className="rounded border px-2 text-xs text-red-700">Remove</button>
                </div>)}
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={ingredients.filter((ingredient) => ingredient.is_active).length === 0 || recipeLines.length >= 100} onClick={() => setRecipeLines((current) => [...current, { ingredientId: "", quantity: "1" }])} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Add ingredient line</button>
                  <button disabled={isPending || !selectedMenuItem} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Save recipe</button>
                </div>
                <p className="mt-2 text-[11px] text-slate-500">Saving an empty recipe removes its ingredient requirements. Menu items without recipes do not deduct stock.</p>
              </form>}
              {branchScoped && <p className="rounded bg-slate-50 p-2 text-xs text-slate-600">Recipes and ingredient definitions are organization-wide; ask an organization-wide manager to edit them.</p>}
            </>}
          </section>
        </div>

        <section aria-live="polite" className={`rounded-xl border p-4 ${lowStockIngredients.length ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30" : "bg-white dark:bg-slate-900"}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-950 dark:text-white">Low-stock alerts · {locations.find((location) => location.id === locationId)?.name ?? "Selected branch"}</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${lowStockIngredients.length ? "bg-amber-200 text-amber-900 dark:bg-amber-900 dark:text-amber-100" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"}`}>
              {lowStockIngredients.length ? `${lowStockIngredients.length} need attention` : "All stocked"}
            </span>
          </div>
          {lowStockIngredients.length === 0
            ? <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">No active ingredients are at or below their configured minimum. Set a minimum quantity in the stock controls to enable alerts.</p>
            : <ul className="mt-2 divide-y divide-amber-200 dark:divide-amber-800">
              {lowStockIngredients.map((ingredient) => {
                const stock = stockAtLocation.find((entry) => entry.ingredient_id === ingredient.id);
                return <li key={ingredient.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                  <span className="font-semibold text-amber-950 dark:text-amber-100">{ingredient.name}</span>
                  <span className="text-amber-900 dark:text-amber-200">
                    {Number(stock?.quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit} available
                    {" · "}minimum {Number(stock?.minimum_quantity ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit}
                  </span>
                </li>;
              })}
            </ul>}
        </section>

        <section className="space-y-3 rounded-xl border bg-white p-4">
          <div>
            <h3 className="font-bold text-slate-950">Branch stock adjustments</h3>
            <p className="text-xs text-slate-500">Positive changes add stock; negative changes remove stock. Every adjustment is recorded in the movement history.</p>
          </div>
          {ingredients.filter((ingredient) => ingredient.is_active).length === 0
            ? <p className="text-sm text-slate-500">Add and activate ingredients before adjusting stock.</p>
            : <div className="grid gap-3 md:grid-cols-2">
              {ingredients.filter((ingredient) => ingredient.is_active).map((ingredient) => {
                const stock = stockAtLocation.find((entry) => entry.ingredient_id === ingredient.id);
                const minimumQuantity = Number(stock?.minimum_quantity ?? 0);
                return <IngredientStockAdjustmentForm
                  key={`${locationId}:${ingredient.id}:${minimumQuantity}`}
                  ingredient={ingredient}
                  quantity={Number(stock?.quantity ?? 0)}
                  minimumQuantity={minimumQuantity}
                  locationId={locationId}
                  canEdit={canEdit}
                  isPending={isPending}
                  onAction={onAction}
                />;
              })}
            </div>}
        </section>

        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">Recent stock movements</h3>
          {recentMovements.length === 0
            ? <p className="mt-2 text-sm text-slate-500">No ingredient movements recorded for this branch.</p>
            : <ul className="mt-2 divide-y">
              {recentMovements.map((movement) => {
                const ingredient = ingredients.find((entry) => entry.id === movement.ingredient_id);
                return <li key={movement.id} className="flex flex-wrap justify-between gap-2 py-2 text-xs">
                  <span>{ingredient?.name ?? "Ingredient"} · {movement.reason} · {new Date(movement.created_at).toLocaleString()}</span>
                  <span className={movement.quantity_delta < 0 ? "text-amber-700" : "text-emerald-700"}>{movement.quantity_delta > 0 ? "+" : ""}{movement.quantity_delta} {ingredient?.unit ?? ""} · balance {movement.balance_after}</span>
                </li>;
              })}
            </ul>}
        </section>
      </>}
  </section>;
}

function IngredientStockAdjustmentForm({
  ingredient,
  quantity,
  minimumQuantity,
  locationId,
  canEdit,
  isPending,
  onAction,
}: {
  ingredient: RestaurantIngredient;
  quantity: number;
  minimumQuantity: number;
  locationId: string;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [minimum, setMinimum] = useState(String(minimumQuantity));

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const quantityDelta = Number(amount) * (direction === "add" ? 1 : -1);
    const saved = await onAction(() => adjustRestaurantIngredientStock({
      locationId,
      ingredientId: ingredient.id,
      quantityDelta,
      reason,
    }), "Ingredient stock adjusted.");
    if (saved) {
      setAmount("");
      setReason("");
    }
  }

  return <form onSubmit={submit} className="rounded-lg border p-3">
    <div className="flex items-center justify-between gap-2">
      <div>
        <p className="text-sm font-semibold">{ingredient.name}</p>
        <p className="text-xs text-slate-500">Available: {quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit}</p>
        {minimumQuantity > 0 && <p className={`text-xs font-semibold ${quantity <= minimumQuantity ? "text-amber-700 dark:text-amber-400" : "text-slate-500"}`}>
          {quantity <= minimumQuantity ? "Low stock" : "Alert at"} {minimumQuantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit}
        </p>}
      </div>
      {canEdit && <label className="text-[10px] font-semibold">Change<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="mt-1 block h-8 rounded border px-2 text-xs">
        <option value="add">Add stock</option><option value="remove">Remove stock</option>
      </select></label>}
    </div>
    {canEdit && <div className="mt-3 flex flex-wrap items-end gap-2 border-t pt-3">
      <label className="text-[10px] font-semibold">Low-stock alert at<input aria-label={`${ingredient.name} low-stock threshold`} required type="number" min="0" step="0.001" value={minimum} onChange={(event) => setMinimum(event.target.value)} className="mt-1 block h-9 w-36 rounded border px-2 text-xs" /></label>
      <button type="button" disabled={isPending || !minimum.trim() || !Number.isFinite(Number(minimum)) || Number(minimum) < 0 || Number(minimum) > 99_999_999_999.999 || Math.abs(Number(minimum) * 1000 - Math.round(Number(minimum) * 1000)) > 0.000001}
        onClick={() => onAction(() => saveRestaurantIngredientMinimumStock({ locationId, ingredientId: ingredient.id, minimumQuantity: Number(minimum) }), "Low-stock threshold saved.")}
        className="h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-50">Save alert</button>
    </div>}
    {canEdit && <div className="mt-2 grid grid-cols-[6rem_minmax(0,1fr)_auto] items-end gap-2">
      <label className="text-[10px] font-semibold">Quantity<input required type="number" min="0.001" max={direction === "remove" ? quantity : undefined} step="0.001" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-xs" /></label>
      <label className="text-[10px] font-semibold">Reason<input required maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Delivery, waste, count..." className="mt-1 h-9 w-full rounded border px-2 text-xs" /></label>
      <button disabled={isPending || Number(amount) <= 0 || (direction === "remove" && Number(amount) > quantity)} className="h-9 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white disabled:opacity-50">Adjust</button>
    </div>}
  </form>;
}

function CreateOrderForm({
  currency,
  locationId,
  hasLocations,
  menuItems,
  modifierGroups,
  modifierOptions,
  tables,
  isPending,
  onCreate,
}: {
  currency: string;
  locationId: string;
  hasLocations: boolean;
  menuItems: MenuItem[];
  modifierGroups: ModifierGroup[];
  modifierOptions: ModifierOption[];
  tables: DiningTable[];
  isPending: boolean;
  onCreate: (input: Parameters<typeof createRestaurantOrder>[0]) => Promise<boolean>;
}) {
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "pickup" | "delivery">("dine_in");
  const [tableId, setTableId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [modifierSelections, setModifierSelections] = useState<Record<string, string[]>>({});
  const [modifierError, setModifierError] = useState("");

  function activeGroups(itemId: string) {
    return modifierGroups.filter((group) => group.menu_item_id === itemId && group.is_active);
  }

  function selectedOptionIds(groupId: string) {
    return (modifierSelections[groupId] ?? []).filter((id) =>
      modifierOptions.some((option) => option.id === id && option.group_id === groupId && option.is_active),
    );
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModifierError("");
    const invalidGroup = menuItems.flatMap((item) => {
      if (Number(quantities[item.id] ?? 0) <= 0) return [];
      return activeGroups(item.id).filter((group) => {
        const selectedCount = selectedOptionIds(group.id).length;
        return selectedCount < group.min_selections || selectedCount > group.max_selections;
      }).map((group) => ({ item, group }));
    })[0];
    if (invalidGroup) {
      setModifierError(`${invalidGroup.item.name}: choose ${invalidGroup.group.min_selections === invalidGroup.group.max_selections
        ? invalidGroup.group.min_selections
        : `${invalidGroup.group.min_selections} to ${invalidGroup.group.max_selections}`} option(s) for ${invalidGroup.group.name}.`);
      return;
    }
    const items = menuItems.map((item) => ({
      menuItemId: item.id,
      quantity: Number(quantities[item.id] ?? 0),
      notes: "",
      modifierOptionIds: activeGroups(item.id).flatMap((group) => selectedOptionIds(group.id)),
    })).filter((item) => item.quantity > 0);
    if (items.length === 0) return;
    const created = await onCreate({ locationId, orderType, tableId: orderType === "dine_in" ? tableId : null, customerName, customerPhone, deliveryAddress, notes, items });
    if (!created) return;
    setQuantities({});
    setCustomerName("");
    setCustomerPhone("");
    setDeliveryAddress("");
    setNotes("");
    setTableId("");
    setModifierSelections({});
  }

  const estimate = menuItems.reduce((sum, item) => {
    const quantity = Number(quantities[item.id] ?? 0);
    const additions = activeGroups(item.id).flatMap((group) => selectedOptionIds(group.id))
      .reduce((total, optionId) => total + Number(modifierOptions.find((option) => option.id === optionId)?.price_delta ?? 0), 0);
    return sum + (Number(item.price) + additions) * quantity;
  }, 0);
  return (
    <form onSubmit={submit} className="rounded-xl border border-orange-200 bg-white p-4 shadow-sm">
      <h2 className="text-lg font-bold text-slate-950">Start a restaurant order</h2>
      {!hasLocations ? <p className="mt-2 text-sm text-amber-700">Create an active branch in Locations before taking restaurant orders.</p>
        : menuItems.length === 0 ? <p className="mt-2 text-sm text-amber-700">Add and activate menu items before taking orders.</p>
          : (
            <>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold text-slate-600">Service type
                  <select value={orderType} onChange={(event) => setOrderType(event.target.value as typeof orderType)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option><option value="pickup">Pickup</option><option value="delivery">Delivery</option>
                  </select>
                </label>
                {orderType === "dine_in" && <label className="text-xs font-semibold text-slate-600">Dining table
                  <select required value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
                    <option value="">Select a table</option>{tables.map((table) => <option key={table.id} value={table.id}>{table.table_name} · {table.seats} seats</option>)}
                  </select>
                </label>}
                <label className="text-xs font-semibold text-slate-600">Customer name (optional)<input value={customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength={120} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
                <label className="text-xs font-semibold text-slate-600">Phone (optional)<input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength={40} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
                {orderType === "delivery" && <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Delivery address<input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={300} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>}
              </div>
              {orderType === "dine_in" && tables.length === 0 && <p className="mt-3 text-sm text-amber-700">No active dining tables at this branch yet.</p>}
              <div className="mt-4 space-y-3">
                {menuItems.map((item) => {
                  const groups = activeGroups(item.id);
                  const additions = groups.flatMap((group) => selectedOptionIds(group.id))
                    .reduce((total, optionId) => total + Number(modifierOptions.find((option) => option.id === optionId)?.price_delta ?? 0), 0);
                  const quantity = Number(quantities[item.id] ?? 0);
                  return <article key={item.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span><span className="text-xs text-slate-500">Base {money(Number(item.price), currency)}{additions > 0 ? ` · With selected options ${money(Number(item.price) + additions, currency)}` : ""}</span></span>
                      <label className="flex items-center gap-2 text-xs font-medium text-slate-600">Qty<input aria-label={`Quantity for ${item.name}`} type="number" min="0" max="999" step="1" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 w-20 rounded border px-2 text-sm" /></label>
                    </div>
                    {quantity > 0 && groups.length > 0 && <div className="mt-3 space-y-3 border-t pt-3">
                      {groups.map((group) => {
                        const options = modifierOptions.filter((option) => option.group_id === group.id && option.is_active);
                        const selected = selectedOptionIds(group.id);
                        return <fieldset key={group.id}>
                          <legend className="text-xs font-semibold text-slate-700">{group.name} <span className="font-normal text-slate-500">({group.min_selections === group.max_selections ? `Choose ${group.min_selections}` : `Choose ${group.min_selections}–${group.max_selections}`})</span></legend>
                          {options.length === 0 ? <p className="mt-1 text-xs text-amber-700">No active options are available for this group.</p> : (
                            <div className="mt-1 grid gap-1 sm:grid-cols-2">
                              {options.map((option) => {
                                const checked = selected.includes(option.id);
                                const atLimit = !checked && selected.length >= group.max_selections;
                                return <label key={option.id} className="flex items-center gap-2 rounded bg-slate-50 px-2 py-1.5 text-xs">
                                  <input type="checkbox" checked={checked} disabled={atLimit} onChange={(event) => setModifierSelections((current) => {
                                    const groupSelection = current[group.id] ?? [];
                                    const next = event.target.checked
                                      ? [...groupSelection, option.id]
                                      : groupSelection.filter((id) => id !== option.id);
                                    return { ...current, [group.id]: next };
                                  })} />
                                  <span className="flex-1">{option.name}</span><span>{Number(option.price_delta) > 0 ? `+${money(Number(option.price_delta), currency)}` : "Included"}</span>
                                </label>;
                              })}
                            </div>
                          )}
                        </fieldset>;
                      })}
                    </div>}
                  </article>;
                })}
              </div>
              {modifierError && <p role="alert" className="mt-3 rounded-lg bg-red-50 p-2 text-xs text-red-700">{modifierError}</p>}
              <label className="mt-3 block text-xs font-semibold text-slate-600">Order notes<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-slate-600">Estimated total: <strong className="text-slate-950">{money(estimate, currency)}</strong></p>
                <button type="submit" disabled={isPending || !hasLocations || (orderType === "dine_in" && (!tableId || tables.length === 0)) || (orderType === "delivery" && !deliveryAddress.trim()) || estimate <= 0} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Creating..." : "Create order"}</button>
              </div>
            </>
          )}
    </form>
  );
}

type SplitCheck = { name: string; quantities: Record<string, string> };

function SplitBillForm({
  items,
  orderTotal,
  allowItemSplit,
  currency,
  isPending,
  onSplitItems,
  onSplitEqually,
}: {
  items: OrderItem[];
  orderTotal: number;
  allowItemSplit: boolean;
  currency: string;
  isPending: boolean;
  onSplitItems: (bills: Array<{ name: string; items: Array<{ orderItemId: string; quantity: number }> }>) => void;
  onSplitEqually: (shareCount: number) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [method, setMethod] = useState<"items" | "equal">(allowItemSplit ? "items" : "equal");
  const [shareCount, setShareCount] = useState("2");
  const [checks, setChecks] = useState<SplitCheck[]>(() => [
    { name: "Guest 1", quantities: Object.fromEntries(items.map((item) => [item.id, String(item.quantity)])) },
    { name: "Guest 2", quantities: Object.fromEntries(items.map((item) => [item.id, "0"])) },
  ]);
  const allQuantitiesAssigned = items.every((item) => {
    const assigned = checks.reduce((sum, check) => sum + (Number(check.quantities[item.id]) || 0), 0);
    return Math.abs(assigned - Number(item.quantity)) < 0.001;
  });
  const allChecksHaveItems = checks.every((check) => items.some((item) => (Number(check.quantities[item.id]) || 0) > 0));

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (method === "equal") {
      onSplitEqually(Number(shareCount));
      return;
    }
    if (!allQuantitiesAssigned) return;
    onSplitItems(checks.map((check) => ({
      name: check.name,
      items: items.flatMap((item) => {
        const quantity = Number(check.quantities[item.id]) || 0;
        return quantity > 0 ? [{ orderItemId: item.id, quantity }] : [];
      }),
    })));
  }

  if (!isOpen) return <button type="button" onClick={() => setIsOpen(true)} className="mt-3 rounded border bg-white px-3 py-2 text-xs font-semibold text-slate-700">Split bill</button>;

  return <form onSubmit={submit} className="mt-3 rounded-lg border bg-white p-3">
    <div className="flex flex-wrap items-end justify-between gap-2">
      <label className="text-xs font-semibold">Split method
        <select value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 block h-9 rounded border px-2 text-xs">
          {allowItemSplit && <option value="items">Assign items / quantities</option>}
          <option value="equal">Equal shares</option>
        </select>
      </label>
      <button type="button" onClick={() => setIsOpen(false)} className="rounded border px-3 py-2 text-xs">Cancel</button>
    </div>
    {!allowItemSplit && <p className="mt-2 text-xs text-amber-800">Delivery charges apply to the whole order, so only equal shares are available.</p>}
    {method === "equal" ? <div className="mt-3 flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold">Number of shares
        <input type="number" min="2" max="20" step="1" value={shareCount} onChange={(event) => setShareCount(event.target.value)} className="mt-1 block h-9 w-28 rounded border px-2 text-xs" />
      </label>
      <p className="text-xs text-slate-600">Order total: {money(orderTotal, currency)} · Any rounding remainder is added to the last share.</p>
    </div> : <>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-600">Assign every ordered quantity across guest checks.</p>
        {checks.length < 20 && <button type="button" onClick={() => setChecks((current) => [...current, {
          name: `Guest ${current.length + 1}`,
          quantities: Object.fromEntries(items.map((item) => [item.id, "0"])),
        }])} className="rounded border px-3 py-2 text-xs font-semibold">Add guest check</button>}
      </div>
      <div className="mt-3 space-y-3">
        {checks.map((check, checkIndex) => {
          const checkTotal = items.reduce((sum, item) => sum + Number(item.unit_price) * (Number(check.quantities[item.id]) || 0), 0);
          return <section key={checkIndex} className="rounded border p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <input aria-label={`Guest check ${checkIndex + 1} name`} required maxLength={80} value={check.name} onChange={(event) => setChecks((current) => current.map((entry, index) => index === checkIndex ? { ...entry, name: event.target.value } : entry))} className="h-9 rounded border px-2 text-xs font-semibold" />
              {checks.length > 2 && <button type="button" onClick={() => setChecks((current) => current.filter((_, index) => index !== checkIndex))} className="text-xs text-red-700">Remove check</button>}
            </div>
            <div className="mt-2 space-y-2">
              {items.map((item) => {
                const assigned = checks.reduce((sum, entry) => sum + (Number(entry.quantities[item.id]) || 0), 0);
                const remainder = Number(item.quantity) - assigned;
                return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 text-xs">
                  <span>{item.item_name} <span className={Math.abs(remainder) < 0.001 ? "text-emerald-700" : "text-amber-700"}>({remainder >= 0 ? `${remainder} unassigned` : `${Math.abs(remainder)} over-assigned`})</span></span>
                  <input aria-label={`${check.name}: ${item.item_name} quantity`} type="number" min="0" max={item.quantity} step="0.01" value={check.quantities[item.id]} onChange={(event) => setChecks((current) => current.map((entry, index) => index === checkIndex ? {
                    ...entry,
                    quantities: { ...entry.quantities, [item.id]: event.target.value },
                  } : entry))} className="h-8 rounded border px-2 text-right" />
                </div>;
              })}
            </div>
            <p className="mt-2 text-right text-xs font-semibold">Check total: {money(checkTotal, currency)}</p>
          </section>;
        })}
      </div>
      {!allQuantitiesAssigned && <p role="status" className="mt-2 text-xs text-amber-700">Assign each item’s full quantity before splitting.</p>}
      {allQuantitiesAssigned && !allChecksHaveItems && <p role="status" className="mt-2 text-xs text-amber-700">Each guest check needs at least one item.</p>}
    </>}
    <button type="submit" disabled={isPending || (method === "equal" && (!Number.isInteger(Number(shareCount)) || Number(shareCount) < 2 || Number(shareCount) > 20)) || (method === "items" && (!allQuantitiesAssigned || !allChecksHaveItems))} className="mt-3 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Create guest checks</button>
  </form>;
}

function PaymentForm({ balance, isPending, onSubmit }: { balance: number; isPending: boolean; onSubmit: (amount: number, tipAmount: number, method: "cash" | "card" | "mobile_money" | "other") => void }) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [tipAmount, setTipAmount] = useState("0.00");
  const [method, setMethod] = useState<"cash" | "card" | "mobile_money" | "other">("cash");
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(Number(amount), Number(tipAmount), method); }} className="flex flex-wrap items-end gap-2">
    <label className="text-[10px] font-semibold text-slate-500">Bill amount<input aria-label="Payment amount" type="number" min="0" max={balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="mt-1 block h-9 w-28 rounded border px-2 text-xs text-slate-900" /></label>
    <label className="text-[10px] font-semibold text-slate-500">Tip<input aria-label="Tip amount" type="number" min="0" step="0.01" value={tipAmount} onChange={(event) => setTipAmount(event.target.value)} className="mt-1 block h-9 w-24 rounded border px-2 text-xs text-slate-900" /></label>
    <label className="text-[10px] font-semibold text-slate-500">Method<select aria-label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 block h-9 rounded border px-2 text-xs text-slate-900">
      <option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
    </select></label>
    <button disabled={isPending || Number(amount) < 0 || Number(amount) > balance || Number(tipAmount) < 0 || Number(amount) + Number(tipAmount) <= 0} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Record payment</button>
  </form>;
}

function RefundForm({ amount, tipAmount, isPending, onSubmit }: {
  amount: number;
  tipAmount: number;
  isPending: boolean;
  onSubmit: (amount: number, tipAmount: number, method: "cash" | "card" | "mobile_money" | "other") => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState(amount.toFixed(2));
  const [refundTip, setRefundTip] = useState(tipAmount.toFixed(2));
  const [method, setMethod] = useState<"cash" | "card" | "mobile_money" | "other">("cash");
  if (!isOpen) return <button type="button" onClick={() => setIsOpen(true)} className="rounded border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-700">Refund</button>;
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(Number(refundAmount), Number(refundTip), method); }} className="flex flex-wrap items-end gap-1">
    <label className="text-[9px] text-slate-500">Amount<input aria-label="Refund amount" type="number" min="0" max={amount} step="0.01" value={refundAmount} onChange={(event) => setRefundAmount(event.target.value)} className="mt-1 block h-8 w-20 rounded border px-1 text-xs" /></label>
    <label className="text-[9px] text-slate-500">Tip<input aria-label="Refund tip" type="number" min="0" max={tipAmount} step="0.01" value={refundTip} onChange={(event) => setRefundTip(event.target.value)} className="mt-1 block h-8 w-20 rounded border px-1 text-xs" /></label>
    <label className="text-[9px] text-slate-500">Method<select aria-label="Refund method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="mt-1 block h-8 rounded border px-1 text-xs">
      <option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
    </select></label>
    <button disabled={isPending || Number(refundAmount) < 0 || Number(refundAmount) > amount || Number(refundTip) < 0 || Number(refundTip) > tipAmount || Number(refundAmount) + Number(refundTip) <= 0} className="h-8 rounded bg-red-700 px-2 text-[10px] font-semibold text-white disabled:opacity-50">Record</button>
    <button type="button" onClick={() => setIsOpen(false)} className="h-8 rounded border px-2 text-[10px]">Cancel</button>
  </form>;
}

function DeliveryDispatchControls({ order, employees, canEdit, isPending, onUpdate }: {
  order: RestaurantOrder;
  employees: RestaurantDeliveryEmployee[];
  canEdit: boolean;
  isPending: boolean;
  onUpdate: (
    employeeId: string | null,
    status: Exclude<RestaurantOrder["delivery_status"], "not_applicable">,
    failureNote?: string,
  ) => Promise<boolean>;
}) {
  const [selection, setSelection] = useState<{ assignedId: string | null; employeeId: string }>({
    assignedId: order.delivery_assigned_employee_id,
    employeeId: order.delivery_assigned_employee_id ?? "",
  });
  const [failureNote, setFailureNote] = useState("");
  const employeeId = selection.assignedId === order.delivery_assigned_employee_id
    ? selection.employeeId
    : order.delivery_assigned_employee_id ?? "";
  const currentEmployee = employees.find((employee) => employee.id === order.delivery_assigned_employee_id);
  const isClosed = ["completed", "cancelled", "pending_payment"].includes(order.status);
  const driverChanged = employeeId !== (order.delivery_assigned_employee_id ?? "");

  return <section className="mt-3 rounded-lg border border-sky-200 bg-sky-50/60 p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-sky-900">Delivery dispatch</p>
        <p className="mt-1 text-xs text-slate-600">
          Status: <span className="font-semibold capitalize">{order.delivery_status.replace("_", " ")}</span>
          {currentEmployee ? ` · ${currentEmployee.fullName}` : ""}
        </p>
      </div>
      {order.delivery_status === "delivered" && order.delivery_delivered_at
        && <p className="text-xs text-slate-500">Delivered {new Date(order.delivery_delivered_at).toLocaleString()}</p>}
    </div>
    {order.delivery_failure_note && <p className="mt-2 text-xs text-red-700">Last failure: {order.delivery_failure_note}</p>}
    {canEdit && !isClosed && order.delivery_status !== "delivered" && <>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-52 flex-1 text-xs font-semibold text-slate-600">Delivery staff
          <select value={employeeId} onChange={(event) => setSelection({ assignedId: order.delivery_assigned_employee_id, employeeId: event.target.value })} className="mt-1 h-9 w-full rounded border bg-white px-2 text-xs">
            <option value="">Select staff member</option>
            {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.fullName}</option>)}
          </select>
        </label>
        {(order.delivery_status === "unassigned" || order.delivery_status === "failed") && <button
          type="button"
          disabled={isPending || !employeeId}
          onClick={() => void onUpdate(employeeId, "assigned")}
          className="h-9 rounded-lg bg-sky-800 px-3 text-xs font-semibold text-white disabled:opacity-50"
        >{order.delivery_status === "failed" ? "Retry dispatch" : "Assign driver"}</button>}
        {order.delivery_status === "assigned" && <>
          {driverChanged && <button type="button" disabled={isPending || !employeeId} onClick={() => void onUpdate(employeeId, "assigned")} className="h-9 rounded-lg border bg-white px-3 text-xs font-semibold disabled:opacity-50">Save driver</button>}
          <button type="button" disabled={isPending} onClick={() => void onUpdate(null, "unassigned")} className="h-9 rounded-lg border bg-white px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">Unassign</button>
          <button type="button" disabled={isPending} onClick={() => void onUpdate(order.delivery_assigned_employee_id, "picked_up")} className="h-9 rounded-lg bg-sky-800 px-3 text-xs font-semibold text-white disabled:opacity-50">Mark picked up</button>
        </>}
        {order.delivery_status === "picked_up" && <button type="button" disabled={isPending} onClick={() => void onUpdate(order.delivery_assigned_employee_id, "in_transit")} className="h-9 rounded-lg bg-sky-800 px-3 text-xs font-semibold text-white disabled:opacity-50">Start delivery</button>}
        {order.delivery_status === "in_transit" && <button type="button" disabled={isPending} onClick={() => void onUpdate(order.delivery_assigned_employee_id, "delivered")} className="h-9 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Mark delivered</button>}
      </div>
      {["assigned", "picked_up", "in_transit"].includes(order.delivery_status) && <form onSubmit={(event) => {
        event.preventDefault();
        void onUpdate(order.delivery_assigned_employee_id, "failed", failureNote);
      }} className="mt-2 flex flex-wrap gap-2">
        <input aria-label="Delivery failure reason" value={failureNote} onChange={(event) => setFailureNote(event.target.value)} maxLength={500} placeholder="Reason if delivery fails" className="h-9 min-w-48 flex-1 rounded border bg-white px-2 text-xs" />
        <button type="submit" disabled={isPending || !failureNote.trim()} className="h-9 rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700 disabled:opacity-50">Record failed delivery</button>
      </form>}
    </>}
    {canEdit && isClosed && order.delivery_status !== "delivered"
      && <p className="mt-2 text-xs text-slate-500">Dispatch controls are closed for this order.</p>}
  </section>;
}

function OrderStatusControls({ order, isPending, canAdvance = true, onUpdate }: {
  order: RestaurantOrder;
  isPending: boolean;
  canAdvance?: boolean;
  onUpdate: (status: RestaurantOrder["status"]) => void;
}) {
  const next: Partial<Record<RestaurantOrder["status"], RestaurantOrder["status"]>> = {
    new: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: order.order_type === "dine_in" ? "served" : "completed",
    served: "completed",
  };
  const nextStatus = next[order.status];
  const deliveryNotDelivered = order.order_type === "delivery" && order.delivery_status !== "delivered";
  return <div className="flex gap-2">
    {nextStatus && <button type="button" disabled={isPending || !canAdvance || (nextStatus === "completed" && order.payment_status !== "paid") || (nextStatus === "completed" && deliveryNotDelivered)} onClick={() => onUpdate(nextStatus)} title={!canAdvance ? "Update every order item before advancing this order" : nextStatus === "completed" && deliveryNotDelivered ? "Mark the delivery delivered first" : nextStatus === "completed" && order.payment_status !== "paid" ? "Record full payment first" : undefined} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark {statusLabels[nextStatus]}</button>}
    {order.status !== "cancelled" && order.status !== "completed" && <button type="button" disabled={isPending} onClick={() => onUpdate("cancelled")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancel</button>}
  </div>;
}

function MenuManagement({ currency, categories, menuItems, modifierGroups, modifierOptions, canCreate, canEdit, isPending, onAction }: {
  currency: string;
  categories: Category[];
  menuItems: MenuItem[];
  modifierGroups: ModifierGroup[];
  modifierOptions: ModifierOption[];
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => void;
}) {
  const [categoryId, setCategoryId] = useState("");
  const [categoryName, setCategoryName] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<string | undefined>();
  const [itemId, setItemId] = useState<string | undefined>();
  const [itemName, setItemName] = useState("");
  const [itemSku, setItemSku] = useState("");
  const [itemBarcode, setItemBarcode] = useState("");
  const [description, setDescription] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const [imageUploadError, setImageUploadError] = useState("");
  const [prepStation, setPrepStation] = useState<PrepStation>("kitchen");
  const [itemType, setItemType] = useState<"prepared" | "packaged">("prepared");
  const menuItemFormRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (itemId) menuItemFormRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [itemId]);

  function resetMenuItemForm() {
    setItemId(undefined);
    setItemName("");
    setItemSku("");
    setItemBarcode("");
    setDescription("");
    setItemCategoryId("");
    setPrice("");
    setImageUrl(null);
    setPrepStation("kitchen");
    setItemType("prepared");
    setImageUploadError("");
  }

  async function handleMenuImageUpload(file: File | undefined) {
    if (!file) return;
    setImageUploadError("");
    setImageUploading(true);
    try {
      const formData = new FormData();
      formData.set("file", file);
      setImageUrl(await uploadRestaurantMenuImage(formData));
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : "Could not upload the menu image.");
    } finally {
      setImageUploading(false);
    }
  }

  function submitCategory(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(async () => {
      const existing = categories.find((item) => item.id === editingCategoryId);
      await saveRestaurantCategory({ id: editingCategoryId, name: categoryName, sortOrder: existing?.sort_order ?? categories.length, isActive: existing?.is_active ?? true });
      setCategoryName("");
      setEditingCategoryId(undefined);
    }, "Menu category saved.");
  }
  function submitItem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(async () => {
      await saveRestaurantMenuItem({
        id: itemId,
        categoryId: itemCategoryId || null,
        name: itemName,
        sku: itemSku,
        barcode: itemBarcode,
        description,
        imageUrl,
        price: Number(price),
        itemType,
        prepStation,
        sortOrder: menuItems.find((item) => item.id === itemId)?.sort_order ?? menuItems.length,
        isActive: menuItems.find((item) => item.id === itemId)?.is_active ?? true,
      });
      resetMenuItemForm();
    }, "Menu item saved.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="space-y-4">
        <div><h2 className="text-lg font-bold text-slate-950">Menu items</h2><p className="text-xs text-slate-500">Menu entries and prices are isolated from the inventory product catalog.</p></div>
        {menuItems.length === 0 ? <EmptyState title="Your menu is empty" message="Add a menu item to use it in restaurant orders." /> : menuItems.map((item) => (
          <article key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${!item.is_active ? "opacity-60" : ""}`}>
            <div className="flex min-w-0 items-center gap-3">
              {item.image_url ? <Image src={item.image_url} alt="" width={72} height={72} unoptimized className="h-[72px] w-[72px] shrink-0 rounded-lg bg-slate-100 object-contain dark:bg-slate-800" /> : <div className="h-[72px] w-[72px] shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800" />}
              <div><h3 className="font-semibold text-slate-950">{item.name} {!item.is_active && <span className="text-xs text-slate-500">(Unavailable)</span>}</h3><p className="text-xs text-slate-500">{item.item_type === "packaged" ? "Packaged resale" : "Prepared"} · {categories.find((category) => category.id === item.category_id)?.name ?? "Uncategorized"} · {money(Number(item.price), currency)} · {prepStationLabels[item.prep_station]}{item.sku ? ` · SKU ${item.sku}` : ""}{item.barcode ? ` · Barcode ${item.barcode}` : ""}</p>{item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}</div>
            </div>
            {canEdit && <div className="flex gap-2">
              <button type="button" disabled={isPending} onClick={() => { setItemId(item.id); setItemName(item.name); setItemSku(item.sku ?? ""); setItemBarcode(item.barcode ?? ""); setDescription(item.description ?? ""); setItemCategoryId(item.category_id ?? ""); setPrice(String(item.price)); setImageUrl(item.image_url); setPrepStation(item.prep_station); setItemType(item.item_type); setImageUploadError(""); }} className="rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">Edit</button>
              <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantMenuItem({ id: item.id, categoryId: item.category_id, name: item.name, description: item.description ?? "", price: Number(item.price), prepStation: item.prep_station, sortOrder: item.sort_order, isActive: !item.is_active }), item.is_active ? "Menu item marked unavailable." : "Menu item activated.")} className="rounded border px-3 py-2 text-xs font-semibold">{item.is_active ? "Unavailable" : "Activate"}</button>
            </div>}
          </article>
        ))}
        {(canCreate || (itemId && canEdit)) && <form ref={menuItemFormRef} onSubmit={submitItem} className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">{itemId ? "Edit menu item" : "Add menu item"}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Name<input required maxLength={120} value={itemName} onChange={(event) => setItemName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">SKU (optional)<input maxLength={80} value={itemSku} onChange={(event) => setItemSku(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Barcode (optional)<input maxLength={120} value={itemBarcode} onChange={(event) => setItemBarcode(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Price<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Category<select value={itemCategoryId} onChange={(event) => setItemCategoryId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="">Uncategorized</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Item type<select value={itemType} onChange={(event) => setItemType(event.target.value as "prepared" | "packaged")} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="prepared">Prepared menu item</option><option value="packaged">Packaged item for resale</option></select></label>
            <label className="text-xs font-semibold">Prep station<select value={prepStation} onChange={(event) => setPrepStation(event.target.value as PrepStation)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="dessert">Dessert</option></select></label>
            <label className="text-xs font-semibold">Description<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Menu image (JPEG, PNG, or WebP; up to 5 MB)
              <input type="file" accept="image/jpeg,image/png,image/webp" disabled={imageUploading} onChange={(event) => { void handleMenuImageUpload(event.target.files?.[0]); event.currentTarget.value = ""; }} className="mt-1 block w-full rounded-lg border px-3 py-2 text-sm" />
            </label>
          </div>
          {imageUploading && <p role="status" className="mt-2 text-xs text-slate-500">Uploading image…</p>}
          {imageUploadError && <p role="alert" className="mt-2 text-xs text-red-700">{imageUploadError}</p>}
          {imageUrl && <div className="mt-3 flex items-center gap-3"><Image src={imageUrl} alt="Menu item preview" width={80} height={80} unoptimized className="h-20 w-20 rounded-lg bg-slate-100 object-contain dark:bg-slate-800" /><button type="button" onClick={() => setImageUrl(null)} className="rounded border px-3 py-2 text-xs">Remove image</button></div>}
          <div className="mt-3 flex gap-2"><button disabled={isPending || imageUploading} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : itemId ? "Save item" : "Add item"}</button>{itemId && <button type="button" disabled={isPending} onClick={resetMenuItemForm} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Cancel edit</button>}</div>
        </form>}
      </section>
      <aside className="space-y-4">
        {canCreate && <RestaurantMenuImporter categories={categories} menuItems={menuItems} />}
        <ModifierManagement
          menuItems={menuItems}
          groups={modifierGroups}
          options={modifierOptions}
          canCreate={canCreate}
          canEdit={canEdit}
          isPending={isPending}
          onAction={onAction}
        />
        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-bold text-slate-950">Menu categories</h2>
          <div className="mt-3 divide-y">{categories.map((category) => <div key={category.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <span className={category.is_active ? "text-slate-800" : "text-slate-400"}>{category.name}{!category.is_active && <span className="ml-1 text-xs">(Unavailable)</span>}</span>
            {canEdit && <div className="flex gap-2">
              <button type="button" onClick={() => { setEditingCategoryId(category.id); setCategoryName(category.name); }} className="rounded border px-2 py-1 text-xs">Edit</button>
              <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantCategory({ id: category.id, name: category.name, sortOrder: category.sort_order, isActive: !category.is_active }), category.is_active ? "Category marked unavailable." : "Category activated.")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">{category.is_active ? "Unavailable" : "Activate"}</button>
            </div>}
          </div>)}</div>
          {categories.length === 0 && <p className="mt-3 text-xs text-slate-500">No categories created.</p>}
          {(canCreate || (editingCategoryId && canEdit)) && <form onSubmit={submitCategory} className="mt-4 border-t pt-4">
            <label className="text-xs font-semibold">{editingCategoryId ? "Edit category" : "Add category"}<input required maxLength={100} value={categoryName} onChange={(event) => setCategoryName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <div className="mt-2 flex gap-2"><button disabled={isPending} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white">{editingCategoryId ? "Save category" : "Add category"}</button>{editingCategoryId && <button type="button" onClick={() => { setEditingCategoryId(undefined); setCategoryName(""); }} className="rounded-lg border px-3 py-2 text-xs">Cancel</button>}</div>
          </form>}
        </section>
        {!canCreate && !canEdit && <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">Menu changes are organization-wide. Ask an organization-wide manager to update the menu.</p>}
      </aside>
    </div>
  );
}

function ModifierManagement({ menuItems, groups, options, canCreate, canEdit, isPending, onAction }: {
  menuItems: MenuItem[];
  groups: ModifierGroup[];
  options: ModifierOption[];
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => void;
}) {
  const [menuItemId, setMenuItemId] = useState(menuItems[0]?.id ?? "");
  const [groupName, setGroupName] = useState("");
  const [minimum, setMinimum] = useState("0");
  const [maximum, setMaximum] = useState("1");
  const itemGroups = groups.filter((group) => group.menu_item_id === menuItemId);

  function submitGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(async () => {
      await saveRestaurantModifierGroup({
        menuItemId,
        name: groupName,
        minSelections: Number(minimum),
        maxSelections: Number(maximum),
        isActive: true,
      });
      setGroupName("");
      setMinimum("0");
      setMaximum("1");
    }, "Modifier group added.");
  }

  return <section className="rounded-xl border bg-white p-4">
    <h2 className="font-bold text-slate-950">Options & add-ons</h2>
    <p className="mt-1 text-xs text-slate-500">Create option groups such as size, toppings, or sides. Set the allowed selection count and price adjustments.</p>
    {menuItems.length === 0 ? <p className="mt-3 text-xs text-amber-700">Add a menu item before configuring its options.</p> : <>
      <label className="mt-3 block text-xs font-semibold">Menu item<select value={menuItemId} onChange={(event) => setMenuItemId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">{menuItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="mt-3 space-y-3">
        {itemGroups.map((group) => {
          const groupOptions = options.filter((option) => option.group_id === group.id);
          return <article key={group.id} className="rounded-lg border p-3">
            <form onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              onAction(() => saveRestaurantModifierGroup({
                id: group.id,
                menuItemId,
                name: String(form.get("name") ?? ""),
                minSelections: Number(form.get("minimum")),
                maxSelections: Number(form.get("maximum")),
                isActive: group.is_active,
              }), "Modifier group updated.");
            }} className="grid gap-2 sm:grid-cols-[1fr_80px_80px_auto]">
              <input aria-label={`${group.name} group name`} name="name" required maxLength={80} defaultValue={group.name} disabled={!canEdit} className="h-9 min-w-0 rounded border px-2 text-xs" />
              <input aria-label={`${group.name} minimum selections`} name="minimum" required type="number" min="0" max="20" defaultValue={group.min_selections} disabled={!canEdit} className="h-9 rounded border px-2 text-xs" />
              <input aria-label={`${group.name} maximum selections`} name="maximum" required type="number" min="1" max="20" defaultValue={group.max_selections} disabled={!canEdit} className="h-9 rounded border px-2 text-xs" />
              {canEdit && <button disabled={isPending} className="rounded border px-2 py-1 text-xs font-semibold disabled:opacity-50">Save group</button>}
            </form>
            <p className="mt-1 text-[11px] text-slate-500">{group.is_active ? "Active" : "Unavailable"} · {group.min_selections}–{group.max_selections} selections</p>
            {canEdit && <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantModifierGroup({ id: group.id, menuItemId, name: group.name, minSelections: group.min_selections, maxSelections: group.max_selections, isActive: !group.is_active }), group.is_active ? "Modifier group deactivated." : "Modifier group activated.")} className="mt-2 rounded border px-2 py-1 text-xs disabled:opacity-50">{group.is_active ? "Deactivate group" : "Activate group"}</button>}
            <div className="mt-3 space-y-2 border-t pt-3">
              {groupOptions.map((option) => <div key={option.id} className="flex flex-wrap items-center gap-2">
                <form onSubmit={(event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  onAction(() => saveRestaurantModifierOption({
                    id: option.id,
                    groupId: group.id,
                    name: String(form.get("name") ?? ""),
                    priceDelta: Number(form.get("price")),
                    isActive: option.is_active,
                  }), "Modifier option saved.");
                }} className="flex min-w-0 flex-1 gap-2">
                  <input aria-label={`${option.name} option name`} name="name" required maxLength={80} defaultValue={option.name} disabled={!canEdit} className="h-8 min-w-0 flex-1 rounded border px-2 text-xs" />
                  <input aria-label={`${option.name} price adjustment`} name="price" required type="number" min="0" step="0.01" defaultValue={option.price_delta} disabled={!canEdit} className="h-8 w-24 rounded border px-2 text-xs" />
                  {canEdit && <button disabled={isPending} className="rounded border px-2 text-xs disabled:opacity-50">Save</button>}
                </form>
                {canEdit && <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantModifierOption({ id: option.id, groupId: group.id, name: option.name, priceDelta: option.price_delta, isActive: !option.is_active }), option.is_active ? "Modifier option deactivated." : "Modifier option activated.")} className="rounded border px-2 py-1 text-xs disabled:opacity-50">{option.is_active ? "Disable" : "Enable"}</button>}
                {!option.is_active && <span className="text-[11px] text-slate-500">Unavailable</span>}
              </div>)}
              {canCreate && <form onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                onAction(() => saveRestaurantModifierOption({
                  groupId: group.id,
                  name: String(form.get("name") ?? ""),
                  priceDelta: Number(form.get("price")),
                  isActive: true,
                }), "Modifier option added.");
                event.currentTarget.reset();
              }} className="flex gap-2">
                <input aria-label={`New option for ${group.name}`} name="name" required maxLength={80} placeholder="Option name" className="h-8 min-w-0 flex-1 rounded border px-2 text-xs" />
                <input aria-label="Option price adjustment" name="price" required type="number" min="0" step="0.01" defaultValue="0" className="h-8 w-24 rounded border px-2 text-xs" />
                <button disabled={isPending} className="rounded bg-slate-900 px-2 text-xs font-semibold text-white disabled:opacity-50">Add</button>
              </form>}
            </div>
          </article>;
        })}
      </div>
      {canCreate && <form onSubmit={submitGroup} className="mt-3 space-y-2 border-t pt-3">
        <p className="text-xs font-semibold">Add option group</p>
        <input required maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="e.g. Choose a size" className="h-9 w-full rounded border px-2 text-xs" />
        <div className="grid grid-cols-2 gap-2">
          <label className="text-[11px] text-slate-600">Minimum<select value={minimum} onChange={(event) => setMinimum(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-xs">{Array.from({ length: 21 }, (_, count) => <option key={count} value={count}>{count}</option>)}</select></label>
          <label className="text-[11px] text-slate-600">Maximum<select value={maximum} onChange={(event) => setMaximum(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-xs">{Array.from({ length: 20 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}</option>)}</select></label>
        </div>
        <button disabled={isPending || !menuItemId || Number(minimum) > Number(maximum)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Add group</button>
      </form>}
    </>}
    {!canCreate && !canEdit && <p className="mt-3 text-xs text-slate-500">You can view configured options but cannot change them.</p>}
  </section>;
}

const cateringEventStatusLabels: Record<RestaurantCateringEvent["status"], string> = {
  inquiry: "Inquiry",
  quoted: "Quoted",
  confirmed: "Confirmed",
  preparing: "Preparing",
  completed: "Completed",
  cancelled: "Cancelled",
};

const cateringEventStatusTransitions: Record<RestaurantCateringEvent["status"], Array<Exclude<RestaurantCateringEvent["status"], "inquiry">>> = {
  inquiry: ["quoted", "cancelled"],
  quoted: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

function toLocalDateTimeInput(value: Date) {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

const cateringEventDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function cateringChecklistItems(value: Json): Array<{ title: string; completed: boolean }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null || Array.isArray(item)) return [];
    if (typeof item.title !== "string" || typeof item.completed !== "boolean") return [];
    return [{ title: item.title, completed: item.completed }];
  });
}

function CateringEventsManagement({ locationId, locations, events, statusHistory, quotes, payments, invoices, prepTasks, menuPlans, menuItems, ingredients, ingredientStocks, recipeIngredients, staff, currency, dataError, canIssueInvoice, canCreate, canEdit, isPending, onAction }: {
  locationId: string;
  locations: Location[];
  events: RestaurantCateringEvent[];
  statusHistory: Database["public"]["Tables"]["restaurant_catering_event_status_history"]["Row"][];
  quotes: RestaurantCateringQuote[];
  payments: RestaurantCateringPayment[];
  invoices: RestaurantCateringInvoice[];
  prepTasks: RestaurantCateringPrepTask[];
  menuPlans: RestaurantCateringMenuPlanItem[];
  menuItems: MenuItem[];
  ingredients: RestaurantIngredient[];
  ingredientStocks: RestaurantIngredientStock[];
  recipeIngredients: RestaurantRecipeIngredient[];
  staff: RestaurantCateringStaff[];
  currency: string;
  dataError: string | null;
  canIssueInvoice: boolean;
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [eventName, setEventName] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [customerSearchError, setCustomerSearchError] = useState("");
  const [customerOrganization, setCustomerOrganization] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [minimumStartsAt, setMinimumStartsAt] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [guestCount, setGuestCount] = useState("25");
  const [customMenu, setCustomMenu] = useState("");
  const [setupRequirements, setSetupRequirements] = useState("");
  const [notes, setNotes] = useState("");
  const visibleEvents = events.filter((event) => event.location_id === locationId);

  useEffect(() => {
    if (!customerSearchOpen) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      searchCustomers(customerSearch).then((results) => {
        if (active) {
          setCustomerResults(results);
          setCustomerSearchError("");
        }
      }).catch((error: unknown) => {
        if (active) {
          setCustomerSearchError(error instanceof Error ? error.message : "Could not search CRM customers.");
          setCustomerResults([]);
        }
      });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [customerSearch, customerSearchOpen]);

  function initializeEventDate() {
    if (startsAt) return;
    const now = new Date();
    setMinimumStartsAt(toLocalDateTimeInput(now));
    setStartsAt(toLocalDateTimeInput(new Date(now.getTime() + 24 * 60 * 60 * 1000)));
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void onAction(async () => {
      const eventDate = new Date(startsAt);
      if (!Number.isFinite(eventDate.getTime())) throw new Error("Choose a valid event date and time.");
      await createRestaurantCateringEvent({
        locationId,
        customerId: selectedCustomer?.id ?? null,
        eventName,
        customerName,
        customerOrganization,
        customerPhone,
        customerEmail,
        startsAt: eventDate.toISOString(),
        eventLocation,
        guestCount: Number(guestCount),
        customMenu,
        setupRequirements,
        notes,
      });
      setEventName("");
      setCustomerName("");
      setCustomerSearch("");
      setCustomerResults([]);
      setSelectedCustomer(null);
      setCustomerSearchOpen(false);
      setCustomerOrganization("");
      setCustomerPhone("");
      setCustomerEmail("");
      setEventLocation("");
      setGuestCount("25");
      setCustomMenu("");
      setSetupRequirements("");
      setNotes("");
    }, "Catering inquiry created.");
  }

  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
    <section className="space-y-3">
      {dataError && <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{dataError}</p>}
      <header>
        <h2 className="text-lg font-bold text-slate-950">Catering & event pipeline</h2>
        <p className="text-sm text-slate-500">Capture event requirements and move each inquiry through its booking and preparation status.</p>
      </header>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          ["Inquiries", visibleEvents.filter((item) => item.status === "inquiry").length],
          ["Booked / preparing", visibleEvents.filter((item) => item.status === "confirmed" || item.status === "preparing").length],
          ["Quoted proposals", visibleEvents.filter((item) => item.status === "quoted").length],
        ].map(([label, count]) => <div key={String(label)} className="rounded-xl border bg-white p-4">
          <p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-2xl font-bold text-slate-950">{count}</p>
        </div>)}
      </div>
      {visibleEvents.length === 0 ? <EmptyState title="No catering events yet" message="Create an inquiry to record the customer, event schedule, guest count, and service requirements." /> : (
        <div className="space-y-3">{visibleEvents.map((cateringEvent) => <CateringEventCard
          key={cateringEvent.id}
          event={cateringEvent}
          history={statusHistory.filter((entry) => entry.event_id === cateringEvent.id)}
          quotes={quotes.filter((quote) => quote.event_id === cateringEvent.id)}
          payments={payments.filter((payment) => payment.event_id === cateringEvent.id)}
          finalInvoice={invoices.find((invoice) => invoice.source_catering_event_id === cateringEvent.id) ?? null}
          prepTasks={prepTasks.filter((task) => task.event_id === cateringEvent.id)}
          menuPlans={menuPlans.filter((item) => item.event_id === cateringEvent.id)}
          menuItems={menuItems}
          ingredients={ingredients}
          ingredientStocks={ingredientStocks}
          recipeIngredients={recipeIngredients}
          staff={staff.filter((member) => member.locationIds.includes(cateringEvent.location_id))}
          currency={currency}
          dataError={dataError !== null}
          canIssueInvoice={canIssueInvoice}
          canEdit={canEdit}
          isPending={isPending}
          onAction={onAction}
        />)}</div>
      )}
    </section>
    {canCreate ? <form onSubmit={submit} className="h-fit space-y-3 rounded-xl border bg-white p-4">
      <div><h2 className="font-bold text-slate-950">New event inquiry</h2><p className="mt-1 text-xs text-slate-500">Branch: {locations.find((location) => location.id === locationId)?.name ?? "Unavailable"}</p></div>
      <label className="block text-xs font-semibold text-slate-600">Event name<input required maxLength={120} value={eventName} onChange={(change) => setEventName(change.target.value)} placeholder="e.g. Annual staff celebration" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      <div className="relative">
        <label className="block text-xs font-semibold text-slate-600">Link CRM customer (optional)
          <input
            value={customerSearch}
            onFocus={() => setCustomerSearchOpen(true)}
            onChange={(change) => {
              setCustomerSearch(change.target.value);
              setSelectedCustomer(null);
              setCustomerSearchOpen(true);
            }}
            placeholder="Search name, phone, or email"
            autoComplete="off"
            className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
          />
        </label>
        {customerSearchOpen && !selectedCustomer && customerResults.length > 0 && <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border bg-white shadow-lg" aria-label="CRM customer search results">
          {customerResults.map((customer) => <li key={customer.id}>
            <button type="button" onClick={() => {
              setSelectedCustomer(customer);
              setCustomerName(customer.name);
              setCustomerPhone(customer.phone ?? "");
              setCustomerEmail(customer.email ?? "");
              setCustomerSearch("");
              setCustomerResults([]);
              setCustomerSearchOpen(false);
            }} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
              <span className="block font-semibold text-slate-800">{customer.name}</span>
              <span className="block text-xs text-slate-500">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}</span>
            </button>
          </li>)}
        </ul>}
        {selectedCustomer && <p className="mt-1 text-xs text-emerald-700">Linked to CRM: {selectedCustomer.name} · <button type="button" onClick={() => {
          setSelectedCustomer(null);
          setCustomerName("");
          setCustomerPhone("");
          setCustomerEmail("");
          setCustomerSearchOpen(true);
        }} className="font-semibold underline">Change</button></p>}
        {customerSearchError && <p role="alert" className="mt-1 text-xs text-red-700">{customerSearchError}</p>}
        {customerSearchOpen && customerSearch.trim().length > 0 && customerResults.length === 0 && !customerSearchError
          && <p className="mt-1 text-xs text-slate-500">No matching CRM customer. You can continue with manual customer details.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Customer name<input required maxLength={120} value={customerName} onChange={(change) => { setCustomerName(change.target.value); setSelectedCustomer(null); }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Organization (optional)<input maxLength={160} value={customerOrganization} onChange={(change) => setCustomerOrganization(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Phone<input required type="tel" maxLength={40} value={customerPhone} onChange={(change) => { setCustomerPhone(change.target.value); setSelectedCustomer(null); }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Email (optional)<input type="email" maxLength={254} value={customerEmail} onChange={(change) => { setCustomerEmail(change.target.value); setSelectedCustomer(null); }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Event date & time (your local time)<input required type="datetime-local" min={minimumStartsAt} value={startsAt} onFocus={initializeEventDate} onChange={(change) => setStartsAt(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Guest count<input required type="number" min="1" max="10000" step="1" value={guestCount} onChange={(change) => setGuestCount(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <label className="block text-xs font-semibold text-slate-600">Event venue<input required maxLength={300} value={eventLocation} onChange={(change) => setEventLocation(change.target.value)} placeholder="Address or venue" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Custom menu requirements<textarea maxLength={5000} rows={3} value={customMenu} onChange={(change) => setCustomMenu(change.target.value)} placeholder="Menu ideas, dietary needs, quantities" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Delivery & setup requirements<textarea maxLength={2000} rows={2} value={setupRequirements} onChange={(change) => setSetupRequirements(change.target.value)} placeholder="Delivery window, equipment, setup or staffing needs" className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
      <label className="block text-xs font-semibold text-slate-600">Internal notes<textarea maxLength={2000} rows={2} value={notes} onChange={(change) => setNotes(change.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
      <button type="submit" disabled={isPending || !locationId} className="rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Create inquiry"}</button>
    </form> : <p className="h-fit rounded-lg bg-slate-100 p-3 text-xs text-slate-600">You can review events but do not have permission to create catering inquiries.</p>}
  </div>;
}

function CateringEventCard({ event, history, quotes, payments, finalInvoice, prepTasks, menuPlans, menuItems, ingredients, ingredientStocks, recipeIngredients, staff, currency, dataError, canIssueInvoice, canEdit, isPending, onAction }: {
  event: RestaurantCateringEvent;
  history: Database["public"]["Tables"]["restaurant_catering_event_status_history"]["Row"][];
  quotes: RestaurantCateringQuote[];
  payments: RestaurantCateringPayment[];
  finalInvoice: RestaurantCateringInvoice | null;
  prepTasks: RestaurantCateringPrepTask[];
  menuPlans: RestaurantCateringMenuPlanItem[];
  menuItems: MenuItem[];
  ingredients: RestaurantIngredient[];
  ingredientStocks: RestaurantIngredientStock[];
  recipeIngredients: RestaurantRecipeIngredient[];
  staff: RestaurantCateringStaff[];
  currency: string;
  dataError: boolean;
  canIssueInvoice: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [quoteDescription, setQuoteDescription] = useState(event.custom_menu || `Catering service for ${event.guest_count} guests.`);
  const [quoteTotal, setQuoteTotal] = useState("");
  const [depositDue, setDepositDue] = useState("");
  const [quoteExpiry, setQuoteExpiry] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<RestaurantCateringPayment["payment_method"]>("cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [paidAt, setPaidAt] = useState("");
  const [paymentRequestKey, setPaymentRequestKey] = useState("");
  const [invoiceDueDate, setInvoiceDueDate] = useState("");
  const [prepTitle, setPrepTitle] = useState("");
  const [prepNotes, setPrepNotes] = useState("");
  const [prepDueAt, setPrepDueAt] = useState("");
  const [prepAssignedTo, setPrepAssignedTo] = useState("");
  const [prepChecklistText, setPrepChecklistText] = useState("");
  const [plannedMenuItems, setPlannedMenuItems] = useState(() => menuPlans.map((item) => ({
    menuItemId: item.menu_item_id,
    quantity: item.quantity,
  })));
  const [menuItemChoice, setMenuItemChoice] = useState("");
  const [menuItemQuantity, setMenuItemQuantity] = useState("1");
  const activeQuote = quotes.find((quote) => quote.status === "issued") ?? null;
  const activeQuotePayments = activeQuote ? payments.filter((payment) => payment.quote_id === activeQuote.id) : [];
  const activeQuotePaidCents = activeQuotePayments.reduce((sum, payment) => sum + Math.round(Number(payment.amount) * 100), 0);
  const activeQuotePaid = activeQuotePaidCents / 100;
  const activeQuoteBalance = activeQuote
    ? Math.max(0, Math.round(Number(activeQuote.total) * 100) - activeQuotePaidCents) / 100
    : 0;
  const canReviseQuote = activeQuote ? activeQuotePayments.length === 0 : true;
  const menuItemById = new Map(menuItems.map((item) => [item.id, item]));
  const ingredientById = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  const requiredIngredients = new Map<string, number>();
  const menuItemsMissingRecipes: string[] = [];
  for (const plannedItem of plannedMenuItems) {
    const itemRecipes = recipeIngredients.filter((recipe) => recipe.menu_item_id === plannedItem.menuItemId);
    if (itemRecipes.length === 0) {
      menuItemsMissingRecipes.push(menuItemById.get(plannedItem.menuItemId)?.name ?? "Unavailable menu item");
    }
    for (const recipe of itemRecipes) {
      requiredIngredients.set(
        recipe.ingredient_id,
        (requiredIngredients.get(recipe.ingredient_id) ?? 0) + Number(recipe.quantity) * plannedItem.quantity,
      );
    }
  }
  const ingredientRequirements = Array.from(requiredIngredients, ([ingredientId, quantity]) => {
    const ingredient = ingredientById.get(ingredientId);
    const onHand = Number(ingredientStocks.find((stock) =>
      stock.location_id === event.location_id && stock.ingredient_id === ingredientId)?.quantity ?? 0);
    return {
      ingredientId,
      name: ingredient?.name ?? "Unavailable ingredient",
      unit: ingredient?.unit ?? "",
      required: quantity,
      onHand,
      shortage: Math.max(0, quantity - onHand),
      estimatedCost: quantity * Number(ingredient?.cost_per_unit ?? 0),
    };
  }).sort((first, second) => first.name.localeCompare(second.name));
  const estimatedIngredientCost = ingredientRequirements.reduce((total, item) => total + item.estimatedCost, 0);
  const planIsValid = plannedMenuItems.length <= 100 && plannedMenuItems.every((item) =>
    Number.isInteger(item.quantity) && item.quantity >= 1 && item.quantity <= 10000
      && menuItemById.get(item.menuItemId)?.is_active);

  function submitMenuPlan(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void onAction(() => saveRestaurantCateringMenuPlan({
      eventId: event.id,
      items: plannedMenuItems,
    }), `Ingredient plan saved for event #${event.event_number}.`);
  }

  function addMenuItemToPlan() {
    const quantity = Number(menuItemQuantity);
    if (!menuItemChoice || !Number.isInteger(quantity) || quantity < 1 || quantity > 10000) return;
    setPlannedMenuItems((current) => {
      const existing = current.find((item) => item.menuItemId === menuItemChoice);
      if (!existing) return [...current, { menuItemId: menuItemChoice, quantity }];
      return current.map((item) => item.menuItemId === menuItemChoice
        ? { ...item, quantity: Math.min(10000, item.quantity + quantity) }
        : item);
    });
    setMenuItemChoice("");
    setMenuItemQuantity("1");
  }

  function submitQuote(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void onAction(async () => {
      await createRestaurantCateringQuote({
        eventId: event.id,
        description: quoteDescription,
        total: Number(quoteTotal),
        depositDue: Number(depositDue || "0"),
        expiresOn: quoteExpiry,
      });
      setQuoteTotal("");
      setDepositDue("");
      setQuoteExpiry("");
    }, `Quotation issued for event #${event.event_number}.`);
  }

  function submitPayment(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    if (!activeQuote) return;
    const requestKey = paymentRequestKey || crypto.randomUUID();
    setPaymentRequestKey(requestKey);
    void onAction(async () => {
      const paymentDate = new Date(paidAt);
      if (!Number.isFinite(paymentDate.getTime())) throw new Error("Choose a valid payment date and time.");
      await recordRestaurantCateringPayment({
        eventId: event.id,
        quoteId: activeQuote.id,
        requestKey,
        amount: Number(paymentAmount),
        paymentMethod,
        reference: paymentReference,
        paidAt: paymentDate.toISOString(),
      });
      setPaymentAmount("");
      setPaymentReference("");
      setPaidAt("");
      setPaymentRequestKey("");
    }, "Catering payment recorded.");
  }

  function submitFinalInvoice(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void onAction(() => issueRestaurantCateringFinalInvoice({
      eventId: event.id,
      dueDate: invoiceDueDate,
    }), `Final invoice issued for event #${event.event_number}.`);
  }

  function submitPrepTask(formEvent: React.FormEvent<HTMLFormElement>) {
    formEvent.preventDefault();
    void onAction(async () => {
      const dueDate = new Date(prepDueAt);
      if (!Number.isFinite(dueDate.getTime())) throw new Error("Choose a valid preparation due date and time.");
      const checklistItems = prepChecklistText.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
      await createRestaurantCateringPrepTask({
        eventId: event.id,
        title: prepTitle,
        notes: prepNotes,
        dueAt: dueDate.toISOString(),
        assignedTo: prepAssignedTo || null,
        checklistItems,
      });
      setPrepTitle("");
      setPrepNotes("");
      setPrepDueAt("");
      setPrepAssignedTo("");
      setPrepChecklistText("");
    }, "Preparation task scheduled.");
  }

  return <article className="rounded-xl border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-700">Event #{event.event_number} · {event.guest_count} guests · {event.inquiry_source === "customer_portal" ? "Customer portal" : "Staff entry"}</p>
        <h3 className="mt-1 break-words text-base font-bold text-slate-950">{event.event_name}</h3>
        <p className="mt-1 text-sm text-slate-600">{event.customer_name}{event.customer_organization ? ` · ${event.customer_organization}` : ""}</p>
      </div>
      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{cateringEventStatusLabels[event.status]}</span>
    </div>
    <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
      <div><dt className="text-xs text-slate-500">Date & time (UTC)</dt><dd className="font-medium text-slate-800">{cateringEventDateFormatter.format(new Date(event.starts_at))}</dd></div>
      <div><dt className="text-xs text-slate-500">Event location</dt><dd className="break-words font-medium text-slate-800">{event.event_location}</dd></div>
      <div><dt className="text-xs text-slate-500">Contact</dt><dd className="break-words font-medium text-slate-800">{event.customer_phone}{event.customer_email ? ` · ${event.customer_email}` : ""}</dd></div>
      {event.estimated_budget !== null && <div><dt className="text-xs text-slate-500">Estimated budget</dt><dd className="font-medium text-slate-800">{money(Number(event.estimated_budget), currency)}</dd></div>}
    </dl>
    {event.custom_menu && <div className="mt-3"><p className="text-xs font-semibold text-slate-500">Menu requirements</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{event.custom_menu}</p></div>}
    {event.setup_requirements && <div className="mt-3"><p className="text-xs font-semibold text-slate-500">Delivery & setup</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{event.setup_requirements}</p></div>}
    {event.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-slate-600">{event.notes}</p>}

    <section className="mt-4 space-y-3 rounded-lg border bg-slate-50 p-3">
      <div>
        <h4 className="font-semibold text-slate-900">Event menu & ingredient plan</h4>
        <p className="mt-1 text-xs text-slate-500">Scale recipe ingredients by planned servings and compare with this branch’s current stock. This estimate does not reserve or consume inventory.</p>
      </div>
      {canEdit && !["completed", "cancelled"].includes(event.status) && <form onSubmit={submitMenuPlan} className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-52 flex-1 text-xs font-semibold text-slate-600">Menu item<select value={menuItemChoice} onChange={(change) => setMenuItemChoice(change.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
            <option value="">Select a menu item</option>
            {menuItems.filter((item) => item.is_active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select></label>
          <label className="w-28 text-xs font-semibold text-slate-600">Servings<input type="number" min="1" max="10000" step="1" value={menuItemQuantity} onChange={(change) => setMenuItemQuantity(change.target.value)} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm" /></label>
          <button type="button" onClick={addMenuItemToPlan} disabled={!menuItemChoice || !Number.isInteger(Number(menuItemQuantity)) || Number(menuItemQuantity) < 1 || Number(menuItemQuantity) > 10000} className="h-10 rounded-lg border bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-50">Add item</button>
        </div>
        {plannedMenuItems.length > 0 && <ul className="space-y-2">
          {plannedMenuItems.map((item) => <li key={item.menuItemId} className="flex flex-wrap items-center gap-2 rounded-lg border bg-white p-2">
            <span className="min-w-40 flex-1 text-sm font-medium text-slate-800">{menuItemById.get(item.menuItemId)?.name ?? "Unavailable menu item"}</span>
            <label className="flex items-center gap-2 text-xs text-slate-600">Servings<input type="number" min="1" max="10000" step="1" value={item.quantity} onChange={(change) => {
              const quantity = Number(change.target.value);
              setPlannedMenuItems((current) => current.map((planned) => planned.menuItemId === item.menuItemId
                ? { ...planned, quantity }
                : planned));
            }} className="h-9 w-24 rounded-lg border px-2 text-sm" /></label>
            <button type="button" onClick={() => setPlannedMenuItems((current) => current.filter((planned) => planned.menuItemId !== item.menuItemId))} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-600">Remove</button>
          </li>)}
        </ul>}
        <button type="submit" disabled={isPending || !planIsValid || dataError} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Save menu & ingredient plan"}</button>
      </form>}
      {!canEdit && plannedMenuItems.length > 0 && <ul className="space-y-1 text-sm text-slate-700">
        {plannedMenuItems.map((item) => <li key={item.menuItemId}>{menuItemById.get(item.menuItemId)?.name ?? "Unavailable menu item"} · {item.quantity} servings</li>)}
      </ul>}
      {plannedMenuItems.length === 0 && <p className="text-sm text-slate-500">No menu items planned yet.</p>}
      {plannedMenuItems.length > 0 && <>
        {menuItemsMissingRecipes.length > 0 && <p className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">Add ingredient recipes for: {Array.from(new Set(menuItemsMissingRecipes)).join(", ")}. These items are excluded from ingredient estimates.</p>}
        {ingredientRequirements.length > 0 && <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead><tr className="border-b text-slate-500"><th className="py-2 pr-3">Ingredient</th><th className="py-2 pr-3">Required</th><th className="py-2 pr-3">On hand</th><th className="py-2">Shortage</th></tr></thead>
            <tbody>{ingredientRequirements.map((item) => <tr key={item.ingredientId} className="border-b last:border-0">
              <td className="py-2 pr-3 font-medium text-slate-800">{item.name}</td>
              <td className="py-2 pr-3">{item.required.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit}</td>
              <td className="py-2 pr-3">{item.onHand.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit}</td>
              <td className={`py-2 font-semibold ${item.shortage > 0 ? "text-red-700" : "text-emerald-700"}`}>{item.shortage.toLocaleString(undefined, { maximumFractionDigits: 3 })} {item.unit}</td>
            </tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs font-semibold text-slate-700">Estimated ingredient cost: {money(estimatedIngredientCost, currency)}</p>
        </div>}
      </>}
    </section>

    {quotes.length > 0 && <section className="mt-4 rounded-lg border bg-slate-50 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">Quotation{quotes.length > 1 ? "s" : ""}</h4>
        {quotes.map((quote) => <span key={quote.id} className="text-xs text-slate-500">v{quote.version} · {quote.status}</span>)}
      </div>
      {activeQuote && <>
        <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{activeQuote.description}</p>
        <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Quote total</dt><dd className="font-semibold">{money(Number(activeQuote.total), activeQuote.currency)}</dd></div>
          <div><dt className="text-xs text-slate-500">Deposit required</dt><dd className="font-semibold">{money(Number(activeQuote.deposit_due), activeQuote.currency)}</dd></div>
          <div><dt className="text-xs text-slate-500">Paid · balance</dt><dd className="font-semibold">{money(activeQuotePaid, activeQuote.currency)} · {money(activeQuoteBalance, activeQuote.currency)}</dd></div>
        </dl>
        <p className="mt-2 text-xs text-slate-500">Issued {cateringEventDateFormatter.format(new Date(activeQuote.created_at))}{activeQuote.expires_on ? ` · Expires ${activeQuote.expires_on}` : ""}</p>
        <button type="button" onClick={() => window.print()} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700">Print quotation</button>
      </>}
      {quotes.filter((quote) => quote.status === "superseded").map((quote) => <p key={quote.id} className="mt-2 text-xs text-slate-500">Quotation v{quote.version} was superseded · {money(Number(quote.total), quote.currency)}</p>)}
    </section>}

    {(finalInvoice || (canEdit && event.status === "completed" && activeQuote)) && <section className="mt-4 rounded-lg border bg-slate-50 p-3">
      <h4 className="font-semibold text-slate-900">Final invoice & outstanding balance</h4>
      {finalInvoice ? <>
        <p className="mt-1 text-sm text-slate-600">Invoice #{String(finalInvoice.invoice_number).padStart(4, "0")} · {finalInvoice.status}</p>
        <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
          <div><dt className="text-xs text-slate-500">Invoice total</dt><dd className="font-semibold">{money(Number(finalInvoice.amount), currency)}</dd></div>
          <div><dt className="text-xs text-slate-500">Payments received</dt><dd className="font-semibold">{money(Number(finalInvoice.amount_paid), currency)}</dd></div>
          <div><dt className="text-xs text-slate-500">Outstanding</dt><dd className="font-semibold">{money(Number(finalInvoice.amount) - Number(finalInvoice.amount_paid), currency)}</dd></div>
        </dl>
        <Link href="/accounting/invoices" className="mt-3 inline-block text-xs font-semibold text-orange-700 hover:underline">View Accounts Receivable invoices</Link>
      </> : canIssueInvoice ? <form onSubmit={submitFinalInvoice} className="mt-2 flex flex-wrap items-end gap-3">
        <label className="text-xs font-semibold text-slate-600">Payment due date<input required type="date" value={invoiceDueDate} onChange={(change) => setInvoiceDueDate(change.target.value)} className="mt-1 h-10 rounded-lg border bg-white px-3 text-sm" /></label>
        <button type="submit" disabled={isPending || dataError} className="h-10 rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Issuing..." : "Issue final invoice"}</button>
      </form> : <p className="mt-1 text-xs text-slate-500">Accounts Receivable invoice creation permission is required to issue the final invoice.</p>}
      <p className="mt-2 text-xs text-slate-500">Recorded deposits and installments are credited against the invoice total and its Accounts Receivable balance.</p>
    </section>}

    {canEdit && canReviseQuote && ["inquiry", "quoted"].includes(event.status) && <form onSubmit={submitQuote} className="mt-4 space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold text-slate-900">{activeQuote ? "Revise quotation" : "Prepare quotation"}</h4>
      <label className="block text-xs font-semibold text-slate-600">Quotation scope and terms<textarea required maxLength={5000} rows={3} value={quoteDescription} onChange={(change) => setQuoteDescription(change.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block text-xs font-semibold text-slate-600">Total ({currency})<input required type="number" min="0.01" step="0.01" value={quoteTotal} onChange={(change) => setQuoteTotal(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Deposit required<input required type="number" min="0" step="0.01" value={depositDue} onChange={(change) => setDepositDue(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Valid through<input type="date" value={quoteExpiry} onChange={(change) => setQuoteExpiry(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <button type="submit" disabled={isPending} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Issue quotation"}</button>
    </form>}

    {canEdit && activeQuote && activeQuoteBalance > 0 && event.status !== "cancelled" && <form onSubmit={submitPayment} className="mt-4 space-y-3 rounded-lg border p-3">
      <h4 className="font-semibold text-slate-900">Record deposit, installment or balance payment</h4>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold text-slate-600">Amount<input required type="number" min="0.01" max={activeQuoteBalance} step="0.01" value={paymentAmount} onChange={(change) => setPaymentAmount(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Payment method<select value={paymentMethod} onChange={(change) => setPaymentMethod(change.target.value as RestaurantCateringPayment["payment_method"])} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
          <option value="cash">Cash</option><option value="card">Card</option><option value="bank_transfer">Bank transfer</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
        </select></label>
        <label className="block text-xs font-semibold text-slate-600">Payment date & time<input required type="datetime-local" value={paidAt} onChange={(change) => setPaidAt(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Reference (optional)<input maxLength={120} value={paymentReference} onChange={(change) => setPaymentReference(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      </div>
      <button type="submit" disabled={isPending} className="rounded-lg border px-4 py-2 text-sm font-semibold text-slate-800 disabled:opacity-50">Record payment</button>
      {activeQuotePaidCents < Math.round(Number(activeQuote.deposit_due) * 100) && <p className="text-xs text-amber-800">{money(Math.round(Number(activeQuote.deposit_due) * 100 - activeQuotePaidCents) / 100, activeQuote.currency)} remains due before event confirmation.</p>}
    </form>}

    <section className="mt-4 space-y-3 rounded-lg border p-3">
      <div>
        <h4 className="font-semibold text-slate-900">Preparation schedule & checklist</h4>
        <p className="mt-1 text-xs text-slate-500">Schedule work before the event; tasks can be assigned to staff at this branch.</p>
      </div>
      {prepTasks.length === 0 ? <p className="text-sm text-slate-500">No preparation tasks scheduled.</p> : <ul className="space-y-3">
        {prepTasks.map((task) => {
          const checklist = cateringChecklistItems(task.checklist);
          const assignedStaff = staff.find((member) => member.userId === task.assigned_to);
          const allowedTaskStatuses: RestaurantCateringPrepTask["status"][] = ["pending", "in_progress", "completed", "cancelled"];
          return <li key={task.id} className="rounded-lg border bg-slate-50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-slate-900">{task.title}</p>
                <p className="mt-1 text-xs text-slate-500">Due {cateringEventDateFormatter.format(new Date(task.due_at))} UTC · {assignedStaff?.fullName ?? (task.assigned_to ? "Assigned staff" : "Unassigned")}</p>
              </div>
              <span className="rounded-full bg-white px-2 py-1 text-xs font-medium capitalize text-slate-600">{task.status.replace("_", " ")}</span>
            </div>
            {task.notes && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{task.notes}</p>}
            {checklist.length > 0 && <ul className="mt-2 space-y-1">
              {checklist.map((item, index) => <li key={`${task.id}:${index}`}>
                <label className={`flex items-start gap-2 text-sm ${item.completed ? "text-slate-400 line-through" : "text-slate-700"}`}>
                  <input
                    type="checkbox"
                    checked={item.completed}
                    disabled={!canEdit || isPending || ["completed", "cancelled"].includes(event.status) || task.status === "cancelled"}
                    onChange={(change) => void onAction(
                      () => updateRestaurantCateringPrepChecklistItem({ taskId: task.id, itemIndex: index, completed: change.target.checked }),
                      "Preparation checklist updated.",
                    )}
                    className="mt-0.5"
                  />
                  <span>{item.title}</span>
                </label>
              </li>)}
            </ul>}
            {canEdit && !["completed", "cancelled"].includes(event.status) && <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-slate-600">Assigned staff
                <select
                  value={task.assigned_to ?? ""}
                  disabled={isPending}
                  onChange={(change) => void onAction(
                    () => updateRestaurantCateringPrepTask({
                      taskId: task.id,
                      status: task.status,
                      assignedTo: change.target.value || null,
                    }),
                    "Preparation task assignment updated.",
                  )}
                  className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-sm"
                >
                  <option value="">Unassigned</option>
                  {staff.map((member) => <option key={member.userId} value={member.userId}>{member.fullName}</option>)}
                </select>
              </label>
              <label className="text-xs font-semibold text-slate-600">Task status
                <select
                  value={task.status}
                  disabled={isPending}
                  onChange={(change) => {
                    if (allowedTaskStatuses.includes(change.target.value as RestaurantCateringPrepTask["status"])) {
                      void onAction(
                        () => updateRestaurantCateringPrepTask({
                          taskId: task.id,
                          status: change.target.value as RestaurantCateringPrepTask["status"],
                          assignedTo: task.assigned_to,
                        }),
                        "Preparation task status updated.",
                      );
                    }
                  }}
                  className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-sm"
                >
                  {allowedTaskStatuses.map((status) => <option key={status} value={status}>{status.replace("_", " ")}</option>)}
                </select>
              </label>
            </div>}
          </li>;
        })}
      </ul>}
      {canEdit && !["completed", "cancelled"].includes(event.status) && <form onSubmit={submitPrepTask} className="space-y-3 border-t pt-3">
        <p className="text-sm font-semibold text-slate-800">Schedule a preparation task</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-slate-600">Task title<input required maxLength={160} value={prepTitle} onChange={(change) => setPrepTitle(change.target.value)} placeholder="e.g. Prepare sauces" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
          <label className="text-xs font-semibold text-slate-600">Due date & time (your local time)<input required type="datetime-local" value={prepDueAt} onChange={(change) => setPrepDueAt(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        </div>
        <label className="block text-xs font-semibold text-slate-600">Assign to (optional)<select value={prepAssignedTo} onChange={(change) => setPrepAssignedTo(change.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
          <option value="">Unassigned</option>
          {staff.map((member) => <option key={member.userId} value={member.userId}>{member.fullName}</option>)}
        </select></label>
        <label className="block text-xs font-semibold text-slate-600">Task notes<textarea maxLength={2000} rows={2} value={prepNotes} onChange={(change) => setPrepNotes(change.target.value)} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Checklist (one item per line, up to 30)<textarea maxLength={6000} rows={3} value={prepChecklistText} onChange={(change) => setPrepChecklistText(change.target.value)} placeholder={"Confirm quantities\nPrepare ingredients\nPack equipment"} className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" /></label>
        <button type="submit" disabled={isPending} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : "Add preparation task"}</button>
      </form>}
    </section>

    {payments.length > 0 && <details className="mt-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">Payment history ({payments.length})</summary>
      <ul className="mt-2 space-y-1">{payments.map((payment) => <li key={payment.id} className="text-xs text-slate-600">
        {money(Number(payment.amount), quotes.find((quote) => quote.id === payment.quote_id)?.currency ?? currency)} · {payment.payment_method.replace("_", " ")} · {cateringEventDateFormatter.format(new Date(payment.paid_at))}{payment.reference ? ` · ${payment.reference}` : ""}
      </li>)}</ul>
    </details>}

    {history.length > 0 && <details className="mt-3 border-t pt-3">
      <summary className="cursor-pointer text-xs font-semibold text-slate-600">Status history</summary>
      <ol className="mt-2 space-y-1">{history.map((entry) => <li key={entry.id} className="text-xs text-slate-500">
        {entry.previous_status ? `${cateringEventStatusLabels[entry.previous_status]} → ` : ""}{cateringEventStatusLabels[entry.new_status]} · {cateringEventDateFormatter.format(new Date(entry.changed_at))}
      </li>)}</ol>
    </details>}
    {canEdit && cateringEventStatusTransitions[event.status].length > 0 && <label className="mt-4 block max-w-xs text-xs font-semibold text-slate-600">
      Update event status
      <select value="" disabled={isPending} onChange={(change) => {
        const nextStatus = cateringEventStatusTransitions[event.status].find((status) => status === change.target.value);
        if (nextStatus) void onAction(
          () => updateRestaurantCateringEventStatus(event.id, nextStatus),
          `Event #${event.event_number} marked ${cateringEventStatusLabels[nextStatus].toLowerCase()}.`,
        );
      }} className="mt-1 h-10 w-full rounded-lg border bg-white px-3 text-sm">
        <option value="">Choose next status</option>
        {cateringEventStatusTransitions[event.status].map((status) => <option key={status} value={status}>{cateringEventStatusLabels[status]}</option>)}
      </select>
    </label>}
  </article>;
}

function ReservationsManagement({ locationId, locations, tables, reservations, canCreate, canEdit, isPending, onAction }: {
  locationId: string;
  locations: Location[];
  tables: DiningTable[];
  reservations: RestaurantReservation[];
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [partySize, setPartySize] = useState("2");
  const [startsAt, setStartsAt] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("90");
  const [tableId, setTableId] = useState("");
  const [notes, setNotes] = useState("");
  const [waitlist, setWaitlist] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const filteredReservations = reservations
    .filter((reservation) => localDateKey(reservation.starts_at) === selectedDate)
    .sort((first, second) => first.starts_at.localeCompare(second.starts_at));
  const tableName = (id: string | null) => tables.find((table) => table.id === id)?.table_name ?? "Unassigned";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const created = await onAction(() => createRestaurantReservation({
      locationId,
      tableId: waitlist ? null : tableId || null,
      guestName,
      guestPhone,
      partySize: Number(partySize),
      startsAt,
      durationMinutes: Number(durationMinutes),
      notes,
      waitlist,
    }), waitlist ? "Guest added to the waitlist." : "Reservation created.");
    if (!created) return;
    setGuestName("");
    setGuestPhone("");
    setPartySize("2");
    setStartsAt("");
    setDurationMinutes("90");
    setTableId("");
    setNotes("");
    setWaitlist(false);
  }

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-950">Reservations & waitlist</h2><p className="text-xs text-slate-500">Reserve suitable tables, manage arrivals, or add guests to the waitlist.</p></div>
      <label className="text-xs font-semibold text-slate-600">Reservation date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="ml-2 h-10 rounded-lg border bg-white px-3 text-sm" /></label>
    </div>
    {canCreate && <form onSubmit={submit} className="rounded-xl border border-orange-200 bg-white p-4">
      <h3 className="font-bold text-slate-950">Add guest</h3>
      {locations.length === 0 ? <p className="mt-2 text-sm text-amber-700">No active branch is available for reservations.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-xs font-semibold text-slate-600">Guest name<input required maxLength={120} value={guestName} onChange={(event) => setGuestName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Phone<input required maxLength={40} value={guestPhone} onChange={(event) => setGuestPhone(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Party size<input required type="number" min="1" max="100" step="1" value={partySize} onChange={(event) => setPartySize(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Date and time<input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-slate-600">Duration<select value={durationMinutes} onChange={(event) => setDurationMinutes(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="60">1 hour</option><option value="90">1 hour 30 minutes</option><option value="120">2 hours</option><option value="180">3 hours</option><option value="240">4 hours</option></select></label>
        {!waitlist && <label className="text-xs font-semibold text-slate-600">Table<select required value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="">Select a table</option>{tables.filter((table) => table.is_active && table.seats >= Number(partySize)).map((table) => <option key={table.id} value={table.id}>{table.table_name} · {table.seats} seats</option>)}</select></label>}
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 sm:col-span-2 lg:col-span-3"><input type="checkbox" checked={waitlist} onChange={(event) => { setWaitlist(event.target.checked); if (event.target.checked) setTableId(""); }} />Add to waitlist instead of booking a table</label>
        <label className="text-xs font-semibold text-slate-600 sm:col-span-2 lg:col-span-3">Notes (optional)<input maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <div className="sm:col-span-2 lg:col-span-3"><button disabled={isPending || !locationId} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : waitlist ? "Add to waitlist" : "Create reservation"}</button></div>
      </div>}
    </form>}
    <div className="space-y-3">
      {filteredReservations.length === 0 ? <EmptyState title="No reservations for this date" message="Create a booking or add a guest to the waitlist." /> : filteredReservations.map((reservation) => (
        <article key={reservation.id} className="rounded-xl border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-bold text-slate-950">{reservation.guest_name}</h3><span className="rounded-full bg-orange-50 px-2 py-1 text-[11px] font-semibold text-orange-700">{reservationStatusLabels[reservation.status]}</span></div>
              <p className="mt-1 text-sm text-slate-600">{reservation.guest_phone} · Party of {reservation.party_size} · {tableName(reservation.table_id)}</p>
              <p className="mt-1 text-xs text-slate-500">{new Date(reservation.starts_at).toLocaleString()} – {new Date(reservation.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</p>
              {reservation.notes && <p className="mt-1 text-xs text-slate-500">{reservation.notes}</p>}
            </div>
            {canEdit && <div className="flex flex-wrap gap-2">
              {reservation.status === "waitlisted" && <AssignReservationTable
                reservation={reservation}
                tables={tables.filter((table) => table.is_active && table.seats >= reservation.party_size)}
                isPending={isPending}
                onAssign={(tableId) => onAction(() => assignRestaurantReservationTable(reservation.id, tableId), "Table assigned and reservation confirmed.")}
              />}
              {reservation.status === "confirmed" && <>
                <button type="button" disabled={isPending} onClick={() => onAction(() => updateRestaurantReservationStatus(reservation.id, "seated"), "Guest marked seated.")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Seat guest</button>
                <button type="button" disabled={isPending} onClick={() => onAction(() => updateRestaurantReservationStatus(reservation.id, "no_show"), "Reservation marked no-show.")} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">No-show</button>
              </>}
              {reservation.status === "seated" && <button type="button" disabled={isPending} onClick={() => onAction(() => updateRestaurantReservationStatus(reservation.id, "completed"), "Reservation completed.")} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Complete</button>}
              {["waitlisted", "confirmed", "seated"].includes(reservation.status) && <button type="button" disabled={isPending} onClick={() => onAction(() => updateRestaurantReservationStatus(reservation.id, "cancelled"), "Reservation cancelled.")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancel</button>}
            </div>}
          </div>
        </article>
      ))}
    </div>
  </section>;
}

function csvCell(value: string | number) {
  const text = String(value);
  const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safeText.replaceAll('"', '""')}"`;
}

function RestaurantReports({ currency, locations, report, from, to, locationId, attendanceSummary }: {
  currency: string;
  locations: Location[];
  report: RestaurantReport | null;
  from: string;
  to: string;
  locationId: string;
  attendanceSummary: RestaurantLaborSummary | null;
}) {
  function exportReport() {
    if (!report) return;
    const rows: Array<Array<string | number>> = [
      ["Restaurant report", `${from} to ${to}`],
      ["Branch", locationId === "all" ? "All accessible branches" : locations.find((location) => location.id === locationId)?.name ?? "Selected branch"],
      [],
      ["Summary", "Value"],
      ["Non-cancelled orders", report.summary.order_count],
      ["Completed orders", report.summary.completed_count],
      ["Cancelled orders", report.summary.cancelled_count],
      ["Gross sales", report.summary.gross_sales],
      ["Payments received for these orders", report.summary.collected_payments],
      ["Average order", report.summary.average_order],
      [],
      ["Daily sales", "Orders", "Gross sales"],
      ...report.daily.map((row) => [row.date, row.order_count, row.gross_sales]),
      [],
      ["Order type", "Orders", "Gross sales"],
      ...report.by_type.map((row) => [row.order_type.replace("_", " "), row.order_count, row.gross_sales]),
      [],
      ["Top menu items", "Quantity sold", "Sales"],
      ...report.top_items.map((row) => [row.item_name, row.quantity_sold, row.sales]),
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `restaurant-report-${from}-to-${to}.csv`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const summaryCards = report ? [
    ["Orders", report.summary.order_count],
    ["Completed", report.summary.completed_count],
    ["Cancelled", report.summary.cancelled_count],
    ["Gross sales", money(report.summary.gross_sales, currency)],
    ["Payments received for these orders", money(report.summary.collected_payments, currency)],
    ["Average order", money(report.summary.average_order, currency)],
  ] as const : [];

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="text-lg font-bold text-slate-950">Restaurant reports</h2><p className="text-xs text-slate-500">Sales are based on order creation date; cancelled orders are excluded. Collected payments are net of refunds and include tips.</p></div>
      <button type="button" onClick={exportReport} disabled={!report} className="rounded-lg border bg-white px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Export CSV</button>
    </div>
    <form action="/restaurant" method="get" className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.5fr_auto]">
      <input type="hidden" name="view" value="reports" />
      <label className="text-xs font-semibold text-slate-600">From<input required type="date" name="from" defaultValue={from} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-600">To<input required type="date" name="to" defaultValue={to} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-slate-600">Branch<select name="locationId" defaultValue={locationId} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="all">All accessible branches</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
      <button className="self-end rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white">Run report</button>
    </form>
    {!report ? <EmptyState title="Report unavailable" message="The report data could not be loaded." /> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {summaryCards.map(([label, value]) => <article key={label} className="rounded-xl border bg-white p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-bold text-slate-950">{value}</p></article>)}
        {attendanceSummary && <article className="rounded-xl border bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <p className="text-xs text-slate-500">Restaurant labor · branch-attributed attendance</p>
          <p className="mt-1 text-xl font-bold text-slate-950 dark:text-white">{attendanceSummary.total_hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} hours</p>
          <p className="mt-1 text-xs text-slate-500">{attendanceSummary.staff_count} staff · {attendanceSummary.record_count} attendance records</p>
          {attendanceSummary.by_branch.length > 0 && <ul className="mt-3 space-y-1 border-t pt-2">
            {attendanceSummary.by_branch.map((branch) => <li key={branch.location_id} className="flex justify-between gap-2 text-xs">
              <span className="truncate text-slate-600 dark:text-slate-300">{branch.location_name}</span>
              <span className="shrink-0 font-semibold text-slate-800 dark:text-white">{branch.total_hours.toLocaleString(undefined, { maximumFractionDigits: 2 })} h · {branch.staff_count} staff</span>
            </li>)}
          </ul>}
          <p className="mt-2 text-[11px] text-slate-500">Only attendance records explicitly assigned to the selected Restaurant branch(es) are included. Unassigned attendance is excluded.</p>
        </article>}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">Daily sales</h3>
          {report.daily.length === 0 ? <p className="mt-3 text-sm text-slate-500">No orders in this period.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2">Date</th><th className="py-2">Orders</th><th className="py-2 text-right">Gross sales</th></tr></thead><tbody>{report.daily.map((row) => <tr key={row.date} className="border-b last:border-0"><td className="py-2">{row.date}</td><td className="py-2">{row.order_count}</td><td className="py-2 text-right">{money(row.gross_sales, currency)}</td></tr>)}</tbody></table></div>}
        </section>
        <section className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">Sales by order type</h3>
          {report.by_type.length === 0 ? <p className="mt-3 text-sm text-slate-500">No orders in this period.</p> : <div className="mt-3 space-y-3">{report.by_type.map((row) => <div key={row.order_type} className="flex items-center justify-between border-b pb-2 last:border-0"><div><p className="font-semibold capitalize text-slate-800">{row.order_type.replace("_", " ")}</p><p className="text-xs text-slate-500">{row.order_count} orders</p></div><strong>{money(row.gross_sales, currency)}</strong></div>)}</div>}
        </section>
        <section className="rounded-xl border bg-white p-4 xl:col-span-2">
          <h3 className="font-bold text-slate-950">Top menu items</h3>
          {report.top_items.length === 0 ? <p className="mt-3 text-sm text-slate-500">No menu item sales in this period.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="border-b text-xs text-slate-500"><th className="py-2">Menu item</th><th className="py-2">Quantity sold</th><th className="py-2 text-right">Sales</th></tr></thead><tbody>{report.top_items.map((row) => <tr key={row.item_name} className="border-b last:border-0"><td className="py-2">{row.item_name}</td><td className="py-2">{row.quantity_sold}</td><td className="py-2 text-right">{money(row.sales, currency)}</td></tr>)}</tbody></table></div>}
        </section>
      </div>
    </>}
  </section>;
}

function IngredientPurchaseOrderCard({
  order,
  currency,
  supplierName,
  items,
  ingredients,
  receipts,
  supplierPayments,
  reconciliationHistory,
  bankAccounts,
  canReconcile,
  canReceive,
  canPay,
  isPending,
  onReconcile,
  onReceive,
  onPay,
}: {
  order: RestaurantIngredientPurchaseOrder;
  currency: string;
  supplierName: string;
  items: RestaurantIngredientPurchaseItem[];
  ingredients: RestaurantIngredient[];
  receipts: RestaurantIngredientReceipt[];
  supplierPayments: RestaurantIngredientPayment[];
  reconciliationHistory: RestaurantInvoiceReconciliationHistory[];
  bankAccounts: Array<{ id: string; name: string }>;
  canReconcile: boolean;
  canReceive: boolean;
  canPay: boolean;
  isPending: boolean;
  onReconcile: (invoice: {
    invoiceReference: string;
    dueDate: string;
    invoiceAmount: number | null;
    notes: string;
  }) => Promise<boolean>;
  onReceive: (items: Array<{ itemId: string; quantity: number }>, requestKey: string) => Promise<boolean>;
  onPay: (amount: number, paymentDate: string, method: "cash" | "bank", bankAccountId: string | null, requestKey: string) => Promise<boolean>;
}) {
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(items.map((item) => [item.id, String(Number(item.ordered_quantity) - Number(item.quantity_received))])),
  );
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "bank">("cash");
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0]?.id ?? "");
  const [invoiceReference, setInvoiceReference] = useState(order.invoice_reference ?? "");
  const [invoiceDueDate, setInvoiceDueDate] = useState(order.due_date ?? "");
  const [invoiceAmount, setInvoiceAmount] = useState(order.invoice_amount?.toString() ?? "");
  const [reconciliationNotes, setReconciliationNotes] = useState(order.invoice_reconciliation_notes ?? "");
  const receiptRequestKey = useRef<string | null>(null);
  const paymentRequestKey = useRef<string | null>(null);
  const postedReceipts = receipts.filter((receipt) => receipt.accounting_status === "posted");
  const invoiceTotal = postedReceipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
  const receivedTotal = receipts.reduce((sum, receipt) => sum + Number(receipt.amount), 0);
  const paidTotal = supplierPayments.reduce((sum, payment) => sum + Number(payment.amount), 0);
  const balanceDue = Math.max(0, invoiceTotal - paidTotal);
  const reconciliationVariance = order.invoice_amount === null
    ? null
    : Number(order.invoice_amount) - receivedTotal;
  const hasUnpostedReceipt = receipts.some((receipt) => receipt.accounting_status === "not_configured");
  const paymentIsValid = Number(paymentAmount) > 0
    && Number(paymentAmount) <= balanceDue
    && /^\d{4}-\d{2}-\d{2}$/.test(paymentDate)
    && (paymentMethod !== "bank" || Boolean(bankAccountId));
  return <article className="rounded-lg border p-3 dark:border-slate-700">
    <div className="flex flex-wrap justify-between gap-2">
      <div>
        <p className="text-sm font-semibold text-slate-900 dark:text-white">{order.invoice_reference || order.reference} · {supplierName}</p>
        <p className="text-xs capitalize text-slate-500">{order.status.replace("_", " ")} · {new Date(order.created_at).toLocaleDateString()}{order.due_date ? ` · Due ${order.due_date}` : ""}</p>
        {order.invoice_reference && <p className="text-xs text-slate-500">Order ref: {order.reference}</p>}
      </div>
      <div className="text-right text-xs">
        <p className="text-slate-500">{items.length} lines · Posted payable {money(invoiceTotal, currency)}{order.invoice_amount !== null ? ` · Supplier invoice ${money(Number(order.invoice_amount), currency)}` : ""}</p>
        <p className={`font-semibold ${balanceDue > 0 || hasUnpostedReceipt ? "text-amber-700" : "text-emerald-700"}`}>{balanceDue > 0 ? `${money(balanceDue, currency)} due` : hasUnpostedReceipt ? "Receipt accounting needs setup" : invoiceTotal > 0 ? "Paid" : "No posted receipts"}</p>
      </div>
    </div>
    <form onSubmit={(event) => {
      event.preventDefault();
      void onReconcile({
        invoiceReference,
        dueDate: invoiceDueDate,
        invoiceAmount: invoiceAmount.trim() ? Number(invoiceAmount) : null,
        notes: reconciliationNotes,
      });
    }} className="mt-3 space-y-2 border-t pt-3">
      <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">Supplier invoice reconciliation</p>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-semibold text-slate-600">Invoice number
          <input disabled={!canReconcile} maxLength={80} value={invoiceReference} onChange={(event) => setInvoiceReference(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Due date
          <input disabled={!canReconcile} type="date" value={invoiceDueDate} onChange={(event) => setInvoiceDueDate(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Supplier invoice amount ({currency})
          <input disabled={!canReconcile} type="number" min="0.01" step="0.01" value={invoiceAmount} onChange={(event) => setInvoiceAmount(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
        </label>
        <label className="text-xs font-semibold text-slate-600">Reconciliation note
          <input disabled={!canReconcile} maxLength={1000} value={reconciliationNotes} onChange={(event) => setReconciliationNotes(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm disabled:bg-slate-50 disabled:text-slate-500" />
        </label>
      </div>
      {reconciliationVariance !== null && reconciliationVariance !== 0 && <p className="text-xs text-amber-700 dark:text-amber-300">
        Invoice amount differs from ingredients received by {money(Math.abs(reconciliationVariance), currency)}. Payments are blocked until these totals match.
      </p>}
      {canReconcile && <button type="submit" disabled={isPending} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200">
        Save invoice reconciliation
      </button>}
    </form>
      {reconciliationHistory.length > 0 && <details className="mt-3 border-t pt-3">
        <summary className="cursor-pointer text-xs font-semibold text-slate-700 dark:text-slate-200">
          Invoice reconciliation history ({Math.min(reconciliationHistory.length, 10)}{reconciliationHistory.length > 10 ? "+" : ""})
        </summary>
        <ol className="mt-2 space-y-2">
          {reconciliationHistory.slice(0, 10).map((entry) => <li key={entry.id} className="rounded border bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-900">
            <p className="font-semibold text-slate-700 dark:text-slate-200">
              {new Date(entry.created_at).toLocaleString()} · {entry.invoice_reference || "No invoice number"}
            </p>
            <p className="mt-1 text-slate-500">Recorded by {entry.recorded_by_name}</p>
            <p className="mt-1 text-slate-600 dark:text-slate-300">
              {entry.invoice_amount === null ? "Invoice amount not recorded" : `Invoice ${money(Number(entry.invoice_amount), currency)}`}
              {entry.due_date ? ` · Due ${entry.due_date}` : ""}
            </p>
            {entry.reconciliation_notes && <p className="mt-1 whitespace-pre-wrap text-slate-500">{entry.reconciliation_notes}</p>}
          </li>)}
        </ol>
      </details>}
      <form onSubmit={(event) => {
      event.preventDefault();
      const receiveLines = items
        .map((item) => ({ itemId: item.id, quantity: Number(quantities[item.id] ?? 0) }))
        .filter((item) => item.quantity > 0);
      if (receiveLines.length) {
        receiptRequestKey.current ??= crypto.randomUUID();
        void onReceive(receiveLines, receiptRequestKey.current).then((succeeded) => {
          if (succeeded) receiptRequestKey.current = null;
        });
      }
    }} className="mt-2 space-y-2">
      {items.map((item) => {
        const remaining = Number(item.ordered_quantity) - Number(item.quantity_received);
        const ingredient = ingredients.find((entry) => entry.id === item.ingredient_id);
        return <div key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem_6rem] items-center gap-2 text-xs">
          <span className="truncate">{ingredient?.name ?? "Ingredient"} · {Number(item.quantity_received)} / {Number(item.ordered_quantity)} {ingredient?.unit ?? ""}</span>
          <span className="text-right text-slate-500">{money(Number(item.unit_cost) * Number(item.ordered_quantity), currency)}</span>
          {canReceive && remaining > 0 ? <input aria-label={`Receive quantity for ${ingredient?.name ?? "ingredient"}`} type="number" min="0" max={remaining} step="0.001" value={quantities[item.id] ?? "0"} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-8 rounded border px-2 text-xs" /> : <span className="text-right">{remaining > 0 ? `${remaining} remaining` : "Received"}</span>}
        </div>;
      })}
      {canReceive && order.status !== "received" && <button disabled={isPending || items.every((item) => Number(quantities[item.id] ?? 0) <= 0)} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Receive selected quantities</button>}
    </form>
    {supplierPayments.length > 0 && <ul className="mt-3 space-y-1 border-t pt-2 text-xs text-slate-600 dark:text-slate-300">
      {supplierPayments.map((payment) => <li key={payment.id} className="flex justify-between gap-2">
        <span>{payment.payment_method === "bank" ? bankAccounts.find((account) => account.id === payment.bank_account_id)?.name ?? "Bank payment" : "Cash"} · {payment.payment_date}</span>
        <strong>{money(Number(payment.amount), currency)}</strong>
      </li>)}
    </ul>}
    {canPay && hasUnpostedReceipt && <p className="mt-3 border-t pt-2 text-xs text-amber-700">A receipt has no payable journal. Configure the Restaurant ingredient accounts and reconcile it before paying this invoice.</p>}
    {canPay && balanceDue > 0 && <form onSubmit={(event) => {
      event.preventDefault();
      if (!paymentIsValid) return;
      paymentRequestKey.current ??= crypto.randomUUID();
      void onPay(
        Number(paymentAmount),
        paymentDate,
        paymentMethod,
        paymentMethod === "bank" ? bankAccountId : null,
        paymentRequestKey.current,
      ).then((succeeded) => {
        if (succeeded) {
          paymentRequestKey.current = null;
          setPaymentAmount("");
        }
      });
    }} className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-5">
      <label className="text-xs font-semibold text-slate-600">Pay amount
        <input required type="number" min="0.01" max={balanceDue} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-slate-600">Payment date
        <input required type="date" max={new Date().toISOString().slice(0, 10)} value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} className="mt-1 h-9 w-full rounded border px-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-slate-600">Method
        <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "bank")} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900">
          <option value="cash">Cash</option><option value="bank" disabled={!bankAccounts.length}>Bank</option>
        </select>
      </label>
      {paymentMethod === "bank" && <label className="text-xs font-semibold text-slate-600">Bank Account
        <select required value={bankAccountId} onChange={(event) => setBankAccountId(event.target.value)} className="mt-1 h-9 w-full rounded border bg-white px-2 text-sm dark:bg-slate-900">
          <option value="">Select account</option>{bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
        </select>
      </label>}
      <button type="submit" disabled={isPending || !paymentIsValid || hasUnpostedReceipt} className="self-end rounded-lg bg-orange-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Record payment</button>
      {!bankAccounts.length && <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-5">Bank payment requires Bank Accounts edit access. Cash payment remains available.</p>}
    </form>}
  </article>;
}

function AssignReservationTable({ reservation, tables, isPending, onAssign }: {
  reservation: RestaurantReservation;
  tables: DiningTable[];
  isPending: boolean;
  onAssign: (tableId: string) => Promise<boolean>;
}) {
  const [tableId, setTableId] = useState("");
  return <form onSubmit={(event) => {
    event.preventDefault();
    if (tableId) void onAssign(tableId);
  }} className="flex gap-2">
    <select aria-label={`Assign table for ${reservation.guest_name}`} required value={tableId} onChange={(event) => setTableId(event.target.value)} className="h-9 max-w-40 rounded border px-2 text-xs">
      <option value="">Select table</option>
      {tables.map((table) => <option key={table.id} value={table.id}>{table.table_name} · {table.seats} seats</option>)}
    </select>
    <button disabled={isPending || !tableId} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Assign & confirm</button>
  </form>;
}

function TableManagement({ locations, tables, orders, selectedLocationId, branchScoped, canCreate, canEdit, isPending, onAction }: {
  locations: Location[];
  tables: DiningTable[];
  orders: RestaurantOrder[];
  selectedLocationId: string;
  branchScoped: boolean;
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => void;
}) {
  const [editingId, setEditingId] = useState<string | undefined>();
  const [name, setName] = useState("");
  const [seats, setSeats] = useState("2");
  const [locationId, setLocationId] = useState(selectedLocationId);
  const visibleTables = tables.filter((table) => table.location_id === selectedLocationId);
  const tableLocationId = editingId ? locationId : selectedLocationId;

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onAction(async () => {
      await saveRestaurantTable({
        id: editingId,
        locationId: tableLocationId,
        tableName: name,
        seats: Number(seats),
        isActive: tables.find((table) => table.id === editingId)?.is_active ?? true,
      });
      setEditingId(undefined);
      setName("");
      setSeats("2");
    }, "Dining table saved.");
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
      <section className="space-y-3">
        <div><h2 className="text-lg font-bold text-slate-950">Dining tables</h2><p className="text-xs text-slate-500">Tables are assigned to branches and shown only to staff with access to that branch.</p></div>
        {visibleTables.length === 0 ? <EmptyState title="No tables at this branch" message="Add a dining table to make it available for dine-in orders." /> : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visibleTables.map((table) => <article key={table.id} className={`rounded-xl border bg-white p-4 ${!table.is_active ? "opacity-60" : ""}`}>
            <p className="text-lg font-bold text-slate-950">{table.table_name}{!table.is_active && <span className="ml-2 text-xs font-normal text-slate-500">Unavailable</span>}</p><p className="text-sm text-slate-500">{table.seats} seats</p>
            {orders.some((order) => order.table_id === table.id && !["completed", "cancelled"].includes(order.status)) && <span className="mt-2 inline-block rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">Occupied</span>}
            {canEdit && <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => { setEditingId(table.id); setName(table.table_name); setSeats(String(table.seats)); setLocationId(table.location_id); }} className="rounded border px-3 py-1.5 text-xs font-semibold">Edit table</button>
              <button type="button" disabled={isPending || (table.is_active && orders.some((order) => order.table_id === table.id && !["completed", "cancelled"].includes(order.status)))} onClick={() => onAction(() => saveRestaurantTable({ id: table.id, locationId: table.location_id, tableName: table.table_name, seats: table.seats, isActive: !table.is_active }), table.is_active ? "Dining table marked unavailable." : "Dining table activated.")} className="rounded border px-3 py-1.5 text-xs font-semibold disabled:opacity-50">{table.is_active ? "Unavailable" : "Activate"}</button>
            </div>}
          </article>)}</div>
        )}
      </section>
      {(canCreate || (editingId && canEdit)) ? <form onSubmit={submit} className="h-fit rounded-xl border bg-white p-4">
        <h2 className="font-bold text-slate-950">{editingId ? "Edit dining table" : "Add dining table"}</h2>
        <label className="mt-3 block text-xs font-semibold">Branch<span className="mt-1 block rounded-lg border bg-slate-50 px-3 py-2 text-sm font-normal">{locations.find((location) => location.id === (editingId ? locationId : selectedLocationId))?.name ?? "No branch available"}</span></label>
        <label className="mt-3 block text-xs font-semibold">Table name<input required maxLength={40} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. Table 1" className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="mt-3 block text-xs font-semibold">Seats<input required type="number" min="1" max="100" step="1" value={seats} onChange={(event) => setSeats(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <div className="mt-4 flex gap-2"><button disabled={isPending || !locations.length} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : editingId ? "Save table" : "Add table"}</button>{editingId && <button type="button" onClick={() => { setEditingId(undefined); setName(""); setSeats("2"); }} className="rounded-lg border px-4 py-2 text-sm">Cancel</button>}</div>
      </form> : <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">{branchScoped ? "You can view tables at your assigned branches." : "You do not have permission to manage dining tables."}</p>}
    </div>
  );
}

function EmptyState({ title, message }: { title: string; message: string }) {
  return <div className="rounded-xl border border-dashed bg-white p-8 text-center"><h3 className="font-semibold text-slate-800">{title}</h3><p className="mt-1 text-sm text-slate-500">{message}</p></div>;
}
