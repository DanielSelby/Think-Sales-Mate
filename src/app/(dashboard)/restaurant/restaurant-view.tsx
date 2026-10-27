"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database, Json } from "@/types/database";
import {
  createRestaurantOrder,
  createRestaurantReservation,
  assignRestaurantReservationTable,
  adjustRestaurantIngredientStock,
  recordRestaurantPayment,
  refundRestaurantPayment,
  saveRestaurantCategory,
  saveRestaurantMenuItem,
  saveRestaurantOnlineSettings,
  saveRestaurantIngredient,
  saveRestaurantRecipe,
  saveRestaurantModifierGroup,
  saveRestaurantModifierOption,
  saveRestaurantTable,
  updateRestaurantKitchenStatus,
  updateRestaurantOrderStatus,
  updateRestaurantReservationStatus,
  splitRestaurantBillByItems,
  splitRestaurantBillEqually,
} from "./actions";

type Category = Database["public"]["Tables"]["restaurant_menu_categories"]["Row"];
type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type ModifierGroup = Database["public"]["Tables"]["restaurant_modifier_groups"]["Row"];
type ModifierOption = Database["public"]["Tables"]["restaurant_modifier_options"]["Row"];
type DiningTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type RestaurantReservation = Database["public"]["Tables"]["restaurant_reservations"]["Row"];
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
type ViewKey = "orders" | "kitchen" | "menu" | "tables" | "reservations" | "reports" | "ingredients";
const prepStationLabels: Record<PrepStation, string> = { kitchen: "Kitchen", bar: "Bar", dessert: "Dessert" };
type RestaurantIngredient = Database["public"]["Tables"]["restaurant_ingredients"]["Row"];
type RestaurantIngredientStock = Database["public"]["Tables"]["restaurant_ingredient_stock"]["Row"];
type RestaurantRecipeIngredient = Database["public"]["Tables"]["restaurant_recipe_ingredients"]["Row"];
type RestaurantIngredientMovement = Database["public"]["Tables"]["restaurant_ingredient_movements"]["Row"];
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
  by_type: Array<{ order_type: "dine_in" | "takeaway" | "delivery"; order_count: number; gross_sales: number }>;
  top_items: Array<{ item_name: string; quantity_sold: number; sales: number }>;
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
  return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
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
  canEditIngredients,
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
}: {
  view: ViewKey;
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
  canEditIngredients: boolean;
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
      let emailNotice = "";
      if (typeof emailNotification === "object" && emailNotification !== null
        && "sent" in emailNotification && emailNotification.sent === false) {
        const reason = "reason" in emailNotification && typeof emailNotification.reason === "string"
          ? ` ${emailNotification.reason}`
          : "";
        emailNotice = ` Order status was updated, but the customer email could not be sent.${reason}`;
      }
      setNotice({ type: "success", text: `${success}${emailNotice}` });
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
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant operations</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-950">Restaurant Management</h1>
          <p className="mt-1 text-sm text-slate-600">Manage your menu, tables, service orders, kitchen queue, and payments separately from product sales.</p>
        </div>
        {view !== "menu" && view !== "reports" && locations.length > 0 && (
          <label className="text-xs font-semibold text-slate-600">
            Branch
            <select value={locationId} onChange={(event) => setLocationId(event.target.value)} className="ml-2 h-10 min-w-48 rounded-lg border bg-white px-3 text-sm">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
        )}
      </header>

      <nav aria-label="Restaurant sections" className="flex gap-2 overflow-x-auto rounded-xl border bg-white p-2">
        {([
          ["orders", "Orders & Kitchen"],
          ["kitchen", "Kitchen Display"],
          ["menu", "Menu Management"],
          ["tables", "Dining Tables"],
          ["reservations", "Reservations & Waitlist"],
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

      {view === "menu" && <>
        <RestaurantOnlineSettingsPanel
          orgSlug={orgSlug}
          locations={locations}
          settings={onlineSettings}
          canEdit={canEditMenu}
          isPending={isPending}
          onAction={runAction}
        />
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
      {view === "reports" && <RestaurantReports
        currency={currency}
        locations={locations}
        report={reportData}
        from={reportFrom}
        to={reportTo}
        locationId={reportLocationId}
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
        branchScoped={branchScoped}
        canCreate={canCreateIngredients}
        canEdit={canEditIngredients}
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
          <span className="text-xs font-semibold text-slate-700">Order #{order.order_number} · {statusLabels[order.status]}</span>
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
                <p className="text-lg font-bold text-slate-950">Order #{order.order_number}</p>
                <p className="text-xs capitalize text-slate-500">{order.order_type.replace("_", " ")}{table ? ` · Table ${table}` : ""} · {new Date(order.created_at).toLocaleTimeString()}</p>
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
  branchScoped,
  canCreate,
  canEdit,
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
  branchScoped: boolean;
  canCreate: boolean;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [ingredientId, setIngredientId] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [costPerUnit, setCostPerUnit] = useState("");
  const [menuItemId, setMenuItemId] = useState(menuItems[0]?.id ?? "");
  const [recipeLines, setRecipeLines] = useState<Array<{ ingredientId: string; quantity: string }>>([]);
  const selectedMenuItem = menuItems.find((item) => item.id === menuItemId);
  const selectedRecipe = recipes.filter((recipe) => recipe.menu_item_id === menuItemId);
  const recipeCost = selectedRecipe.reduce((sum, line) => {
    const ingredient = ingredients.find((entry) => entry.id === line.ingredient_id);
    return sum + Number(line.quantity) * Number(ingredient?.cost_per_unit ?? 0);
  }, 0);
  const stockAtLocation = stocks.filter((stock) => stock.location_id === locationId);
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

        <section className="space-y-3 rounded-xl border bg-white p-4">
          <div>
            <h3 className="font-bold text-slate-950">Branch stock adjustments</h3>
            <p className="text-xs text-slate-500">Positive changes add stock; negative changes remove stock. Every adjustment is recorded in the movement history.</p>
          </div>
          {ingredients.filter((ingredient) => ingredient.is_active).length === 0
            ? <p className="text-sm text-slate-500">Add and activate ingredients before adjusting stock.</p>
            : <div className="grid gap-3 md:grid-cols-2">
              {ingredients.filter((ingredient) => ingredient.is_active).map((ingredient) => (
                <IngredientStockAdjustmentForm
                  key={ingredient.id}
                  ingredient={ingredient}
                  quantity={Number(stockAtLocation.find((stock) => stock.ingredient_id === ingredient.id)?.quantity ?? 0)}
                  locationId={locationId}
                  canEdit={canEdit}
                  isPending={isPending}
                  onAction={onAction}
                />
              ))}
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
  locationId,
  canEdit,
  isPending,
  onAction,
}: {
  ingredient: RestaurantIngredient;
  quantity: number;
  locationId: string;
  canEdit: boolean;
  isPending: boolean;
  onAction: (work: () => Promise<unknown>, success: string) => Promise<boolean>;
}) {
  const [direction, setDirection] = useState<"add" | "remove">("add");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
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
      <div><p className="text-sm font-semibold">{ingredient.name}</p><p className="text-xs text-slate-500">Available: {quantity.toLocaleString(undefined, { maximumFractionDigits: 3 })} {ingredient.unit}</p></div>
      {canEdit && <label className="text-[10px] font-semibold">Change<select value={direction} onChange={(event) => setDirection(event.target.value as typeof direction)} className="mt-1 block h-8 rounded border px-2 text-xs">
        <option value="add">Add stock</option><option value="remove">Remove stock</option>
      </select></label>}
    </div>
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
  const [orderType, setOrderType] = useState<"dine_in" | "takeaway" | "delivery">("dine_in");
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
                    <option value="dine_in">Dine-in</option><option value="takeaway">Takeaway</option><option value="delivery">Delivery</option>
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
  return <div className="flex gap-2">
    {nextStatus && <button type="button" disabled={isPending || !canAdvance || (nextStatus === "completed" && order.payment_status !== "paid")} onClick={() => onUpdate(nextStatus)} title={!canAdvance ? "Update every order item before advancing this order" : nextStatus === "completed" && order.payment_status !== "paid" ? "Record full payment first" : undefined} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark {statusLabels[nextStatus]}</button>}
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
  const [description, setDescription] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [price, setPrice] = useState("");
  const [prepStation, setPrepStation] = useState<PrepStation>("kitchen");
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
        description,
        price: Number(price),
        prepStation,
        sortOrder: menuItems.find((item) => item.id === itemId)?.sort_order ?? menuItems.length,
        isActive: menuItems.find((item) => item.id === itemId)?.is_active ?? true,
      });
      setItemId(undefined);
      setItemName("");
      setDescription("");
      setItemCategoryId("");
      setPrice("");
      setPrepStation("kitchen");
    }, "Menu item saved.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="space-y-4">
        <div><h2 className="text-lg font-bold text-slate-950">Menu items</h2><p className="text-xs text-slate-500">Menu entries and prices are isolated from the inventory product catalog.</p></div>
        {menuItems.length === 0 ? <EmptyState title="Your menu is empty" message="Add a menu item to use it in restaurant orders." /> : menuItems.map((item) => (
          <article key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${!item.is_active ? "opacity-60" : ""}`}>
            <div><h3 className="font-semibold text-slate-950">{item.name} {!item.is_active && <span className="text-xs text-slate-500">(Unavailable)</span>}</h3><p className="text-xs text-slate-500">{categories.find((category) => category.id === item.category_id)?.name ?? "Uncategorized"} · {money(Number(item.price), currency)} · {prepStationLabels[item.prep_station]}</p>{item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}</div>
            {canEdit && <div className="flex gap-2">
              <button type="button" onClick={() => { setItemId(item.id); setItemName(item.name); setDescription(item.description ?? ""); setItemCategoryId(item.category_id ?? ""); setPrice(String(item.price)); setPrepStation(item.prep_station); }} className="rounded border px-3 py-2 text-xs font-semibold">Edit</button>
              <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantMenuItem({ id: item.id, categoryId: item.category_id, name: item.name, description: item.description ?? "", price: Number(item.price), prepStation: item.prep_station, sortOrder: item.sort_order, isActive: !item.is_active }), item.is_active ? "Menu item marked unavailable." : "Menu item activated.")} className="rounded border px-3 py-2 text-xs font-semibold">{item.is_active ? "Unavailable" : "Activate"}</button>
            </div>}
          </article>
        ))}
        {(canCreate || (itemId && canEdit)) && <form onSubmit={submitItem} className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">{itemId ? "Edit menu item" : "Add menu item"}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Name<input required maxLength={120} value={itemName} onChange={(event) => setItemName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Price<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Category<select value={itemCategoryId} onChange={(event) => setItemCategoryId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="">Uncategorized</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Prep station<select value={prepStation} onChange={(event) => setPrepStation(event.target.value as PrepStation)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="kitchen">Kitchen</option><option value="bar">Bar</option><option value="dessert">Dessert</option></select></label>
            <label className="text-xs font-semibold">Description<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
          </div>
          <div className="mt-3 flex gap-2"><button disabled={isPending} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : itemId ? "Save item" : "Add item"}</button>{itemId && <button type="button" onClick={() => { setItemId(undefined); setItemName(""); setDescription(""); setItemCategoryId(""); setPrice(""); setPrepStation("kitchen"); }} className="rounded-lg border px-4 py-2 text-sm">Cancel edit</button>}</div>
        </form>}
      </section>
      <aside className="space-y-4">
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

function RestaurantReports({ currency, locations, report, from, to, locationId }: {
  currency: string;
  locations: Location[];
  report: RestaurantReport | null;
  from: string;
  to: string;
  locationId: string;
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
