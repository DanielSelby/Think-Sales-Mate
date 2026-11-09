import { NextResponse } from "next/server";
import { recordSale } from "@/app/(dashboard)/sales/actions";
import { createRestaurantOfflineOrder } from "@/app/(dashboard)/restaurant/actions";
import { getCurrentOrgContext } from "@/lib/organizations/current";

export async function POST(request: Request) {
  let operation: { id?: string; type?: string; payload?: unknown };
  try {
    operation = await request.json() as typeof operation;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid offline operation body." }, { status: 400 });
  }
  if (
    (operation.type !== "sale" && operation.type !== "restaurant_order")
    || !operation.payload
    || typeof operation.payload !== "object"
    || !operation.id
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operation.id)
  ) {
    return NextResponse.json({ ok: false, error: "Unsupported offline operation." }, { status: 400 });
  }

  const payload = operation.payload as Record<string, unknown>;
  const context = await getCurrentOrgContext();
  if (!context) {
    return NextResponse.json({ ok: false, error: "No active organization found for sync." }, { status: 400 });
  }
  if (payload.orgId && payload.orgId !== context.orgId) {
    return NextResponse.json({ ok: false, error: "The queued transaction belongs to a different organization." }, { status: 403 });
  }

  if (operation.type === "restaurant_order") {
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const orderType = payload.orderType;
    const total = Number(payload.expectedTotal);
    if (
      typeof payload.locationId !== "string"
      || (orderType !== "dine_in" && orderType !== "takeaway" && orderType !== "pickup" && orderType !== "delivery")
      || !Number.isFinite(total)
      || total < 0
      || (payload.customerId !== null && typeof payload.customerId !== "string")
      || !rawItems.length
      || rawItems.some((line) => {
        if (!line || typeof line !== "object" || Array.isArray(line)) return true;
        const item = line as Record<string, unknown>;
        return typeof item.menuItemId !== "string"
          || typeof item.quantity !== "number"
          || typeof item.notes !== "string"
          || !Array.isArray(item.modifierOptionIds);
      })
    ) {
      return NextResponse.json({ ok: false, error: "The queued Restaurant order is invalid." }, { status: 422 });
    }
    try {
      const result = await createRestaurantOfflineOrder({
        requestKey: operation.id,
        locationId: payload.locationId,
        orderType,
        tableId: typeof payload.tableId === "string" ? payload.tableId : null,
        customerId: typeof payload.customerId === "string" ? payload.customerId : null,
        customerName: typeof payload.customerName === "string" ? payload.customerName : "",
        customerPhone: typeof payload.customerPhone === "string" ? payload.customerPhone : "",
        deliveryAddress: typeof payload.deliveryAddress === "string" ? payload.deliveryAddress : "",
        notes: typeof payload.notes === "string" ? payload.notes : "",
        expectedTotal: total,
        items: rawItems.map((line) => {
          const item = line as Record<string, unknown>;
          return {
            menuItemId: String(item.menuItemId),
            quantity: Number(item.quantity),
            notes: String(item.notes),
            modifierOptionIds: (item.modifierOptionIds as unknown[]).map(String),
          };
        }),
      });
      return NextResponse.json({
        ok: true,
        orderId: result.orderId,
        orderNumber: result.orderNumber,
        cueNumber: result.cueNumber,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "The queued Restaurant order could not be synced.";
      return NextResponse.json({ ok: false, error: message }, { status: 422 });
    }
  }

  if (operation.type !== "sale") {
    return NextResponse.json({ ok: false, error: "Unsupported offline operation." }, { status: 400 });
  }

  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  const rawAllocations = Array.isArray(payload.paymentAllocations) ? payload.paymentAllocations : [];
  const total = Number(payload.total);
  const paymentMethod = String(payload.paymentMethod ?? "Cash");
  const allocatedAmount = rawAllocations.reduce((sum, allocation) =>
    sum + Number((allocation as Record<string, unknown>).amount ?? 0), 0);
  const amountPaid = payload.amountPaid == null
    ? rawAllocations.length ? allocatedAmount : /^credit$/i.test(paymentMethod) ? 0 : total
    : Number(payload.amountPaid);
  if (!Number.isFinite(total) || total < 0 || !Number.isFinite(amountPaid) || amountPaid < 0 || amountPaid > total + 0.01) {
    return NextResponse.json({ ok: false, error: "The queued sale has invalid total or payment amounts." }, { status: 422 });
  }

  const normalized = {
    orgId: context.orgId,
    posRegisterSessionId: typeof payload.posRegisterSessionId === "string" ? payload.posRegisterSessionId : null,
    offlineSync: true,
    offlineOperationId: operation.id,
    documentStatus: "final",
    customerId: payload.customerId ?? null,
    customerName: payload.customerName ?? null,
    customerPhone: payload.customerPhone ?? null,
    locationId: payload.locationId ?? null,
    reference: payload.reference ?? payload.orderNote ?? null,
    note: payload.note ?? payload.orderNote ?? null,
    saleDate: payload.saleDate ?? new Date().toISOString().slice(0, 10),
    dueDate: typeof payload.dueDate === "string" ? payload.dueDate : null,
    paymentMethod,
    amountPaid,
    shippingAmount: Number(payload.shippingAmount ?? 0),
    discountAmount: Number(payload.discountAmount ?? 0),
    taxAmount: Number(payload.taxAmount ?? 0),
    subtotal: Number(payload.subtotal ?? 0),
    total,
    priceTier: payload.priceTier as "retail" | "wholesale" | "vip" | "special" | undefined,
    items: rawItems.map((line) => {
      const item = line as Record<string, unknown>;
      const quantity = Number(item.quantity ?? 0);
      const unitPrice = Number(item.unitPrice ?? 0);
      const discountPercent = Number(item.discountPercent ?? 0);
      const taxPercent = Number(item.taxPercent ?? 0);
      const lineTotal = Number(item.lineTotal ?? (quantity * unitPrice));
      return {
        productId: String(item.productId ?? ""),
        quantity,
        unitPrice,
        discountPercent,
        taxPercent,
        lineTotal,
      };
    }),
    paymentAllocations: rawAllocations.map((allocation) => {
      const value = allocation as Record<string, unknown>;
      return {
        paymentMethod: String(value.paymentMethod ?? ""),
        accountId: typeof value.accountId === "string" ? value.accountId : null,
        amount: Number(value.amount),
      };
    }),
  };

  if (!normalized.items.length) {
    return NextResponse.json({ ok: false, error: "Offline sale has no items to sync." }, { status: 422 });
  }
  if (normalized.paymentAllocations.some((allocation) =>
    !allocation.paymentMethod || !Number.isFinite(allocation.amount) || allocation.amount <= 0
  )) {
    return NextResponse.json({ ok: false, error: "The queued sale contains invalid payment allocations." }, { status: 422 });
  }
  if (normalized.items.some((item) =>
    !item.productId || !Number.isFinite(item.quantity) || item.quantity <= 0
    || !Number.isFinite(item.unitPrice) || item.unitPrice < 0
    || !Number.isFinite(item.discountPercent) || item.discountPercent < 0 || item.discountPercent > 100
    || !Number.isFinite(item.taxPercent) || item.taxPercent < 0
    || !Number.isFinite(item.lineTotal) || item.lineTotal < 0
  )) {
    return NextResponse.json({ ok: false, error: "The queued sale contains invalid product or amount values." }, { status: 422 });
  }
  if (normalized.paymentAllocations.length) {
    const allocated = normalized.paymentAllocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (Math.abs(allocated - amountPaid) > 0.01) {
      return NextResponse.json({ ok: false, error: "Payment allocations must equal the amount paid." }, { status: 422 });
    }
    if (amountPaid < total - 0.01 && typeof normalized.customerId !== "string") {
      return NextResponse.json({ ok: false, error: "Select a customer before syncing a sale with a credit balance." }, { status: 422 });
    }
  }

  const result = await recordSale(normalized as Parameters<typeof recordSale>[0]);
  if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true, saleId: result.saleId, saleNumber: result.saleNumber });
}
