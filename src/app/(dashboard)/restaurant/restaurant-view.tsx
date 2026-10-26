"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Database } from "@/types/database";
import {
  createRestaurantOrder,
  recordRestaurantPayment,
  saveRestaurantCategory,
  saveRestaurantMenuItem,
  saveRestaurantTable,
  updateRestaurantKitchenStatus,
  updateRestaurantOrderStatus,
} from "./actions";

type Category = Database["public"]["Tables"]["restaurant_menu_categories"]["Row"];
type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type DiningTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type RestaurantOrder = Database["public"]["Tables"]["restaurant_orders"]["Row"];
type OrderItem = Database["public"]["Tables"]["restaurant_order_items"]["Row"];
type OrderPayment = Database["public"]["Tables"]["restaurant_order_payments"]["Row"];
type Location = { id: string; name: string };
type ViewKey = "orders" | "menu" | "tables";

const statusLabels: Record<RestaurantOrder["status"], string> = {
  new: "New",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready",
  served: "Served",
  completed: "Completed",
  cancelled: "Cancelled",
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

export default function RestaurantView({
  view,
  currency,
  branchScoped,
  canCreateOrders,
  canEditOrders,
  canCreateMenu,
  canEditMenu,
  canCreateTables,
  canEditTables,
  locations,
  categories,
  menuItems,
  tables,
  orders,
  orderItems,
  payments,
}: {
  view: ViewKey;
  currency: string;
  branchScoped: boolean;
  canCreateOrders: boolean;
  canEditOrders: boolean;
  canCreateMenu: boolean;
  canEditMenu: boolean;
  canCreateTables: boolean;
  canEditTables: boolean;
  locations: Location[];
  categories: Category[];
  menuItems: MenuItem[];
  tables: DiningTable[];
  orders: RestaurantOrder[];
  orderItems: OrderItem[];
  payments: OrderPayment[];
}) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const [notice, setNotice] = useState<{ type: "error" | "success"; text: string } | null>(null);
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");

  async function runAction(work: () => Promise<unknown>, success: string): Promise<boolean> {
    setNotice(null);
    setIsPending(true);
    try {
      await work();
      setNotice({ type: "success", text: success });
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
  payments.forEach((payment) => paymentsByOrder.set(payment.order_id, (paymentsByOrder.get(payment.order_id) ?? 0) + Number(payment.amount)));
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
        {view !== "menu" && locations.length > 0 && (
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
          ["menu", "Menu Management"],
          ["tables", "Dining Tables"],
        ] as const).map(([key, label]) => (
          <Link key={key} href={key === "orders" ? "/restaurant" : `/restaurant?view=${key}`} className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold ${view === key ? "bg-orange-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {notice && <p role="status" className={`rounded-lg border p-3 text-sm ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"}`}>{notice.text}</p>}

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
                        <span className="min-w-0 flex-1">{item.quantity} × {item.item_name}{item.notes && <span className="block text-xs text-slate-500">{item.notes}</span>}</span>
                        <span className="text-xs text-slate-500">{kitchenStatusLabels[item.kitchen_status]}</span>
                        {canEditOrders && nextStatus && !["completed", "cancelled"].includes(order.status) && <button type="button" disabled={isPending} onClick={() => runAction(() => updateRestaurantKitchenStatus(item.id, nextStatus), "Kitchen item updated.")} className="rounded border bg-white px-2 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">Mark {kitchenStatusLabels[nextStatus]}</button>}
                        <strong className="w-24 text-right">{money(Number(item.line_total), currency)}</strong>
                      </li>;
                    })}
                  </ul>
                  {order.notes && <p className="mt-2 text-xs text-slate-500">Order note: {order.notes}</p>}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                    <span className="text-xs text-slate-500">Payment: {order.payment_status} · Received {money(paid, currency)}</span>
                    <div className="flex flex-wrap gap-2">
                      {canCreateOrders && balance > 0 && order.status !== "cancelled" && <PaymentForm balance={balance} isPending={isPending} onSubmit={(amount, method) => runAction(() => recordRestaurantPayment({ orderId: order.id, amount, method }), "Payment recorded.")} />}
                      {canEditOrders && order.status !== "completed" && order.status !== "cancelled" && (
                        <OrderStatusControls order={order} isPending={isPending} onUpdate={(status) => runAction(() => updateRestaurantOrderStatus(order.id, status), `Order marked ${statusLabels[status]}.`)} />
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </section>
        </section>
      )}

      {view === "menu" && <MenuManagement currency={currency} categories={categories} menuItems={menuItems} canCreate={canCreateMenu} canEdit={canEditMenu} isPending={isPending} onAction={runAction} />}
      {view === "tables" && <TableManagement locations={locations} tables={tables} orders={orders} selectedLocationId={locationId} branchScoped={branchScoped} canCreate={canCreateTables} canEdit={canEditTables} isPending={isPending} onAction={runAction} />}
    </div>
  );
}

function CreateOrderForm({
  currency,
  locationId,
  hasLocations,
  menuItems,
  tables,
  isPending,
  onCreate,
}: {
  currency: string;
  locationId: string;
  hasLocations: boolean;
  menuItems: MenuItem[];
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

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const items = menuItems.map((item) => ({
      menuItemId: item.id,
      quantity: Number(quantities[item.id] ?? 0),
      notes: "",
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
  }

  const estimate = menuItems.reduce((sum, item) => sum + item.price * Number(quantities[item.id] ?? 0), 0);
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
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {menuItems.map((item) => <label key={item.id} className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm">
                  <span className="min-w-0"><span className="block truncate font-semibold">{item.name}</span><span className="text-xs text-slate-500">{money(Number(item.price), currency)}</span></span>
                  <input aria-label={`Quantity for ${item.name}`} type="number" min="0" max="999" step="1" value={quantities[item.id] ?? ""} onChange={(event) => setQuantities((current) => ({ ...current, [item.id]: event.target.value }))} className="h-9 w-20 rounded border px-2" />
                </label>)}
              </div>
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

function PaymentForm({ balance, isPending, onSubmit }: { balance: number; isPending: boolean; onSubmit: (amount: number, method: "cash" | "card" | "mobile_money" | "other") => void }) {
  const [amount, setAmount] = useState(balance.toFixed(2));
  const [method, setMethod] = useState<"cash" | "card" | "mobile_money" | "other">("cash");
  return <form onSubmit={(event) => { event.preventDefault(); onSubmit(Number(amount), method); }} className="flex flex-wrap gap-2">
    <input aria-label="Payment amount" type="number" min="0.01" max={balance} step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} className="h-9 w-28 rounded border px-2 text-xs" />
    <select aria-label="Payment method" value={method} onChange={(event) => setMethod(event.target.value as typeof method)} className="h-9 rounded border px-2 text-xs">
      <option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
    </select>
    <button disabled={isPending || Number(amount) <= 0 || Number(amount) > balance} className="h-9 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50">Record payment</button>
  </form>;
}

function OrderStatusControls({ order, isPending, onUpdate }: { order: RestaurantOrder; isPending: boolean; onUpdate: (status: RestaurantOrder["status"]) => void }) {
  const next: Partial<Record<RestaurantOrder["status"], RestaurantOrder["status"]>> = {
    new: "confirmed",
    confirmed: "preparing",
    preparing: "ready",
    ready: order.order_type === "dine_in" ? "served" : "completed",
    served: "completed",
  };
  const nextStatus = next[order.status];
  return <div className="flex gap-2">
    {nextStatus && <button type="button" disabled={isPending || (nextStatus === "completed" && order.payment_status !== "paid")} onClick={() => onUpdate(nextStatus)} title={nextStatus === "completed" && order.payment_status !== "paid" ? "Record full payment first" : undefined} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">Mark {statusLabels[nextStatus]}</button>}
    {order.status !== "cancelled" && order.status !== "completed" && <button type="button" disabled={isPending} onClick={() => onUpdate("cancelled")} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50">Cancel</button>}
  </div>;
}

function MenuManagement({ currency, categories, menuItems, canCreate, canEdit, isPending, onAction }: {
  currency: string;
  categories: Category[];
  menuItems: MenuItem[];
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
        sortOrder: menuItems.find((item) => item.id === itemId)?.sort_order ?? menuItems.length,
        isActive: menuItems.find((item) => item.id === itemId)?.is_active ?? true,
      });
      setItemId(undefined);
      setItemName("");
      setDescription("");
      setItemCategoryId("");
      setPrice("");
    }, "Menu item saved.");
  }

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(300px,0.75fr)]">
      <section className="space-y-4">
        <div><h2 className="text-lg font-bold text-slate-950">Menu items</h2><p className="text-xs text-slate-500">Menu entries and prices are isolated from the inventory product catalog.</p></div>
        {menuItems.length === 0 ? <EmptyState title="Your menu is empty" message="Add a menu item to use it in restaurant orders." /> : menuItems.map((item) => (
          <article key={item.id} className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 ${!item.is_active ? "opacity-60" : ""}`}>
            <div><h3 className="font-semibold text-slate-950">{item.name} {!item.is_active && <span className="text-xs text-slate-500">(Unavailable)</span>}</h3><p className="text-xs text-slate-500">{categories.find((category) => category.id === item.category_id)?.name ?? "Uncategorized"} · {money(Number(item.price), currency)}</p>{item.description && <p className="mt-1 text-xs text-slate-600">{item.description}</p>}</div>
            {canEdit && <div className="flex gap-2">
              <button type="button" onClick={() => { setItemId(item.id); setItemName(item.name); setDescription(item.description ?? ""); setItemCategoryId(item.category_id ?? ""); setPrice(String(item.price)); }} className="rounded border px-3 py-2 text-xs font-semibold">Edit</button>
              <button type="button" disabled={isPending} onClick={() => onAction(() => saveRestaurantMenuItem({ id: item.id, categoryId: item.category_id, name: item.name, description: item.description ?? "", price: Number(item.price), sortOrder: item.sort_order, isActive: !item.is_active }), item.is_active ? "Menu item marked unavailable." : "Menu item activated.")} className="rounded border px-3 py-2 text-xs font-semibold">{item.is_active ? "Unavailable" : "Activate"}</button>
            </div>}
          </article>
        ))}
        {(canCreate || (itemId && canEdit)) && <form onSubmit={submitItem} className="rounded-xl border bg-white p-4">
          <h3 className="font-bold text-slate-950">{itemId ? "Edit menu item" : "Add menu item"}</h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Name<input required maxLength={120} value={itemName} onChange={(event) => setItemName(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Price<input required type="number" min="0" step="0.01" value={price} onChange={(event) => setPrice(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
            <label className="text-xs font-semibold">Category<select value={itemCategoryId} onChange={(event) => setItemCategoryId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"><option value="">Uncategorized</option>{categories.filter((category) => category.is_active).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Description<input maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
          </div>
          <div className="mt-3 flex gap-2"><button disabled={isPending} className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{isPending ? "Saving..." : itemId ? "Save item" : "Add item"}</button>{itemId && <button type="button" onClick={() => { setItemId(undefined); setItemName(""); setDescription(""); setItemCategoryId(""); setPrice(""); }} className="rounded-lg border px-4 py-2 text-sm">Cancel edit</button>}</div>
        </form>}
      </section>
      <aside className="space-y-4">
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
