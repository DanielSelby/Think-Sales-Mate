"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { postOperationalJournal, resolveOperationalAccounts } from "@/lib/accounting/post-operational-journal";

const path = "/route-sales";

export async function createRoute(input: { name: string; territory: string; vehicle: string; routeDays: string[]; startTime: string; endTime: string; notes: string }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { data, error } = await (supabase as any).from("route_sales_routes").insert({
    org_id: context.orgId, name: input.name.trim(), territory: input.territory.trim() || null, vehicle: input.vehicle.trim() || null,
    route_days: input.routeDays, start_time: input.startTime || null, end_time: input.endTime || null, notes: input.notes.trim() || null, created_by: context.userId,
  }).select("id").single();
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true, id: data.id };
}

export async function updateRoute(routeId: string, input: { name: string; territory: string; vehicle: string; routeDays: string[]; startTime: string; endTime: string; notes: string; assignedRepId?: string }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_routes").update({
    name: input.name.trim(), territory: input.territory.trim() || null, vehicle: input.vehicle.trim() || null,
    route_days: input.routeDays, start_time: input.startTime || null, end_time: input.endTime || null,
    notes: input.notes.trim() || null, assigned_rep_id: input.assignedRepId || null,
  }).eq("id", routeId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function deleteRoute(routeId: string) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_routes").delete().eq("id", routeId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function assignRouteRep(routeId: string, repId: string | null) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_routes").update({ assigned_rep_id: repId || null }).eq("id", routeId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function scheduleRouteVisit(input: { routeId: string; customerId: string; visitDate: string; sequenceNo?: number }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { data: existing } = await (supabase as any).from("route_sales_visits").select("id").eq("org_id", context.orgId).eq("route_id", input.routeId).eq("customer_id", input.customerId).eq("visit_date", input.visitDate).maybeSingle();
  const query = existing
    ? (supabase as any).from("route_sales_visits").update({ sequence_no: input.sequenceNo || 1, status: "Scheduled" }).eq("id", existing.id).eq("org_id", context.orgId)
    : (supabase as any).from("route_sales_visits").insert({ org_id: context.orgId, route_id: input.routeId, customer_id: input.customerId, visit_date: input.visitDate, sequence_no: input.sequenceNo || 1 });
  const { error } = await query;
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function assignCustomerToRoute(routeId: string, customerId: string, visitDate: string) {
  return scheduleRouteVisit({ routeId, customerId, visitDate });
}

export async function updateVisitStatus(visitId: string, status: "Scheduled" | "In Progress" | "Completed" | "Missed") {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_visits").update({ status, completed_at: status === "Completed" ? new Date().toISOString() : null }).eq("id", visitId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function recordRouteCollection(input: { customerId: string; routeId?: string; outstanding: number; amount: number; paymentMethod: string }) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  if (!input.customerId || !Number.isFinite(input.amount) || input.amount <= 0) {
    return { error: "Select a customer and enter a valid collection amount." };
  }
  const supabase = await createClient();
  const db = supabase as any;
  const [{ data: sales }, { data: creditPayments }] = await Promise.all([
    db.from("sales")
      .select("id, sale_number, total, amount_paid, sale_date, location_id")
      .eq("org_id", context.orgId)
      .eq("customer_id", input.customerId)
      .in("status", ["completed", "returned"])
      .order("sale_date", { ascending: true }),
    db.from("customer_credit_payments")
      .select("invoice_id, amount")
      .eq("org_id", context.orgId),
  ]);
  const paidByInvoice = new Map<string, number>();
  for (const payment of creditPayments ?? []) {
    paidByInvoice.set(payment.invoice_id, (paidByInvoice.get(payment.invoice_id) ?? 0) + Number(payment.amount ?? 0));
  }
  let remaining = input.amount;
  const allocations: { saleId: string; invoiceId: string; amount: number; locationId: string | null }[] = [];
  for (const sale of sales ?? []) {
    if (remaining <= 0) break;
    const invoiceId = `SALE-${sale.sale_number}`;
    const outstanding = Math.max(0, Number(sale.total ?? 0) - Number(sale.amount_paid ?? 0) - (paidByInvoice.get(invoiceId) ?? 0));
    if (outstanding <= 0) continue;
    const amount = Math.min(remaining, outstanding);
    allocations.push({ saleId: sale.id, invoiceId, amount, locationId: sale.location_id ?? null });
    remaining -= amount;
  }
  const primaryAllocation = allocations[0] ?? null;
  const { data: collection, error } = await db.from("route_sales_collections").insert({
    org_id: context.orgId, customer_id: input.customerId, route_id: input.routeId || null,
    invoice_id: primaryAllocation?.saleId ?? null,
    outstanding_amount: input.outstanding, amount_collected: input.amount, payment_method: input.paymentMethod || "Cash", collector_id: context.userId,
  }).select("id").single();
  if (error || !collection) return { error: error?.message ?? "Could not record collection." };
  if (allocations.length > 0) {
    const paymentMethod = /mobile money|mobile|momo/i.test(input.paymentMethod) ? "MoMo" : input.paymentMethod || "Cash";
    const { error: paymentError } = await db.from("customer_credit_payments").insert(
      allocations.map((allocation) => ({
        org_id: context.orgId,
        customer_id: input.customerId,
        invoice_id: allocation.invoiceId,
        amount: allocation.amount,
        payment_method: paymentMethod,
        payment_date: new Date().toISOString().slice(0, 10),
        location_id: allocation.locationId ?? (context.isBranchScoped ? context.locationId : null),
        recorded_by: context.userId,
        notes: "Recorded from Route Sales collection",
      }))
    );
    if (paymentError) {
      await db.from("route_sales_collections").delete().eq("id", collection.id).eq("org_id", context.orgId);
      return { error: paymentError.message };
    }
  }
  if (allocations.length > 0) {
    const accounts = await resolveOperationalAccounts(supabase, context.orgId, "collection");
    if (accounts.error) {
      console.error("Automatic collection journal was not posted:", accounts.error);
    } else if (accounts.debitAccountId && accounts.creditAccountId) {
      const journal = await postOperationalJournal(supabase, {
        orgId: context.orgId,
        actorId: context.userId,
        sourceModule: "route_collections",
        sourceId: collection.id,
        date: new Date().toISOString().slice(0, 10),
        locationId: primaryAllocation?.locationId ?? null,
        reference: collection.id,
        description: "Route Sales customer collection",
        lines: [
          { account_id: accounts.debitAccountId, description: "Customer collection received", debit: Number(input.amount), credit: 0 },
          { account_id: accounts.creditAccountId, description: "Reduce customer receivable", debit: 0, credit: Number(input.amount) },
        ],
      });
      if (journal.error) console.error("Automatic collection journal was not posted:", journal.error);
    }
  }
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: context.userId,
    action: "route_collection.recorded",
    entityType: "route_sales_collection",
    entityId: collection.id,
    module: "Route Sales",
    description: `Recorded ${input.paymentMethod || "Cash"} collection of ${input.amount}`,
    branchId: context.isBranchScoped ? context.locationId : primaryAllocation?.locationId,
    newValues: {
      customer_id: input.customerId,
      amount_collected: input.amount,
      outstanding_amount: input.outstanding,
      payment_method: input.paymentMethod || "Cash",
      allocated_invoices: allocations.map((allocation) => ({ invoice_id: allocation.invoiceId, amount: allocation.amount })),
    },
  });
  if (audit.error) return { error: audit.error };
  revalidatePath(path);
  revalidatePath("/accounting");
  return { success: true };
}

export async function cloneRoute(routeId: string) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { data: route } = await (supabase as any).from("route_sales_routes").select("name,territory,vehicle,route_days,start_time,end_time,notes").eq("id", routeId).eq("org_id", context.orgId).maybeSingle();
  if (!route) return { error: "Route not found." };
  const { error } = await (supabase as any).from("route_sales_routes").insert({ ...route, org_id: context.orgId, name: `${route.name} (Copy)`, created_by: context.userId });
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export type MobileOrderItemInput = {
  productId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
};

export async function createMobileOrder(input: {
  customerId: string;
  routeId?: string;
  priceLevel: string;
  offlineCreated?: boolean;
  items: MobileOrderItemInput[];
}) {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  if (!input.customerId || input.items.length === 0) return { error: "Select a customer and at least one product." };
  const items = input.items.filter((item) => item.quantity > 0 && item.unitPrice >= 0);
  if (!items.length) return { error: "Add a valid product quantity." };
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPrice - item.discount, 0);
  const supabase = await createClient();
  const { data: order, error } = await (supabase as any).from("route_sales_mobile_orders").insert({
    org_id: context.orgId, customer_id: input.customerId, route_id: input.routeId || null,
    created_by: context.userId, price_level: input.priceLevel || "Retail",
    offline_created: Boolean(input.offlineCreated), total: Math.max(0, total),
  }).select("id").single();
  if (error || !order) return { error: error?.message ?? "Unable to create order." };
  const { error: itemError } = await (supabase as any).from("route_sales_mobile_order_items").insert(
    items.map((item) => ({ order_id: order.id, product_id: item.productId, quantity: item.quantity, unit_price: item.unitPrice, discount: item.discount })),
  );
  if (itemError) {
    await (supabase as any).from("route_sales_mobile_orders").delete().eq("id", order.id).eq("org_id", context.orgId);
    return { error: itemError.message };
  }
  revalidatePath(path);
  return { success: true, id: order.id, total };
}

export async function updateMobileOrderStatus(orderId: string, status: "Draft" | "Submitted" | "Converted") {
  const context = await getCurrentOrgContext();
  if (!context) return { error: "No active organization." };
  const supabase = await createClient();
  const { error } = await (supabase as any).from("route_sales_mobile_orders")
    .update({ status, updated_at: new Date().toISOString() }).eq("id", orderId).eq("org_id", context.orgId);
  if (error) return { error: error.message };
  revalidatePath(path);
  return { success: true };
}

export async function getRouteSalesAlerts() {
  const context = await getCurrentOrgContext();
  if (!context) return { alerts: [] };
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
  const [{ data: routes }, { data: visits }, { data: collections }, { data: reps }] = await Promise.all([
    (supabase as any).from("route_sales_routes").select("id,name,status,end_time").eq("org_id", context.orgId),
    (supabase as any).from("route_sales_visits").select("visit_date,status,route_id").eq("org_id", context.orgId),
    (supabase as any).from("route_sales_collections").select("outstanding_amount,amount_collected,collection_date").eq("org_id", context.orgId),
    (supabase as any).from("profiles").select("id,full_name,updated_at").eq("org_id", context.orgId),
  ]);
  const alerts: Array<{ type: string; label: string; count: number; detail: string }> = [];
  const missedRoutes = (visits ?? []).filter((visit: any) => visit.visit_date < today && ["Scheduled", "In Progress"].includes(visit.status)).length;
  if (missedRoutes) alerts.push({ type: "missed-routes", label: "Missed / overdue routes", count: missedRoutes, detail: "Visits past their date are still open." });
  const overdueCollections = (collections ?? []).filter((item: any) => Number(item.outstanding_amount) > Number(item.amount_collected) && item.collection_date < today).length;
  if (overdueCollections) alerts.push({ type: "overdue-collections", label: "Overdue collections", count: overdueCollections, detail: "Collections have an unpaid balance." });
  const inactiveReps = (reps ?? []).filter((rep: any) => rep.updated_at && Date.now() - new Date(rep.updated_at).getTime() > 30 * 86400000).length;
  if (inactiveReps) alerts.push({ type: "inactive-reps", label: "Inactive reps", count: inactiveReps, detail: "No profile activity recorded in 30 days." });
  const activeRoutes = (routes ?? []).filter((route: any) => route.status === "Active");
  if (activeRoutes.length && missedRoutes >= activeRoutes.length) alerts.push({ type: "missed-targets", label: "Missed route targets", count: missedRoutes, detail: "Open visits exceed active route capacity." });
  return { alerts };
}
