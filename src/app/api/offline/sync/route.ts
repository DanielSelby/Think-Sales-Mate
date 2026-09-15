import { NextResponse } from "next/server";
import { recordSale } from "@/app/(dashboard)/sales/actions";
import { getCurrentOrgContext } from "@/lib/organizations/current";

export async function POST(request: Request) {
  const operation = await request.json() as { type?: string; payload?: unknown };
  if (operation.type !== "sale" || !operation.payload || typeof operation.payload !== "object") {
    return NextResponse.json({ ok: false, error: "Unsupported offline operation." }, { status: 400 });
  }

  const payload = operation.payload as Record<string, unknown>;
  const context = await getCurrentOrgContext();
  if (!context) {
    return NextResponse.json({ ok: false, error: "No active organization found for sync." }, { status: 400 });
  }

  const normalized = {
    orgId: String(payload.orgId ?? context.orgId),
    documentStatus: "final",
    customerId: payload.customerId ?? null,
    customerName: payload.customerName ?? null,
    customerPhone: payload.customerPhone ?? null,
    locationId: payload.locationId ?? null,
    reference: payload.orderNote ?? null,
    note: payload.orderNote ?? null,
    saleDate: payload.saleDate ?? new Date().toISOString().slice(0, 10),
    paymentMethod: payload.paymentMethod ?? "Cash",
    amountPaid: typeof payload.total === "number" ? Number(payload.total) : (typeof payload.amountPaid === "number" ? payload.amountPaid : null),
    shippingAmount: Number(payload.shippingAmount ?? 0),
    discountAmount: Number(payload.discountAmount ?? 0),
    taxAmount: Number(payload.taxAmount ?? 0),
    subtotal: Number(payload.subtotal ?? 0),
    total: Number(payload.total ?? 0),
    priceTier: payload.priceTier as "retail" | "wholesale" | "vip" | "special" | undefined,
    items: Array.isArray(payload.items) ? payload.items.map((line) => {
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
    }) : [],
  };

  if (!normalized.items.length) {
    return NextResponse.json({ ok: false, error: "Offline sale has no items to sync." }, { status: 422 });
  }

  const result = await recordSale(normalized as Parameters<typeof recordSale>[0]);
  if (result.error) return NextResponse.json({ ok: false, error: result.error }, { status: 422 });
  return NextResponse.json({ ok: true });
}
