"use client";

import Image from "next/image";
import Link from "next/link";
import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/currency";
import { searchCustomers, type CustomerOption } from "@/app/(dashboard)/pos/actions";
import {
  createRestaurantOrder,
  deleteRestaurantPosDraft,
  saveRestaurantPosDraft,
} from "@/app/(dashboard)/restaurant/actions";
import type { Database } from "@/types/database";

type MenuItem = Database["public"]["Tables"]["restaurant_menu_items"]["Row"];
type MenuCategory = Pick<Database["public"]["Tables"]["restaurant_menu_categories"]["Row"], "id" | "name">;
type ModifierGroup = Database["public"]["Tables"]["restaurant_modifier_groups"]["Row"];
type ModifierOption = Database["public"]["Tables"]["restaurant_modifier_options"]["Row"];
type DiningTable = Database["public"]["Tables"]["restaurant_tables"]["Row"];
type Location = { id: string; name: string };
type PackagedStock = Pick<Database["public"]["Tables"]["restaurant_packaged_item_stock"]["Row"], "location_id" | "menu_item_id" | "quantity">;
type OrderType = "dine_in" | "takeaway" | "delivery";
type PaymentMethod = "cash" | "card" | "mobile_money" | "other";
type SplitPaymentDraft = { method: PaymentMethod; amount: string };
type PosDraftPayload = {
  orderType: OrderType;
  tableId: string | null;
  quantities: Record<string, number>;
  selectedOptions: Record<string, string[]>;
  itemNotes?: Record<string, string>;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  notes: string;
  paymentTiming: "pay_now" | "pay_later";
  paymentMethod: PaymentMethod;
  splitPayments?: SplitPaymentDraft[];
  tipAmountInput: string;
};
type HeldDraft = Pick<Database["public"]["Tables"]["restaurant_pos_drafts"]["Row"], "id" | "location_id" | "draft" | "created_at" | "updated_at">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPosDraftPayload(value: unknown): value is PosDraftPayload {
  if (!isRecord(value)) return false;
  const quantities = value.quantities;
  const selectedOptions = value.selectedOptions;
  if (!isRecord(quantities) || !isRecord(selectedOptions)) return false;
  return (value.orderType === "dine_in" || value.orderType === "takeaway" || value.orderType === "delivery")
    && (value.tableId === null || typeof value.tableId === "string")
    && Object.values(quantities).every((quantity) => typeof quantity === "number" && Number.isInteger(quantity) && quantity > 0)
    && Object.values(selectedOptions).every((optionIds) =>
      Array.isArray(optionIds) && optionIds.every((optionId) => typeof optionId === "string"))
    && (value.itemNotes === undefined
      || (isRecord(value.itemNotes)
        && Object.entries(value.itemNotes).every(([itemId, note]) =>
          Object.prototype.hasOwnProperty.call(quantities, itemId) && typeof note === "string" && note.length <= 500)))
    && typeof value.customerName === "string"
    && typeof value.customerPhone === "string"
    && typeof value.deliveryAddress === "string"
    && typeof value.notes === "string"
    && (value.paymentTiming === "pay_now" || value.paymentTiming === "pay_later")
    && (value.paymentMethod === "cash" || value.paymentMethod === "card" || value.paymentMethod === "mobile_money" || value.paymentMethod === "other")
    && (value.splitPayments === undefined
      || (Array.isArray(value.splitPayments) && value.splitPayments.length >= 2 && value.splitPayments.length <= 4
        && value.splitPayments.every((payment) => isRecord(payment)
          && ["cash", "card", "mobile_money", "other"].includes(String(payment.method))
          && typeof payment.amount === "string"
          && /^\d+(\.\d{1,2})?$/.test(payment.amount))))
    && typeof value.tipAmountInput === "string";
}

function money(amount: number, currency: string) {
  return formatMoney(amount, currency);
}

export default function RestaurantPosView({
  locations,
  categories,
  menuItems,
  packagedStock,
  modifierGroups,
  modifierOptions,
  tables,
  currency,
  heldDrafts: initialHeldDrafts,
}: {
  locations: Location[];
  categories: MenuCategory[];
  menuItems: MenuItem[];
  packagedStock: PackagedStock[];
  modifierGroups: ModifierGroup[];
  modifierOptions: ModifierOption[];
  tables: DiningTable[];
  currency: string;
  heldDrafts: HeldDraft[];
}) {
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [orderType, setOrderType] = useState<OrderType>("takeaway");
  const [paymentTiming, setPaymentTiming] = useState<"pay_now" | "pay_later">("pay_later");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [splitPayments, setSplitPayments] = useState<SplitPaymentDraft[]>([]);
  const [tipAmountInput, setTipAmountInput] = useState("0");
  const [tableId, setTableId] = useState("");
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerOption[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false);
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [categoryId, setCategoryId] = useState("all");
  const [menuQuery, setMenuQuery] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [receiptHref, setReceiptHref] = useState("");
  const [heldDrafts, setHeldDrafts] = useState(initialHeldDrafts);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const pendingRequestRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!customerSearchOpen) return;
    let active = true;
    const timeout = window.setTimeout(() => {
      searchCustomers(customerQuery).then((results) => {
        if (active) setCustomerResults(results);
      }).catch((searchError: unknown) => {
        if (active) setError(searchError instanceof Error ? searchError.message : "Could not search customers.");
      });
    }, 200);
    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [customerQuery, customerSearchOpen]);

  const normalizedMenuQuery = menuQuery.trim().toLocaleLowerCase();
  const visibleItems = menuItems.filter((item) =>
    (categoryId === "all" || item.category_id === categoryId)
      && (!normalizedMenuQuery
        || item.name.toLocaleLowerCase().includes(normalizedMenuQuery)
        || item.sku?.toLocaleLowerCase().includes(normalizedMenuQuery)
        || item.barcode?.toLocaleLowerCase().includes(normalizedMenuQuery)),
  );
  const cartItems = menuItems.filter((item) => (quantities[item.id] ?? 0) > 0);
  const splitPaymentTotal = splitPayments.reduce((sum, payment) => {
    const amount = Number(payment.amount);
    return sum + (Number.isFinite(amount) ? amount : 0);
  }, 0);
  const total = cartItems.reduce((sum, item) => {
    const extras = selectedOptionIds(item.id).reduce((value, optionId) =>
      value + Number(modifierOptions.find((option) => option.id === optionId)?.price_delta ?? 0), 0);
    return sum + (Number(item.price) + extras) * quantities[item.id];
  }, 0);
  const availableTables = tables.filter((table) => table.location_id === locationId);

  function changeQuantity(itemId: string, delta: number) {
    const item = menuItems.find((entry) => entry.id === itemId);
    const currentStock = packagedStock.find((stock) => stock.location_id === locationId && stock.menu_item_id === itemId)?.quantity ?? 0;
    const maximum = item?.item_type === "packaged" ? Math.min(999, currentStock) : 999;
    setQuantities((current) => ({ ...current, [itemId]: Math.max(0, Math.min(maximum, (current[itemId] ?? 0) + delta)) }));
  }

  function removeFromOrder(itemId: string) {
    setQuantities((current) => ({ ...current, [itemId]: 0 }));
    setItemNotes((current) => {
      const next = { ...current };
      delete next[itemId];
      return next;
    });
    setSelectedOptions((current) => Object.fromEntries(
      Object.entries(current).filter(([key]) => !key.startsWith(`${itemId}:`)),
    ));
  }

  function clearOrder() {
    setQuantities({});
    setSelectedOptions({});
    setItemNotes({});
    setSplitPayments([]);
    setActiveDraftId(null);
    setError("");
    setSuccess("");
  }

  function clearOrderForNewSale() {
    setOrderType("takeaway");
    setPaymentTiming("pay_later");
    setPaymentMethod("cash");
    setSplitPayments([]);
    setTipAmountInput("0");
    setTableId("");
    setQuantities({});
    setSelectedOptions({});
    setItemNotes({});
    setCustomerName("");
    setCustomerPhone("");
    setCustomerQuery("");
    setCustomerResults([]);
    setSelectedCustomer(null);
    setCustomerSearchOpen(false);
    setDeliveryAddress("");
    setNotes("");
    setActiveDraftId(null);
  }

  async function holdCurrentOrder() {
    setError("");
    setSuccess("");
    if (!locationId || !cartItems.length) {
      setError("Add menu items before holding an order.");
      return;
    }
    if ((orderType === "dine_in") !== Boolean(tableId)) {
      setError("Select a table for dine-in orders only.");
      return;
    }
    setIsSubmitting(true);
    try {
      const saved = await saveRestaurantPosDraft({
        draftId: activeDraftId,
        locationId,
        draft: {
          orderType,
          tableId: orderType === "dine_in" ? tableId : null,
          quantities: Object.fromEntries(cartItems.map((item) => [item.id, quantities[item.id]])),
          selectedOptions,
          itemNotes,
          customerName,
          customerPhone,
          deliveryAddress,
          notes,
          paymentTiming,
          paymentMethod,
          splitPayments,
          tipAmountInput,
        },
      });
      setHeldDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)].slice(0, 25));
      setSuccess("Order held. No sale, payment, or stock movement was created.");
      clearOrderForNewSale();
    } catch (holdError) {
      setError(holdError instanceof Error ? holdError.message : "Could not hold the restaurant order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function resumeHeldOrder(heldDraft: HeldDraft) {
    if (cartItems.length && !window.confirm("Replace the current order with this held order?")) return;
    if (!isPosDraftPayload(heldDraft.draft)) {
      setError("This held order has invalid or outdated data and cannot be resumed.");
      return;
    }
    const draft = heldDraft.draft;
    const unavailableItem = Object.keys(draft.quantities).find((itemId) => !menuItems.some((item) => item.id === itemId));
    if (unavailableItem) {
      setError("A menu item in this held order is no longer available. Delete this held order or contact a manager.");
      return;
    }
    let resumeWarning = "";
    const restoredOptions: Record<string, string[]> = {};
    for (const [key, optionIds] of Object.entries(draft.selectedOptions)) {
      const groupId = key.slice(key.indexOf(":") + 1);
      if (!modifierGroups.some((group) => group.id === groupId)) {
        resumeWarning = " Some saved modifier choices are no longer available and were removed; review the order before submitting.";
        continue;
      }
      const currentOptions = optionIds.filter((optionId) =>
        modifierOptions.some((option) => option.id === optionId && option.group_id === groupId));
      if (currentOptions.length !== optionIds.length) {
        resumeWarning = " Some saved modifier choices are no longer available and were removed; review the order before submitting.";
      }
      if (currentOptions.length > 0) restoredOptions[key] = currentOptions;
    }
    const restoredTableId = draft.tableId && tables.some((table) =>
      table.id === draft.tableId && table.location_id === heldDraft.location_id)
      ? draft.tableId
      : "";
    if (draft.tableId && !restoredTableId) {
      resumeWarning = " The saved table is no longer available; choose another table before submitting.";
    }
    setLocationId(heldDraft.location_id);
    setOrderType(draft.orderType);
    setPaymentTiming(draft.paymentTiming);
    setPaymentMethod(draft.paymentMethod);
    setSplitPayments(draft.splitPayments ?? []);
    setTipAmountInput(draft.tipAmountInput);
    setTableId(restoredTableId);
    setQuantities(draft.quantities);
    setSelectedOptions(restoredOptions);
    setItemNotes(draft.itemNotes ?? {});
    setCustomerName(draft.customerName);
    setCustomerPhone(draft.customerPhone);
    setDeliveryAddress(draft.deliveryAddress);
    setNotes(draft.notes);
    setActiveDraftId(heldDraft.id);
    pendingRequestRef.current = null;
    setError("");
    setSuccess(`Held order resumed. Review current prices and stock before submitting.${resumeWarning}`);
  }

  async function removeHeldOrder(draftId: string) {
    setError("");
    setIsSubmitting(true);
    try {
      await deleteRestaurantPosDraft(draftId);
      setHeldDrafts((current) => current.filter((draft) => draft.id !== draftId));
      if (activeDraftId === draftId) setActiveDraftId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the held order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function toggleOption(group: ModifierGroup, itemId: string, optionId: string) {
    const key = `${itemId}:${group.id}`;
    setSelectedOptions((current) => {
      const selected = current[key] ?? [];
      const next = selected.includes(optionId)
        ? selected.filter((id) => id !== optionId)
        : selected.length < group.max_selections ? [...selected, optionId] : selected;
      return { ...current, [key]: next };
    });
  }

  function selectedOptionIds(itemId: string) {
    return modifierGroups
      .filter((group) => group.menu_item_id === itemId)
      .flatMap((group) => selectedOptions[`${itemId}:${group.id}`] ?? []);
  }

  async function submitOrder() {
    setError("");
    setSuccess("");
    if (!locationId || !cartItems.length) {
      setError("Choose a branch and add menu items.");
      return;
    }
    if (orderType === "dine_in" && !tableId) {
      setError("Choose a dining table.");
      return;
    }
    if (orderType === "delivery" && !deliveryAddress.trim()) {
      setError("Enter the delivery address.");
      return;
    }
    const tipAmount = Number(tipAmountInput);
    if (paymentTiming === "pay_now"
      && (!/^\d+(\.\d{1,2})?$/.test(tipAmountInput) || !Number.isFinite(tipAmount) || tipAmount < 0)) {
      setError("Enter a valid tip amount with no more than two decimal places.");
      return;
    }
    const splitPaymentAmounts = splitPayments.map((payment) => Number(payment.amount));
    if (paymentTiming === "pay_now" && splitPayments.length > 0) {
      if (splitPayments.length < 2 || splitPayments.length > 4
        || splitPayments.some((payment, index) =>
          !["cash", "card", "mobile_money", "other"].includes(payment.method)
          || !/^\d+(\.\d{1,2})?$/.test(payment.amount)
          || !Number.isFinite(splitPaymentAmounts[index])
          || splitPaymentAmounts[index] < 0)
        || new Set(splitPayments.map((payment) => payment.method)).size !== splitPayments.length) {
        setError("Enter two to four valid split payments with different payment methods.");
        return;
      }
      const splitTotalCents = splitPaymentAmounts.reduce((sum, amount) => sum + Math.round(amount * 100), 0);
      if (splitTotalCents !== Math.round(total * 100)) {
        setError(`Split payments must add up to the order total of ${money(total, currency)}.`);
        return;
      }
    }
    for (const item of cartItems) {
      for (const group of modifierGroups.filter((entry) => entry.menu_item_id === item.id)) {
        const selected = selectedOptions[`${item.id}:${group.id}`] ?? [];
        if (selected.length < group.min_selections || selected.length > group.max_selections) {
          setError(`${item.name}: choose ${group.min_selections}–${group.max_selections} option(s) for ${group.name}.`);
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      const orderInput = {
        locationId,
        orderType,
        tableId: orderType === "dine_in" ? tableId : null,
        customerName,
        customerPhone,
        deliveryAddress,
        notes,
        items: cartItems.map((item) => ({
          menuItemId: item.id,
          quantity: quantities[item.id],
          notes: itemNotes[item.id] ?? "",
          modifierOptionIds: modifierGroups
            .filter((group) => group.menu_item_id === item.id)
            .flatMap((group) => selectedOptions[`${item.id}:${group.id}`] ?? []),
        })),
      };
      const fingerprint = JSON.stringify({ ...orderInput, paymentMethod, splitPayments, tipAmount });
      let payment: {
        requestKey: string;
        method: PaymentMethod;
        tipAmount: number;
        payments?: Array<{ method: PaymentMethod; amount: number }>;
      } | undefined;
      if (paymentTiming === "pay_now") {
        if (!pendingRequestRef.current || pendingRequestRef.current.fingerprint !== fingerprint) {
          pendingRequestRef.current = { fingerprint, key: crypto.randomUUID() };
        }
        payment = {
          requestKey: pendingRequestRef.current.key,
          method: paymentMethod,
          tipAmount,
          ...(splitPayments.length > 0
            ? { payments: splitPayments.map((splitPayment) => ({ method: splitPayment.method, amount: Number(splitPayment.amount) })) }
            : {}),
        };
      }
      const result = await createRestaurantOrder({ ...orderInput, payment });
      let heldDraftWarning = "";
      if (activeDraftId) {
        try {
          await deleteRestaurantPosDraft(activeDraftId);
          setHeldDrafts((current) => current.filter((draft) => draft.id !== activeDraftId));
        } catch (draftCleanupError) {
          const reason = draftCleanupError instanceof Error ? ` (${draftCleanupError.message})` : "";
          heldDraftWarning = ` The order was created, but its held draft could not be removed${reason}; delete that draft to avoid creating it again.`;
        }
      }
      if (payment && result.billId) {
        setSuccess(`Order #${result.orderNumber} created and paid.${heldDraftWarning}`);
        setReceiptHref(`/restaurant/receipt?orderId=${encodeURIComponent(result.orderId)}&billId=${encodeURIComponent(result.billId)}`);
      } else {
        setSuccess(`Order #${result.orderNumber} created. Complete payment from Restaurant Orders.${heldDraftWarning}`);
        setReceiptHref("");
      }
      pendingRequestRef.current = null;
      setActiveDraftId(null);
      setQuantities({});
      setSelectedOptions({});
      setItemNotes({});
      setSplitPayments([]);
      setTableId("");
      setCustomerName("");
      setCustomerPhone("");
      setCustomerQuery("");
      setCustomerResults([]);
      setSelectedCustomer(null);
      setCustomerSearchOpen(false);
      setDeliveryAddress("");
      setNotes("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Could not create the restaurant order.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return <main className="restaurant-management-page mx-auto w-full min-w-0 max-w-[1600px] space-y-4 overflow-x-clip">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">Restaurant</p>
        <h1 className="text-2xl font-bold text-slate-950">Point of Sale</h1>
      </div>
      <Link href="/restaurant" className="rounded-lg border px-4 py-2 text-sm font-semibold">Restaurant management</Link>
    </header>
    {heldDrafts.length > 0 && <section aria-label="Held POS orders" className="space-y-2 rounded-xl border bg-white p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-slate-900">Held orders</h2>
        <span className="text-xs text-slate-500">Saved for your account · no sale or stock movement yet</span>
      </div>
      <ul className="divide-y">
        {heldDrafts.map((draft) => {
          const draftData = isPosDraftPayload(draft.draft) ? draft.draft : null;
          const itemCount = draftData
            ? Object.values(draftData.quantities).reduce((sum, quantity) => sum + quantity, 0)
            : 0;
          return <li key={draft.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">
                {locations.find((location) => location.id === draft.location_id)?.name ?? "Branch"} · {itemCount} item{itemCount === 1 ? "" : "s"}
              </p>
              <p className="text-xs text-slate-500">Saved {new Date(draft.updated_at).toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" disabled={isSubmitting || !draftData} onClick={() => resumeHeldOrder(draft)} className="rounded-lg border px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
                Resume
              </button>
              <button type="button" disabled={isSubmitting} onClick={() => void removeHeldOrder(draft.id)} aria-label="Delete held order" title="Delete held order" className="flex h-9 w-9 items-center justify-center rounded-lg border text-slate-600 disabled:opacity-50">
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </li>;
        })}
      </ul>
    </section>}
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <section className="min-w-0 space-y-4">
        <div className="flex flex-wrap gap-3 rounded-xl border bg-white p-3">
          <label className="min-w-48 flex-1 text-xs font-semibold text-slate-600">Branch
            <select value={locationId} onChange={(event) => {
              if (cartItems.length) {
                setError("Hold or clear the current order before changing branches.");
                return;
              }
              setLocationId(event.target.value);
              setTableId("");
              setError("");
            }} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              {locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
            </select>
          </label>
          <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Order type
            <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              <option value="takeaway">Takeaway</option><option value="dine_in">Dine-in</option><option value="delivery">Delivery</option>
            </select>
          </label>
          {orderType === "dine_in" && <label className="min-w-40 flex-1 text-xs font-semibold text-slate-600">Dining table
            <select value={tableId} onChange={(event) => setTableId(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm">
              <option value="">Select a table</option>
              {availableTables.map((table) => <option key={table.id} value={table.id}>{table.table_name} · {table.seats} seats</option>)}
            </select>
          </label>}
        </div>
        <label className="block text-xs font-semibold text-slate-600">
          Search menu
          <input
            type="search"
            value={menuQuery}
            onChange={(event) => setMenuQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              const scannedSku = event.currentTarget.value.trim().toLocaleLowerCase();
              if (!scannedSku) return;
              const scannedItem = menuItems.find((item) =>
                item.sku?.trim().toLocaleLowerCase() === scannedSku
                || item.barcode?.trim().toLocaleLowerCase() === scannedSku);
              if (!scannedItem) {
                setError(`No menu item matches SKU or barcode "${event.currentTarget.value.trim()}".`);
                return;
              }
              const currentQuantity = quantities[scannedItem.id] ?? 0;
              const availableQuantity = packagedStock.find(
                (stock) => stock.location_id === locationId && stock.menu_item_id === scannedItem.id,
              )?.quantity ?? 0;
              if (scannedItem.item_type === "packaged" && currentQuantity >= availableQuantity) {
                setError(availableQuantity > 0
                  ? `Only ${availableQuantity} ${scannedItem.name} available at this branch.`
                  : `${scannedItem.name} is out of stock at this branch.`);
                return;
              }
              setCategoryId("all");
              setError("");
              changeQuantity(scannedItem.id, 1);
              setMenuQuery("");
            }}
            placeholder="Search or scan item SKU"
            aria-label="Search menu or scan an item SKU"
            className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
          />
        </label>
        <nav aria-label="Menu categories" className="flex gap-2 overflow-x-auto">
          <button type="button" onClick={() => setCategoryId("all")} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${categoryId === "all" ? "bg-orange-600 text-white" : "border"}`}>All items</button>
          {categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`rounded-full px-3 py-1.5 text-xs font-semibold ${categoryId === category.id ? "bg-orange-600 text-white" : "border"}`}>{category.name}</button>)}
        </nav>
        {locations.length === 0 && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">There are no branches available to your account.</p>}
        {menuItems.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">Add active menu items before taking restaurant orders.</p>}
        {menuItems.length > 0 && visibleItems.length === 0 && <p className="rounded-xl border bg-white p-4 text-sm text-slate-600">No menu items match this search and category.</p>}
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {visibleItems.map((item) => {
            const quantity = quantities[item.id] ?? 0;
            const groups = modifierGroups.filter((group) => group.menu_item_id === item.id);
            const packagedQuantity = packagedStock.find((stock) => stock.location_id === locationId && stock.menu_item_id === item.id)?.quantity ?? 0;
            const outOfStock = item.item_type === "packaged" && packagedQuantity <= 0;
            return <article key={item.id} className="group flex min-w-0 flex-col items-center overflow-hidden rounded-md bg-gradient-to-br from-white via-white to-slate-50 p-2.5 text-center shadow-[inset_1px_1px_0_rgba(255,255,255,0.95),inset_-1px_-1px_0_rgba(148,163,184,0.1),0_2px_4px_rgba(15,23,42,0.06),0_8px_18px_rgba(15,23,42,0.08)] transition-all duration-200 hover:-translate-y-0.5">
              <div className="relative mb-2 h-28 w-full overflow-hidden rounded-md bg-gradient-to-br from-white to-slate-100 p-1.5 shadow-inner">
                {item.image_url ? <Image src={item.image_url} alt={item.name} fill unoptimized sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw" className="object-contain transition-transform duration-200 group-hover:scale-[1.025]" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">No image</div>}
              </div>
              <div className="flex w-full flex-1 flex-col">
                <div className="w-full min-w-0 rounded-md px-1.5 pb-1 pt-0.5">
                  <h2 className="line-clamp-2 break-words text-[11px] font-semibold leading-tight text-slate-950">{item.name}</h2>
                  {item.description && <p className="mt-1 line-clamp-2 text-[10px] leading-tight text-slate-500">{item.description}</p>}
                  <div className="mt-1 flex w-full items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-orange-700 sm:text-sm">{money(Number(item.price), currency)}</span>
                    {item.item_type === "packaged" && <span className={`shrink-0 text-[10px] font-semibold ${outOfStock ? "text-red-700" : "text-slate-500"}`}>{outOfStock ? "Out" : `(${packagedQuantity})`}</span>}
                  </div>
                </div>
                {quantity === 0
                  ? <button type="button" disabled={outOfStock} onClick={() => changeQuantity(item.id, 1)} style={{ backgroundColor: outOfStock ? "#94a3b8" : "var(--theme-primary)" }} className="mt-1 w-full rounded-md px-2 py-2 text-xs font-semibold text-white transition hover:brightness-105 disabled:cursor-not-allowed">{outOfStock ? "Unavailable" : "Add to order"}</button>
                  : <div className="mt-1 flex w-full items-center justify-between rounded-md bg-slate-50 p-1">
                    <button type="button" aria-label={`Remove one ${item.name}`} onClick={() => changeQuantity(item.id, -1)} className="h-8 w-9 rounded-md border bg-white text-lg">−</button>
                    <span className="text-sm font-bold">{quantity}</span>
                    <button type="button" aria-label={`Add one ${item.name}`} disabled={item.item_type === "packaged" && quantity >= packagedQuantity} onClick={() => changeQuantity(item.id, 1)} className="h-8 w-9 rounded-md border bg-white text-lg disabled:opacity-40">+</button>
                  </div>}
                {quantity > 0 && groups.map((group) => {
                  const key = `${item.id}:${group.id}`;
                  const selected = selectedOptions[key] ?? [];
                  return <fieldset key={group.id} className="border-t pt-2">
                    <legend className="text-xs font-semibold">{group.name} ({group.min_selections}–{group.max_selections})</legend>
                    {modifierOptions.filter((option) => option.group_id === group.id).map((option) => <label key={option.id} className="flex items-center gap-2 py-1 text-xs">
                      <input type="checkbox" checked={selected.includes(option.id)} disabled={!selected.includes(option.id) && selected.length >= group.max_selections} onChange={() => toggleOption(group, item.id, option.id)} />
                      <span className="flex-1">{option.name}</span><span>{Number(option.price_delta) ? `+${money(Number(option.price_delta), currency)}` : "Included"}</span>
                    </label>)}
                  </fieldset>;
                })}
              </div>
            </article>;
          })}
        </div>
      </section>
      <aside className="h-fit min-w-0 space-y-3 rounded-xl border bg-white p-4 xl:sticky xl:top-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-slate-950">Current order</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{cartItems.reduce((sum, item) => sum + quantities[item.id], 0)} items</span>
            {cartItems.length > 0 && <button type="button" onClick={clearOrder} disabled={isSubmitting} aria-label="Clear current order" title="Clear current order" className="flex h-8 w-8 items-center justify-center rounded-full border text-slate-600 disabled:opacity-50"><X aria-hidden="true" className="h-4 w-4" /></button>}
          </div>
        </div>
        {cartItems.length === 0 ? <p className="py-4 text-sm text-slate-500">Choose menu items to start an order.</p> : <ul className="divide-y">
          {cartItems.map((item) => <li key={item.id} className="py-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 flex-1 break-words">{quantities[item.id]} × {item.name}</span>
              <strong className="shrink-0">{money((Number(item.price) + selectedOptionIds(item.id).reduce((sum, id) => sum + Number(modifierOptions.find((option) => option.id === id)?.price_delta ?? 0), 0)) * quantities[item.id], currency)}</strong>
              <button type="button" onClick={() => removeFromOrder(item.id)} disabled={isSubmitting} aria-label={`Remove ${item.name} from order`} title={`Remove ${item.name}`} className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-slate-600 disabled:opacity-50"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
            </div>
            <label className="mt-1 block text-xs text-slate-500">
              Special instructions
              <input
                value={itemNotes[item.id] ?? ""}
                onChange={(event) => setItemNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                maxLength={500}
                disabled={isSubmitting}
                placeholder="e.g. no onions"
                className="mt-1 h-9 w-full rounded-lg border px-3 text-xs text-slate-700"
              />
            </label>
          </li>)}
        </ul>}
        <div className="relative">
          <label className="block text-xs font-semibold text-slate-600">Find existing customer
            <input
              value={customerQuery}
              onFocus={() => setCustomerSearchOpen(true)}
              onChange={(event) => {
                setCustomerQuery(event.target.value);
                setSelectedCustomer(null);
                setCustomerSearchOpen(true);
              }}
              placeholder="Search name, phone, or email"
              autoComplete="off"
              className="mt-1 h-10 w-full rounded-lg border px-3 text-sm"
            />
          </label>
          {customerSearchOpen && !selectedCustomer && customerResults.length > 0 && <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-48 overflow-auto rounded-lg border bg-white shadow-lg" aria-label="Customer search results">
            {customerResults.map((customer) => <li key={customer.id}>
              <button type="button" onClick={() => {
                setSelectedCustomer(customer);
                setCustomerName(customer.name);
                setCustomerPhone(customer.phone ?? "");
                setCustomerQuery("");
                setCustomerResults([]);
                setCustomerSearchOpen(false);
              }} className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="block font-semibold text-slate-800">{customer.name}</span>
                <span className="block text-xs text-slate-500">{[customer.phone, customer.email].filter(Boolean).join(" · ") || "No contact details"}</span>
              </button>
            </li>)}
          </ul>}
          {selectedCustomer && <p className="mt-1 text-xs text-emerald-700">Selected: {selectedCustomer.name} · <button type="button" onClick={() => {
            setSelectedCustomer(null);
            setCustomerName("");
            setCustomerPhone("");
            setCustomerSearchOpen(true);
          }} className="font-semibold underline">Change</button></p>}
          {customerSearchOpen && customerQuery.trim().length > 0 && customerResults.length === 0 && <p className="mt-1 text-xs text-slate-500">No matching customers found. You can enter the customer details below.</p>}
        </div>
        <label className="block text-xs font-semibold text-slate-600">Customer name (optional)<input value={customerName} onChange={(event) => {
          setCustomerName(event.target.value);
          setSelectedCustomer(null);
        }} maxLength={120} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <label className="block text-xs font-semibold text-slate-600">Phone (optional)<input value={customerPhone} onChange={(event) => {
          setCustomerPhone(event.target.value);
          setSelectedCustomer(null);
        }} maxLength={40} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        {orderType === "delivery" && <label className="block text-xs font-semibold text-slate-600">Delivery address<input required value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} maxLength={300} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>}
        <label className="block text-xs font-semibold text-slate-600">Order notes<input value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={500} className="mt-1 h-10 w-full rounded-lg border px-3 text-sm" /></label>
        <p className="flex justify-between border-t pt-3 font-bold"><span>Total</span><span>{money(total, currency)}</span></p>
        <fieldset className="space-y-2 rounded-lg border p-3">
          <legend className="px-1 text-xs font-semibold text-slate-600">Payment</legend>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="paymentTiming" value="pay_later" checked={paymentTiming === "pay_later"} onChange={() => setPaymentTiming("pay_later")} />
            <span>Pay later</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" name="paymentTiming" value="pay_now" checked={paymentTiming === "pay_now"} onChange={() => setPaymentTiming("pay_now")} />
            <span>Pay now</span>
          </label>
          {paymentTiming === "pay_now" && <div className="grid grid-cols-2 gap-2 pt-1">
            <label className="col-span-2 flex items-center gap-2 text-xs font-medium text-slate-600">
              <input type="checkbox" checked={splitPayments.length > 0} onChange={(event) => {
                if (event.target.checked) {
                  setSplitPayments([
                    { method: paymentMethod, amount: total.toFixed(2) },
                    { method: paymentMethod === "cash" ? "card" : "cash", amount: "0" },
                  ]);
                } else {
                  setSplitPayments([]);
                }
              }} />
              Split payment across methods
            </label>
            {splitPayments.length > 0 ? <div className="col-span-2 space-y-2">
              <p className="text-xs text-slate-500">Allocate the full order total across two to four payment methods.</p>
              {splitPayments.map((splitPayment, index) => <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <label className="text-xs font-semibold text-slate-600">Method
                  <select value={splitPayment.method} onChange={(event) => setSplitPayments((current) => current.map((paymentEntry, entryIndex) =>
                    entryIndex === index ? { ...paymentEntry, method: event.target.value as PaymentMethod } : paymentEntry))}
                    className="mt-1 h-10 w-full rounded-lg border px-2 text-sm">
                    <option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">Amount
                  <input type="number" min="0" step="0.01" value={splitPayment.amount} onChange={(event) => setSplitPayments((current) => current.map((paymentEntry, entryIndex) =>
                    entryIndex === index ? { ...paymentEntry, amount: event.target.value } : paymentEntry))}
                    className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" />
                </label>
                <button type="button" disabled={splitPayments.length <= 2} onClick={() => setSplitPayments((current) => current.filter((_, entryIndex) => entryIndex !== index))}
                  aria-label={`Remove split payment ${index + 1}`} className="h-10 rounded-lg border px-3 text-sm text-slate-600 disabled:opacity-40">×</button>
              </div>)}
              {splitPayments.length < 4 && <button type="button" onClick={() => setSplitPayments((current) => [...current, {
                method: (["cash", "card", "mobile_money", "other"] as const).find((method) => !current.some((entry) => entry.method === method)) ?? "other",
                amount: "0",
              }])} className="rounded-lg border px-3 py-2 text-xs font-semibold">Add payment method</button>}
              <p className="text-xs font-semibold text-slate-600">Allocated: {money(splitPaymentTotal, currency)} / {money(total, currency)}</p>
            </div> : <>
            <label className="text-xs font-semibold text-slate-600">Payment method
              <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm">
                <option value="cash">Cash</option><option value="card">Card</option><option value="mobile_money">Mobile money</option><option value="other">Other</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-slate-600">Tip (optional)
              <input type="number" min="0" step="0.01" value={tipAmountInput} onChange={(event) => setTipAmountInput(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" />
            </label>
            </>}
            {splitPayments.length > 0 && <label className="col-span-2 text-xs font-semibold text-slate-600">Tip (optional)
              <input type="number" min="0" step="0.01" value={tipAmountInput} onChange={(event) => setTipAmountInput(event.target.value)} className="mt-1 h-10 w-full rounded-lg border px-2 text-sm" />
            </label>}
          </div>}
        </fieldset>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-2 text-xs text-red-800">{error}</p>}
        {success && <div role="status" className="space-y-2 rounded-lg bg-emerald-50 p-2 text-xs text-emerald-800">
          <p>{success}</p>
          {receiptHref && <Link href={receiptHref} target="_blank" rel="noreferrer" className="inline-flex rounded border border-emerald-700 px-3 py-2 font-semibold">Print receipt</Link>}
        </div>}
        <button type="button" disabled={isSubmitting || !cartItems.length} onClick={() => void submitOrder()} className="w-full rounded-lg bg-orange-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-50">{isSubmitting ? "Processing order..." : paymentTiming === "pay_now" ? "Create order & pay" : "Create order (pay later)"}</button>
        <button type="button" disabled={isSubmitting || !cartItems.length} onClick={() => void holdCurrentOrder()} className="w-full rounded-lg border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 disabled:opacity-50">
          {activeDraftId ? "Update held order" : "Hold order"}
        </button>
      </aside>
    </div>
  </main>;
}
