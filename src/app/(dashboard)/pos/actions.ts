"use server";

import { canPermission, requirePermission } from "@/lib/rbac/permissions";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { recordAuditEvent } from "@/lib/audit/record-audit-event";
import { getPlatformSystemName } from "@/lib/supabase/platform-admin";
import { canUseLocation } from "@/lib/organizations/location-access";
import { postOperationalJournal, resolveOperationalAccounts } from "@/lib/accounting/post-operational-journal";
import type { HeldSaleKind } from "@/types/database";

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
type AuthUser = { id: string; user_metadata?: { full_name?: string | null } | null };

// held_sales.created_by (and a handful of other created_by columns) has a
// foreign key to profiles(id), which is normally populated by a trigger the
// moment someone signs up. Any account that predates that trigger — or
// otherwise never got a profiles row — hits a FK violation on the very
// first insert that references it. This makes that self-healing instead of
// a hard failure: see the 20260816090000 migration for the permanent fix.
async function ensureProfile(supabase: SupabaseClient, user: AuthUser) {
  await supabase
    .from("profiles")
    .upsert({ id: user.id, full_name: user.user_metadata?.full_name ?? null }, { onConflict: "id", ignoreDuplicates: true });
}

export interface RecentSale {
  id: string;
  saleNumber: number;
  customerName: string | null;
  total: number;
  paymentMethod: string | null;
  createdAt: string;
  itemsSummary: string;
}

export async function getRecentPosSales(locationId: string | null, limit: number = 10): Promise<RecentSale[]> {
  await requirePermission("pos", "view");
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = await createClient();
  let q = supabase
    .from("sales")
    .select("id, sale_number, customer_name, total, payment_method, sale_date")
    .eq("org_id", context.orgId)
    .order("sale_date", { ascending: false })
    .limit(limit);

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    if (locationId && context.allowedLocationIds.includes(locationId)) {
      q = q.eq("location_id", locationId);
    } else {
      q = q.in("location_id", context.allowedLocationIds);
    }
  } else if (locationId) {
    q = q.eq("location_id", locationId);
  }

  if (!context.canViewOtherTransactions) {
    q = q.eq("sold_by", context.userId);
  }

  const { data } = await q;
  const sales = data ?? [];
  if (sales.length === 0) return [];

  const { data: itemRows } = await supabase
    .from("sale_items")
    .select("sale_id, quantity, products(name)")
    .in("sale_id", sales.map((s) => s.id));
  const namesBySale = new Map<string, string[]>();
  for (const row of itemRows ?? []) {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const list = namesBySale.get(row.sale_id) ?? [];
    list.push(product?.name ? `${product.name}${row.quantity > 1 ? ` ×${row.quantity}` : ""}` : "Unknown item");
    namesBySale.set(row.sale_id, list);
  }

  return sales.map((s) => {
    const names = namesBySale.get(s.id) ?? [];
    const itemsSummary = names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2} more` : names.join(", ") || "No items";

    return {
      id: s.id,
      saleNumber: s.sale_number,
      customerName: s.customer_name,
      total: s.total,
      paymentMethod: s.payment_method,
      createdAt: s.sale_date,
      itemsSummary
    };
  });
}

// ---------------------------------------------------------------------------
// Branded receipt data — feeds buildBrandedInvoiceHtml (see lib/sales/invoice-template).
// ---------------------------------------------------------------------------

export interface PosInvoiceItem {
  productName: string;
  sku: string | null;
  quantity: number;
  unitPrice: number;
  discountAmount: number;
  lineTotal: number;
}

export interface PosInvoiceData {
  orgName: string;
  systemName: string;
  logoUrl: string | null;
  showLogoOnInvoices: boolean;
  locationName: string | null;
  locationAddress: string | null;
  locationPhone: string | null;
  locationEmail: string | null;
  saleNumber: number;
  saleDate: string;
  cashierName: string;
  customerName: string;
  paymentMethod: string | null;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  amountPaid: number;
  currency: string;
  items: PosInvoiceItem[];
}

export async function getInvoiceData(saleId: string): Promise<PosInvoiceData | null> {
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();

  const { data: sale } = await supabase
    .from("sales")
    .select("sale_number, customer_name, subtotal, discount_amount, tax_amount, total, amount_paid, payment_method, sale_date, created_at, location_id, sold_by")
    .eq("id", saleId)
    .eq("org_id", context.orgId)
    .single();
  if (!sale) return null;

  const [{ data: items }, locationResult, cashierResult, companyResult, systemName] = await Promise.all([
    supabase.from("sale_items").select("quantity, unit_price, discount_percent, line_total, products(name, sku)").eq("sale_id", saleId),
    sale.location_id
      ? supabase.from("business_locations").select("name, address, city, region, country, phone, email").eq("id", sale.location_id).single()
      : Promise.resolve({ data: null }),
    sale.sold_by
      ? supabase.from("profiles").select("full_name").eq("id", sale.sold_by).single()
      : Promise.resolve({ data: null }),
    supabase.from("company_profile").select("logo_url, show_logo_on_invoices").eq("org_id", context.orgId).maybeSingle(),
    getPlatformSystemName().catch(() => "ThinkSales ERP Pro"),
  ]);
  const location = locationResult.data;
  const cashierProfile = cashierResult.data;

  const locationAddress = location ? [location.address, location.city, location.region, location.country].filter(Boolean).join(", ") : null;

  // sale_date is a DATE column (no time-of-day) — the receipt's date comes
  // from it (it's the field the "select date" picker controls), but the
  // time comes from created_at, the only field that actually has one.
  const dateOnly = sale.sale_date; // 'YYYY-MM-DD'
  const timeOnly = new Date(sale.created_at).toISOString().slice(11, 16);
  const combined = `${dateOnly}T${timeOnly}:00`;

  return {
    orgName: context.orgName,
    systemName,
    logoUrl: companyResult.data?.logo_url ?? null,
    showLogoOnInvoices: companyResult.data?.show_logo_on_invoices ?? true,
    locationName: location?.name ?? null,
    locationAddress: locationAddress || null,
    locationPhone: location?.phone ?? null,
    locationEmail: location?.email ?? null,
    saleNumber: sale.sale_number,
    saleDate: combined,
    cashierName: cashierProfile?.full_name || "—",
    customerName: sale.customer_name || "Walk-In Customer",
    paymentMethod: sale.payment_method,
    subtotal: sale.subtotal,
    discountAmount: sale.discount_amount,
    taxAmount: sale.tax_amount,
    total: sale.total,
    amountPaid: sale.amount_paid ?? sale.total,
    currency: context.currency,
    items: (items ?? []).map((i) => {
      const product = Array.isArray(i.products) ? i.products[0] : i.products;
      const gross = i.quantity * i.unit_price;
      const discountAmount = gross * (i.discount_percent / 100);
      return {
        productName: product?.name ?? "Unknown product",
        sku: product?.sku ?? null,
        quantity: i.quantity,
        unitPrice: i.unit_price,
        discountAmount,
        // The item row shows the line amount before invoice-level tax.
        // Tax remains represented separately in the totals box and included
        // in the final sale total.
        lineTotal: Math.max(0, gross - discountAmount),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// POS register sessions gate sales and are closed with an immutable cash
// snapshot in register_closures.
// ---------------------------------------------------------------------------

export interface ActivePosRegisterSession {
  id: string;
  locationId: string;
  cashierId: string;
  registerName: string;
  cashierName: string | null;
  openingCash: number;
  openedAt: string;
  shift: string | null;
}

export async function openPosRegister(input: {
  locationId: string;
  openingCash: number;
  registerName: string;
  shift: string;
  notes?: string;
}): Promise<SimpleResult> {
  if (!await canPermission("pos", "create")) {
    return { ok: false, error: "You do not have permission to open a register." };
  }
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  if (!canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You do not have access to this branch." };
  }
  const openingCash = Number(input.openingCash);
  if (!Number.isFinite(openingCash) || openingCash < 0) {
    return { ok: false, error: "Enter a valid opening cash amount." };
  }
  const registerName = input.registerName.trim();
  if (!registerName || registerName.length > 80) return { ok: false, error: "Enter a register name (80 characters maximum)." };
  if (!["morning", "afternoon", "night", "full_day"].includes(input.shift)) return { ok: false, error: "Select a valid register shift." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const db = supabase as any;
  const { data: active, error: activeError } = await db
    .from("pos_register_sessions")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("cashier_id", user.id)
    .eq("status", "open")
    .maybeSingle();
  if (activeError) return { ok: false, error: "Could not verify your register status. Please try again." };
  if (active) return { ok: false, error: "You already have an open register session. Close it before opening another." };

  const { data: location, error: locationError } = await db
    .from("business_locations")
    .select("id")
    .eq("id", input.locationId)
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (locationError || !location) return { ok: false, error: "This branch is unavailable or inactive." };

  const { data: session, error } = await db
    .from("pos_register_sessions")
    .insert({
      org_id: context.orgId,
      location_id: input.locationId,
      cashier_id: user.id,
      cashier_name: user.user_metadata?.full_name ?? context.userEmail,
      register_name: registerName,
      shift: input.shift,
      opening_cash: openingCash,
      notes: input.notes?.trim() || null,
    })
    .select("id")
    .single();
  if (error || !session) {
    return {
      ok: false,
      error: error?.code === "23505"
        ? "You already have an open register session. Close it before opening another."
        : "Could not open the register. Please try again.",
    };
  }

  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: user.id,
    action: "pos.register_opened",
    entityType: "pos_register_session",
    entityId: session.id,
    module: "POS",
    description: "Register session opened.",
    branchId: input.locationId,
    newValues: { register_name: registerName, shift: input.shift, opening_cash: openingCash },
  });
  if (audit.error) {
    return { ok: true, error: "Register opened, but the audit event could not be recorded. Notify an administrator." };
  }
  revalidatePath("/pos");
  revalidatePath("/pos/open-register");
  return { ok: true };
}

export async function recordPosCashMovement(input: {
  registerSessionId: string;
  type: "cash_in" | "cash_out" | "paid_out";
  amount: number;
  reason: string;
  reference?: string;
}): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  if (!await canPermission("pos", "edit")) {
    return { ok: false, error: "You do not have permission to record cash movements." };
  }
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0 || !input.reason.trim()) {
    return { ok: false, error: "Enter a positive amount and a reason." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const db = supabase as any;
  const { data: session, error: sessionError } = await db
    .from("pos_register_sessions")
    .select("location_id")
    .eq("id", input.registerSessionId)
    .eq("org_id", context.orgId)
    .eq("cashier_id", user.id)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError || !session) return { ok: false, error: "The register session is not open or is unavailable." };
  if (!canUseLocation(context, session.location_id)) return { ok: false, error: "You do not have access to this branch." };

  const { data: movement, error } = await db.from("pos_cash_movements").insert({
    org_id: context.orgId,
    location_id: session.location_id,
    register_session_id: input.registerSessionId,
    movement_type: input.type,
    amount,
    reason: input.reason.trim(),
    reference: input.reference?.trim() || null,
    created_by: user.id,
  }).select("id").single();
  if (error || !movement) return { ok: false, error: "Could not record the cash movement. Please try again." };
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: user.id,
    action: `pos.${input.type}`,
    entityType: "pos_cash_movement",
    entityId: movement.id,
    module: "POS",
    description: `Cash drawer ${input.type.replaceAll("_", " ")} recorded.`,
    branchId: session.location_id,
    newValues: { amount, reason: input.reason.trim(), reference: input.reference?.trim() || null },
  });
  revalidatePath("/pos/cash-drawer");
  if (audit.error) return { ok: true, error: "Movement recorded, but its audit event could not be saved. Notify an administrator." };
  return { ok: true };
}

function startEndOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

export interface RegisterSummary {
  periodStart: string;
  periodEnd: string;
  registerSessionId: string | null;
  openingCash: number;
  salesCount: number;
  salesTotal: number;
  cashTotal: number;
  cashIn: number;
  cashOut: number;
  cardTotal: number;
  momoTotal: number;
  otherTotal: number;
  expensesTotal: number;
  netTotal: number;
}

function bucketPaymentMethod(method: string | null): "cash" | "card" | "momo" | "other" {
  const m = (method ?? "").toLowerCase();
  if (m.startsWith("cash")) return "cash";
  if (m.startsWith("card")) return "card";
  if (m.includes("mobile money") || m.includes("momo")) return "momo";
  return "other"; // Credit, Split(...), or unset
}

function splitPaymentTotals(method: string | null) {
  const totals = { cash: 0, card: 0, momo: 0, other: 0 };
  const value = method ?? "";
  if (!/^split\s*\(/i.test(value)) return totals;
  for (const part of value.replace(/^split\s*\(/i, "").replace(/\)\s*$/, "").split(",")) {
    const match = part.trim().match(/^(cash|card|momo|mobile money)\s+([-+]?\d+(?:\.\d+)?)/i);
    if (!match) continue;
    const amount = Number(match[2]);
    if (!Number.isFinite(amount)) continue;
    const key = match[1].toLowerCase();
    if (key === "cash") totals.cash += amount;
    else if (key === "card") totals.card += amount;
    else totals.momo += amount;
  }
  return totals;
}

export async function getRegisterSummary(locationId: string | null, cashierId: string | null, sessionOnly = false): Promise<RegisterSummary> {
  const context = await getCurrentOrgContext();
  let { start, end } = startEndOfToday();
  const empty: RegisterSummary = {
    periodStart: start, periodEnd: end, registerSessionId: null, openingCash: 0, salesCount: 0, salesTotal: 0,
    cashTotal: 0, cashIn: 0, cashOut: 0, cardTotal: 0, momoTotal: 0, otherTotal: 0, expensesTotal: 0, netTotal: 0
  };
  if (!context) return empty;
  const supabase = await createClient();
  let activeSession: { id: string; location_id: string; opening_cash: number; opened_at: string } | null = null;
  if (sessionOnly) {
    const { data, error } = await (supabase as any)
      .from("pos_register_sessions")
      .select("id, location_id, opening_cash, opened_at")
      .eq("org_id", context.orgId)
      .eq("cashier_id", cashierId ?? context.userId)
      .eq("location_id", locationId)
      .eq("status", "open")
      .maybeSingle();
    if (error) throw new Error("Could not load the open register summary.");
    activeSession = data;
    if (activeSession) {
      start = activeSession.opened_at;
      end = new Date().toISOString();
    }
  }

  let salesQuery = supabase
    .from("sales")
    .select("total, payment_method")
    .eq("org_id", context.orgId)
    .gte("created_at", start)
    .lt("created_at", end);

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    if (locationId && context.allowedLocationIds.includes(locationId)) {
      salesQuery = salesQuery.eq("location_id", locationId);
    } else {
      salesQuery = salesQuery.in("location_id", context.allowedLocationIds);
    }
  } else if (locationId) {
    salesQuery = salesQuery.eq("location_id", locationId);
  }
  if (activeSession) salesQuery = salesQuery.eq("register_session_id", activeSession.id);

  if (!context.canViewOtherTransactions) {
    salesQuery = salesQuery.eq("sold_by", context.userId);
  } else if (cashierId) {
    salesQuery = salesQuery.eq("sold_by", cashierId);
  }

  let expensesQuery = supabase
    .from("expenses")
    .select("amount, payment_method, created_at")
    .eq("org_id", context.orgId)
    .gte("expense_date", start.slice(0, 10))
    .lte("expense_date", end.slice(0, 10));

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    if (locationId && context.allowedLocationIds.includes(locationId)) {
      expensesQuery = expensesQuery.eq("location_id", locationId);
    } else {
      expensesQuery = expensesQuery.in("location_id", context.allowedLocationIds);
    }
  } else if (locationId) {
    expensesQuery = expensesQuery.eq("location_id", locationId);
  }
  // Individual closures include only expenses recorded by that cashier. An
  // all-cashiers closure intentionally keeps the branch-wide expense total.
  if (cashierId) {
    expensesQuery = expensesQuery.eq("recorded_by", cashierId);
  }
  if (activeSession) {
    expensesQuery = expensesQuery.gte("created_at", activeSession.opened_at).lt("created_at", end);
  }

  const movementsQuery = activeSession
    ? (supabase as any).from("pos_cash_movements")
      .select("movement_type, amount")
      .eq("org_id", context.orgId)
      .eq("register_session_id", activeSession.id)
    : null;
  const [{ data: salesRows }, { data: expenseRows }, movementsResult] = await Promise.all([
    salesQuery,
    expensesQuery,
    movementsQuery ?? Promise.resolve({ data: [] }),
  ]);

  const totals = { cash: 0, card: 0, momo: 0, other: 0 };
  let salesTotal = 0;
  for (const s of salesRows ?? []) {
    salesTotal += s.total;
    const split = splitPaymentTotals(s.payment_method);
    if (Object.values(split).some((value) => value > 0)) {
      totals.cash += split.cash;
      totals.card += split.card;
      totals.momo += split.momo;
      totals.other += split.other;
    } else {
      totals[bucketPaymentMethod(s.payment_method)] += s.total;
    }
  }
  const expensesTotal = (expenseRows ?? []).reduce(
    (sum, expense) => sum + (/^cash\b/i.test(expense.payment_method ?? "") ? Number(expense.amount) : 0),
    0,
  );
  const cashIn = (movementsResult.data ?? []).reduce(
    (sum: number, movement: { movement_type: string; amount: number }) => sum + (movement.movement_type === "cash_in" ? Number(movement.amount) : 0),
    0,
  );
  const cashOut = (movementsResult.data ?? []).reduce(
    (sum: number, movement: { movement_type: string; amount: number }) => sum + (movement.movement_type !== "cash_in" ? Number(movement.amount) : 0),
    0,
  );

  return {
    periodStart: start,
    periodEnd: end,
    registerSessionId: activeSession?.id ?? null,
    openingCash: Number(activeSession?.opening_cash ?? 0),
    salesCount: (salesRows ?? []).length,
    salesTotal,
    cashTotal: totals.cash,
    cashIn,
    cashOut,
    cardTotal: totals.card,
    momoTotal: totals.momo,
    otherTotal: totals.other,
    expensesTotal,
    netTotal: salesTotal - expensesTotal,
  };
}

export interface CloseRegisterInput {
  locationId: string | null;
  actualCash: number;
  varianceReason: string | null;
  denominations: Array<{ denomination: number; quantity: number }>;
}

export async function closeRegister(input: CloseRegisterInput): Promise<SimpleResult> {
  if (!await canPermission("pos", "edit") && !await canPermission("pos", "create")) {
    return { ok: false, error: "You do not have permission to close the register." };
  }
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  if (!canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You do not have access to this branch." };
  }
  const supabase = await createClient() as any;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data: activeSession, error: sessionError } = await supabase
    .from("pos_register_sessions")
    .select("id, location_id, opening_cash, opened_at")
    .eq("org_id", context.orgId)
    .eq("cashier_id", user.id)
    .eq("location_id", input.locationId)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError) return { ok: false, error: "Could not verify that your register is open." };
  if (!activeSession) return { ok: false, error: "There is no open register session to close." };
  const summary = await getRegisterSummary(input.locationId, user.id, true);

  // Reject an already-covered period before inserting. The database trigger
  // below repeats this check so concurrent requests cannot create overlaps.
  const { data: overlappingClosures, error: overlapError } = await supabase
    .from("register_closures")
    .select("id, location_id, scope, cashier_id, register_session_id")
    .eq("org_id", context.orgId)
    .lt("period_start", summary.periodEnd)
    .gt("period_end", summary.periodStart);
  if (overlapError) return { ok: false, error: overlapError.message };

  const overlaps = (overlappingClosures ?? []).some((closure: { location_id: string | null; scope: "all" | "individual"; cashier_id: string | null; register_session_id: string | null }) => {
    if (!closure.register_session_id) return false;
    const sameLocation = closure.location_id === null || input.locationId === null || closure.location_id === input.locationId;
    const sameCashier = closure.scope === "all" || closure.cashier_id === user.id;
    return sameLocation && sameCashier;
  });
  if (overlaps) {
    return { ok: false, error: "This register period overlaps an existing closure." };
  }
  const actualCash = Number(input.actualCash);
  if (!Number.isFinite(actualCash) || actualCash < 0) return { ok: false, error: "Enter a valid physical cash amount." };
  const denominations = input.denominations
    .filter((line) => Number.isFinite(line.denomination) && line.denomination > 0 && Number.isInteger(line.quantity) && line.quantity > 0);
  if (denominations.length) {
    const denominationTotal = denominations.reduce((sum, line) => sum + line.denomination * line.quantity, 0);
    if (Math.abs(denominationTotal - actualCash) > 0.01) {
      return { ok: false, error: "Denomination total must match the physical cash counted." };
    }
  }
  const openingCash = Number(activeSession.opening_cash ?? 0);
  const expectedCash = Math.max(0, openingCash + summary.cashTotal + summary.cashIn - summary.cashOut - summary.expensesTotal);
  const variance = Number((actualCash - expectedCash).toFixed(2));
  if (Math.abs(variance) > 0.005 && !input.varianceReason?.trim()) {
    return { ok: false, error: "A variance reason is required when counted cash differs from expected cash." };
  }

  const closurePayload = {
    org_id: context.orgId,
    location_id: input.locationId,
    register_session_id: activeSession.id,
    closed_by: user.id,
    period_start: summary.periodStart,
    period_end: summary.periodEnd,
    sales_count: summary.salesCount,
    sales_total: summary.salesTotal,
    cash_total: summary.cashTotal,
    card_total: summary.cardTotal,
    momo_total: summary.momoTotal,
    other_total: summary.otherTotal,
    expenses_total: summary.expensesTotal,
    cash_in: summary.cashIn,
    cash_out: summary.cashOut,
    net_total: summary.netTotal,
    actual_cash: actualCash,
    opening_cash: openingCash,
    variance,
    variance_reason: input.varianceReason?.trim() || null,
    status: Math.abs(variance) > 0.005 ? "pending_approval" : "approved",
    approved_by: Math.abs(variance) > 0.005 ? null : user.id,
    approved_at: Math.abs(variance) > 0.005 ? null : new Date().toISOString(),
  };
  const admin = createAdminClient();
  const { data: closureId, error } = await (admin as any).rpc("close_pos_register_session", {
    p_session_id: activeSession.id,
    p_org_id: context.orgId,
    p_cashier_id: user.id,
    p_closure: closurePayload,
    p_denominations: denominations,
  });
  if (error || !closureId) return { ok: false, error: error?.message ?? "Could not close the register session." };
  const audit = await recordAuditEvent(supabase, {
    orgId: context.orgId,
    actorId: user.id,
    action: "pos.register_closed",
    entityType: "pos_register_session",
    entityId: activeSession.id,
    module: "POS",
    description: "Register session closed.",
    branchId: input.locationId,
    newValues: { closure_id: closureId, actual_cash: actualCash, variance },
  });
  if (audit.error) {
    revalidatePath("/pos");
    return { ok: true, error: "Register closed, but the audit event could not be recorded. Notify an administrator." };
  }
  revalidatePath("/pos");
  return { ok: true };
}

export interface RegisterClosureRecord extends RegisterSummary {
  id: string;
  scope: "all" | "individual";
  cashierName: string | null;
  locationName: string | null;
  closedAt: string;
  status: "approved" | "pending_approval" | "rejected" | "reopened";
  actualCash: number | null;
  variance: number | null;
}

export async function listRegisterClosures(locationId: string | null, limit: number = 20): Promise<RegisterClosureRecord[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  if (context.isBranchScoped && context.allowedLocationIds.length === 0) return [];
  if (context.isBranchScoped && locationId && !context.allowedLocationIds.includes(locationId)) return [];
  const supabase = await createClient();

  let q = supabase
    .from("register_closures")
    .select("id, scope, cashier_name, period_start, period_end, sales_count, sales_total, cash_total, cash_in, cash_out, card_total, momo_total, other_total, expenses_total, net_total, opening_cash, register_session_id, actual_cash, variance, status, created_at, business_locations(name)")
    .eq("org_id", context.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    if (locationId && context.allowedLocationIds.includes(locationId)) {
      q = q.eq("location_id", locationId);
    } else {
      q = q.in("location_id", context.allowedLocationIds);
    }
  } else if (locationId) {
    q = q.eq("location_id", locationId);
  }

  const canApproveClosures =
    await canPermission("approvals", "approve") ||
    await canPermission("pos", "approve") ||
    await canPermission("cash_closing", "approve") ||
    await canPermission("banking", "approve");
  if (!context.canViewOtherTransactions && !canApproveClosures) {
    q = q.eq("closed_by", context.userId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`Could not load register closures: ${error.message}`);

  return (data ?? []).map((r) => {
    const location = Array.isArray(r.business_locations) ? r.business_locations[0] : r.business_locations;
    return {
      id: r.id,
      scope: r.scope,
      cashierName: r.cashier_name,
      locationName: location?.name ?? null,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      registerSessionId: r.register_session_id,
      openingCash: Number(r.opening_cash ?? 0),
      salesCount: r.sales_count,
      salesTotal: r.sales_total,
      cashTotal: r.cash_total,
      cashIn: Number(r.cash_in ?? 0),
      cashOut: Number(r.cash_out ?? 0),
      cardTotal: r.card_total,
      momoTotal: r.momo_total,
      otherTotal: r.other_total,
      expensesTotal: r.expenses_total,
      netTotal: r.net_total,
      closedAt: r.created_at,
      status: r.status,
      actualCash: r.actual_cash,
      variance: r.variance,
    };
  });
}

export async function approveRegisterClosure(
  closureId: string,
  status: "approved" | "rejected" | "reopened" = "approved",
  reason?: string,
): Promise<SimpleResult> {
  const canApproveClosures =
    await canPermission("approvals", "approve") ||
    await canPermission("pos", "approve") ||
    await canPermission("cash_closing", "approve") ||
    await canPermission("banking", "approve");
  if (!canApproveClosures) {
    return { ok: false, error: "Approval permission required." };
  }
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const admin = createAdminClient();
  const { data: closure, error: lookupError } = await admin
    .from("register_closures")
    .select("id, org_id, location_id, status")
    .eq("id", closureId)
    .eq("org_id", context.orgId)
    .maybeSingle();
  if (lookupError) return { ok: false, error: lookupError.message };
  if (!closure) return { ok: false, error: "Register closure not found." };
  if (!canUseLocation(context, closure.location_id)) {
    return { ok: false, error: "You do not have access to this branch." };
  }
  if (status === "reopened" ? closure.status !== "approved" : closure.status !== "pending_approval") {
    return {
      ok: false,
      error: status === "reopened"
        ? "Only an approved register closure can be reopened."
        : "Only a pending register closure can be approved or rejected.",
    };
  }

  const { data: updatedClosure, error } = await admin.from("register_closures").update({
    status,
    approved_by: status === "approved" ? context.userId : null,
    approved_at: status === "approved" ? new Date().toISOString() : null,
  }).eq("id", closureId).eq("org_id", context.orgId).eq("status", closure.status).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!updatedClosure) return { ok: false, error: "Register closure changed before your decision was saved. Refresh and try again." };

  const audit = await recordAuditEvent(admin, {
    orgId: context.orgId,
    actorId: context.userId,
    action: `register_closure.${status}`,
    entityType: "register_closures",
    entityId: closureId,
    module: "POS",
    description: `${status === "reopened" ? "Reopened" : status === "approved" ? "Approved" : "Rejected"} register closure`,
    branchId: closure.location_id,
    previousValues: { status: closure.status },
    newValues: { status, reason: reason?.trim() || null },
  });
  if (audit.error) return { ok: false, error: audit.error };
  revalidatePath("/pos");
  revalidatePath("/approvals");
  return { ok: true };
}

export interface CartItemInput {
  productId: string;
  name: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
  description?: string;
  priceTier?: "retail" | "wholesale" | "vip" | "special";
}

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Customer search / quick add
// ---------------------------------------------------------------------------

export interface CustomerOption {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
}

export async function searchCustomers(query: string): Promise<CustomerOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = await createClient();
  const q = query.trim();
  if (!q) {
    const { data } = await supabase.from("customers").select("id, name, phone, email").eq("org_id", context.orgId).order("name").limit(8);
    return data ?? [];
  }
  const { data } = await supabase
    .from("customers")
    .select("id, name, phone, email")
    .eq("org_id", context.orgId)
    .or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`)
    .limit(8);
  return data ?? [];
}

export interface NewContactInput {
  name: string;
  contactType: "individual" | "business";
  contactId: string | null;
  phone: string; // required — "Mobile*" in the form
  alternatePhone: string | null;
  landline: string | null;
  email: string | null;
}

export async function addCustomer(input: NewContactInput): Promise<{ ok: boolean; error?: string; customer?: CustomerOption }> {
  await requirePermission("pos", "create");
  if (!input.name.trim()) return { ok: false, error: "Name is required." };
  if (!input.phone.trim()) return { ok: false, error: "Mobile number is required." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("customers")
    .insert({
      org_id: context.orgId,
      name: input.name.trim(),
      phone: input.phone.trim(),
      email: input.email,
      contact_type: input.contactType,
      contact_id: input.contactId,
      alternate_phone: input.alternatePhone,
      landline: input.landline,
      created_by: user.id,
    })
    .select("id, name, phone, email")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add customer." };
  return { ok: true, customer: data };
}

// Kept for anywhere still using the old 3-field quick-add.
export async function quickAddCustomer(name: string, phone: string | null, email: string | null): Promise<{ ok: boolean; error?: string; customer?: CustomerOption }> {
  if (!name.trim()) return { ok: false, error: "Name is required." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data, error } = await supabase
    .from("customers")
    .insert({ org_id: context.orgId, name: name.trim(), phone, email, created_by: user.id })
    .select("id, name, phone, email")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't add customer." };
  return { ok: true, customer: data };
}

// ---------------------------------------------------------------------------
// Hold / Draft — park a cart before it's a real sale
// ---------------------------------------------------------------------------

export interface HeldSaleInput {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNote: string | null;
  items: CartItemInput[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  total: number;
  kind: HeldSaleKind;
}

export async function parkSale(input: HeldSaleInput): Promise<SimpleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  await ensureProfile(supabase, user);

  const { error } = await supabase.from("held_sales").insert({
    org_id: context.orgId,
    location_id: input.locationId,
    kind: input.kind,
    customer_id: input.customerId,
    customer_name: input.customerName,
    customer_phone: input.customerPhone,
    order_note: input.orderNote,
    items: input.items,
    subtotal: input.subtotal,
    discount_amount: input.discountAmount,
    tax_amount: input.taxAmount,
    total: input.total,
    created_by: user.id,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/pos");
  return { ok: true };
}

export interface HeldSaleSummary {
  id: string;
  customerName: string | null;
  itemCount: number;
  total: number;
  createdAt: string;
}

export async function listHeldSales(kind: HeldSaleKind): Promise<HeldSaleSummary[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = await createClient();
  let q = supabase
    .from("held_sales")
    .select("id, customer_name, items, total, created_at")
    .eq("org_id", context.orgId)
    .eq("kind", kind)
    .order("created_at", { ascending: false });

  if (context.isBranchScoped && context.allowedLocationIds.length > 0) {
    q = q.in("location_id", context.allowedLocationIds);
  }

  if (!context.canViewOtherTransactions) {
    q = q.eq("created_by", context.userId);
  }

  const { data } = await q;

  return (data ?? []).map((h) => ({
    id: h.id,
    customerName: h.customer_name,
    itemCount: Array.isArray(h.items) ? h.items.length : 0,
    total: h.total,
    createdAt: h.created_at,
  }));
}

export interface ResumedSale {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  customerPhone: string | null;
  orderNote: string | null;
  items: CartItemInput[];
}

export async function resumeHeldSale(id: string): Promise<ResumedSale | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("held_sales").select("*").eq("id", id).single();
  if (!data) return null;
  await supabase.from("held_sales").delete().eq("id", id);
  revalidatePath("/pos");
  return {
    locationId: data.location_id,
    customerId: data.customer_id,
    customerName: data.customer_name,
    customerPhone: data.customer_phone,
    orderNote: data.order_note,
    items: (data.items as CartItemInput[]) ?? [],
  };
}

export async function deleteHeldSale(id: string): Promise<SimpleResult> {
  await requirePermission("pos", "delete");
  const supabase = await createClient();
  const { error } = await supabase.from("held_sales").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/pos");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Complete Sale — the real thing: creates sales + sale_items and posts
// real stock deductions via the same location-aware RPC used everywhere
// else in the app.
// ---------------------------------------------------------------------------

export interface CompleteSaleInput {
  locationId: string;
  customerId: string | null;
  customerName: string | null;
  orderNote: string | null;
  items: CartItemInput[];
  discountAmount: number;
  shippingAmount: number;
  paymentMethod: string;
  saleDate: string; // 'YYYY-MM-DD' — sales.sale_date is a DATE column, no time component
  priceTier?: "retail" | "wholesale" | "vip" | "special";
  paymentAllocations?: Array<{ paymentMethod: string; accountId?: string | null; amount: number }>;
}

export interface CompleteSaleResult {
  ok: boolean;
  error?: string;
  saleId?: string;
}

export async function completeSale(input: CompleteSaleInput): Promise<CompleteSaleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  if (!input.locationId) return { ok: false, error: "Select a branch/location." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  if (!canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data: activeSession, error: sessionError } = await (supabase as any)
    .from("pos_register_sessions")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("cashier_id", user.id)
    .eq("location_id", input.locationId)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError) return { ok: false, error: "Could not verify that your register is open." };
  if (!activeSession) return { ok: false, error: "Open a register before processing a sale." };
  const { start, end } = startEndOfToday();
  const { data: activeClosures } = await supabase
    .from("register_closures")
    .select("location_id, scope, cashier_id")
    .eq("org_id", context.orgId)
    .eq("period_start", start)
    .eq("period_end", end)
    .in("status", ["approved", "pending_approval"]);
  if ((activeClosures ?? []).some((closure: { location_id: string | null; scope: "all" | "individual"; cashier_id: string | null }) =>
    (closure.location_id === null || closure.location_id === input.locationId) &&
    (closure.scope === "all" || closure.cashier_id === user.id)
  )) {
    return { ok: false, error: "Your register has been closed for today. Reopen it before making another sale." };
  }

  // Re-check stock at time of sale — the grid the cashier was looking at
  // may be a few seconds stale. IMPORTANT: this must check the SELECTED
  // BRANCH's stock, not products.stock_quantity (that's an org-wide total
  // across every branch now — see 20260805110000_product_stock_source_of_truth).
  // Checking the org-wide number let a sale go through when the org had
  // enough stock overall but not at this specific location, and the
  // location-scoped RPC below would then try to take that branch's row
  // negative and hit the DB's quantity >= 0 check constraint.
  //
  // A product with no product_stock_levels rows anywhere has never been
  // assigned to a branch (see the "untracked" note in that migration) — for
  // those only, fall back to the org-wide total rather than treating them
  // as zero-stock everywhere.
  const productIds = input.items.map((i) => i.productId);
  const [{ data: allStockRows }, { data: productRows }] = await Promise.all([
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").in("product_id", productIds),
    supabase.from("products").select("id, name, stock_quantity, cost_price, unit_price, wholesale_price, vip_price").in("id", productIds)
  ]);
  const orgWideById = new Map((productRows ?? []).map((p) => [p.id, p.stock_quantity]));
  const rowsByProduct = new Map<string, { location_id: string; quantity: number }[]>();
  for (const row of allStockRows ?? []) {
    const list = rowsByProduct.get(row.product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.product_id, list);
  }

  for (const item of input.items) {
    const rows = rowsByProduct.get(item.productId);
    const available = rows
      ? (rows.find((r) => r.location_id === input.locationId)?.quantity ?? 0)
      : context.isBranchScoped ? 0 : (orgWideById.get(item.productId) ?? 0);
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.name}" available at this branch.` };
    }
  }

  const lines = input.items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const lineDiscount = gross * (item.discountPercent / 100);
    const taxable = gross - lineDiscount;
    const lineTax = taxable * (item.taxPercent / 100);
    return { ...item, gross, lineTax, lineTotal: taxable + lineTax };
  });
  const productCosts = new Map((productRows ?? []).map((product) => [product.id, { name: product.name, cost: Number(product.cost_price ?? 0), prices: [product.unit_price, product.wholesale_price, product.vip_price] }]));
  const lowMarginItems = lines.filter((line) => productCosts.get(line.productId)?.prices.some((price) => price != null && Number(price) <= (productCosts.get(line.productId)?.cost ?? 0))).map((line) => ({
    productId: line.productId,
    productName: productCosts.get(line.productId)?.name ?? line.name,
    price: line.unitPrice,
    cost: productCosts.get(line.productId)?.cost ?? 0,
  }));

  const subtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  const itemsDiscount = lines.reduce((sum, l) => sum + (l.gross * l.discountPercent) / 100, 0);
  const tax = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const totalDiscount = itemsDiscount + Math.max(0, input.discountAmount);
  const shipping = Math.max(0, input.shippingAmount);
  const total = Math.max(0, subtotal - totalDiscount + tax + shipping);

  const { data: sale, error: saleError } = await supabase
    .from("sales")
    .insert({
      org_id: context.orgId,
      customer_name: input.customerName,
      customer_id: input.customerId,
      location_id: input.locationId,
      reference: input.orderNote,
      subtotal,
      discount_amount: totalDiscount,
      tax_amount: tax,
      shipping_amount: shipping,
      total,
      payment_method: input.paymentMethod,
      amount_paid: total, // POS sales are paid in full at the point of sale
      sold_by: user.id,
      register_session_id: activeSession.id,
      status: "completed",
      sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    })
    .select("id, sale_number")
    .single();

  if (saleError || !sale) return { ok: false, error: saleError?.message ?? "Couldn't create the sale." };
  const allocations = input.paymentAllocations?.filter((allocation) => Number.isFinite(allocation.amount) && allocation.amount > 0) ?? [];
  if (allocations.length) {
    const allocationTotal = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
    if (Math.abs(allocationTotal - total) > 0.01) {
      await supabase.from("sales").delete().eq("id", sale.id);
      return { ok: false, error: "Payment allocations must equal the sale total." };
    }
    const { error: allocationError } = await supabase.from("sale_payment_allocations").insert(
      allocations.map((allocation) => ({
        org_id: context.orgId,
        sale_id: sale.id,
        payment_method: allocation.paymentMethod,
        account_id: allocation.accountId ?? null,
        amount: allocation.amount,
      }))
    );
    if (allocationError) {
      await supabase.from("sales").delete().eq("id", sale.id);
      return { ok: false, error: allocationError.message };
    }
  }

  const { error: itemsError } = await supabase.from("sale_items").insert(
    lines.map((l) => ({
      sale_id: sale.id,
      product_id: l.productId,
      org_id: context.orgId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent,
      tax_percent: l.taxPercent,
      line_total: l.lineTotal,
    }))
  );
  if (itemsError) {
    await supabase.from("sales").delete().eq("id", sale.id);
    return { ok: false, error: itemsError.message };
  }
  if (lowMarginItems.length > 0) {
    const lowMarginAudit = await recordAuditEvent(supabase, {
      orgId: context.orgId,
      actorId: user.id,
      action: "sale.low_margin_flagged",
      entityType: "sale",
      entityId: sale.id,
      module: "Sales",
      description: `Low-margin items flagged on sale #${sale.sale_number}`,
      newValues: { price_tier: input.priceTier ?? "retail", items: lowMarginItems },
    });
    if (lowMarginAudit.error) return { ok: false, error: lowMarginAudit.error, saleId: sale.id };
  }

  // Untracked products (no product_stock_levels row anywhere) were validated
  // above against their org-wide total, but adjust_product_stock_at_location
  // does a plain upsert — for a product with zero rows, that would insert a
  // fresh row at exactly -quantity, hitting the same check constraint this
  // whole fix is for. Seed each untracked product at this location with its
  // org-wide total first, so the decrement below has something real to
  // subtract from. on conflict do nothing so a concurrent sale can't double-seed.
  const untrackedIds = context.isBranchScoped
    ? []
    : productIds.filter((id) => !rowsByProduct.has(id));
  if (untrackedIds.length > 0) {
    const seedRows = untrackedIds.map((id) => ({
      org_id: context.orgId,
      product_id: id,
      location_id: input.locationId,
      quantity: orgWideById.get(id) ?? 0
    }));
    await supabase.from("product_stock_levels").upsert(seedRows, { onConflict: "product_id,location_id", ignoreDuplicates: true });
  }

  for (const item of input.items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.productId,
      p_location_id: input.locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      // The RPC now locks the row and checks sufficiency itself (see the
      // 20260817090000 migration) — if this still fires, someone else's
      // sale took the remaining stock in the moment between this sale's
      // precheck above and this decrement. That's a real race, not a bug.
      const friendly = rpcError.message.includes("insufficient_stock")
        ? `Someone just sold the last unit(s) of "${item.name}" at this branch. Adjust the quantity and try again.`
        : `Sale saved, but stock update failed for one item: ${rpcError.message}`;
      return { ok: false, error: friendly, saleId: sale.id };
    }
  }

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId: sale.id };
}

// ---------------------------------------------------------------------------
// Edit an existing sale from the Recent Transactions list — loads it back
// into the POS cart panel, and posts an update (reconciling stock) instead
// of creating a new sale.
// ---------------------------------------------------------------------------

export interface EditableSale {
  locationId: string | null;
  customerId: string | null;
  customerName: string | null;
  paymentMethod: string;
  discountAmount: number;
  shippingAmount: number;
  saleDate: string;
  items: CartItemInput[];
}

export async function getSaleForEdit(saleId: string): Promise<EditableSale | null> {
  const supabase = await createClient();
  const { data: sale } = await supabase
    .from("sales")
    .select("location_id, customer_id, customer_name, payment_method, discount_amount, shipping_amount, sale_date")
    .eq("id", saleId)
    .single();
  if (!sale) return null;

  const { data: items } = await supabase
    .from("sale_items")
    .select("product_id, quantity, unit_price, discount_percent, tax_percent, products(name, sku)")
    .eq("sale_id", saleId);
  const itemDiscountTotal = (items ?? []).reduce((sum, item) => {
    const gross = Number(item.quantity) * Number(item.unit_price);
    return sum + gross * (Number(item.discount_percent ?? 0) / 100);
  }, 0);

  return {
    locationId: sale.location_id,
    customerId: sale.customer_id,
    customerName: sale.customer_name,
    paymentMethod: sale.payment_method ?? "Cash",
    // sales.discount_amount includes item-level discounts. The POS edit
    // field represents only the additional flat discount.
    discountAmount: Math.max(0, Number(sale.discount_amount ?? 0) - itemDiscountTotal),
    shippingAmount: sale.shipping_amount ?? 0,
    saleDate: sale.sale_date,
    items: (items ?? []).map((i) => {
      const product = Array.isArray(i.products) ? i.products[0] : i.products;
      return {
        productId: i.product_id,
        name: product?.name ?? "Unknown product",
        sku: product?.sku ?? "",
        unitPrice: i.unit_price,
        quantity: i.quantity,
        discountPercent: i.discount_percent,
        taxPercent: i.tax_percent,
      };
    }),
  };
}

export async function updateSale(saleId: string, input: CompleteSaleInput): Promise<CompleteSaleResult> {
  if (input.items.length === 0) return { ok: false, error: "Cart is empty." };
  if (!input.locationId) return { ok: false, error: "Select a branch/location." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };
  const { data: activeSession, error: sessionError } = await supabase
    .from("pos_register_sessions")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("cashier_id", user.id)
    .eq("location_id", input.locationId)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError) return { ok: false, error: "Could not verify that your register is open." };
  if (!activeSession) return { ok: false, error: "Open a register before editing a POS sale." };

  const { data: oldSale } = await supabase.from("sales").select("location_id, total, register_session_id").eq("id", saleId).single();
  if (!oldSale) return { ok: false, error: "Sale not found." };
  if (oldSale.register_session_id && (oldSale.register_session_id !== activeSession.id || oldSale.location_id !== input.locationId)) {
    return { ok: false, error: "This sale belongs to a different register session or branch and cannot be edited here." };
  }
  if (!canUseLocation(context, oldSale.location_id) || !canUseLocation(context, input.locationId)) {
    return { ok: false, error: "You are not assigned to this branch." };
  }
  const { data: oldItems } = await supabase.from("sale_items").select("product_id, quantity").eq("sale_id", saleId);

  // Same branch-aware precheck as a fresh sale, but the OLD quantities are
  // effectively "available again" first — someone editing a sale down
  // shouldn't be blocked by the very stock their own original sale used.
  const productIds = input.items.map((i) => i.productId);
  const [{ data: allStockRows }, { data: productRows }] = await Promise.all([
    supabase.from("product_stock_levels").select("product_id, location_id, quantity").in("product_id", productIds),
    supabase.from("products").select("id, stock_quantity").in("id", productIds)
  ]);
  const orgWideById = new Map((productRows ?? []).map((p) => [p.id, p.stock_quantity]));
  const rowsByProduct = new Map<string, { location_id: string; quantity: number }[]>();
  for (const row of allStockRows ?? []) {
    const list = rowsByProduct.get(row.product_id) ?? [];
    list.push(row);
    rowsByProduct.set(row.product_id, list);
  }
  const oldQtyByProduct = new Map((oldItems ?? []).map((i) => [i.product_id, i.quantity]));

  for (const item of input.items) {
    const rows = rowsByProduct.get(item.productId);
    const rawAvailable = rows
      ? (rows.find((r) => r.location_id === input.locationId)?.quantity ?? 0)
      : context.isBranchScoped ? 0 : (orgWideById.get(item.productId) ?? 0);
    // Only add back the old quantity if it was reserved at the SAME
    // location this edit is now posting to — otherwise it'll be returned
    // to the old location separately below, not this one.
    const reclaimable = oldSale.location_id === input.locationId ? (oldQtyByProduct.get(item.productId) ?? 0) : 0;
    const available = rawAvailable + reclaimable;
    if (item.quantity > available) {
      return { ok: false, error: `Only ${available} unit(s) of "${item.name}" available at this branch.` };
    }
  }

  // Reverse the original deduction at wherever it was originally sold from.
  if (oldSale.location_id) {
    for (const oldItem of oldItems ?? []) {
      await supabase.rpc("adjust_product_stock_at_location", {
        p_product_id: oldItem.product_id,
        p_location_id: oldSale.location_id,
        p_org_id: context.orgId,
        p_delta: oldItem.quantity,
      });
    }
  }

  const lines = input.items.map((item) => {
    const gross = item.quantity * item.unitPrice;
    const lineDiscount = gross * (item.discountPercent / 100);
    const taxable = gross - lineDiscount;
    const lineTax = taxable * (item.taxPercent / 100);
    return { ...item, gross, lineTax, lineTotal: taxable + lineTax };
  });
  const subtotal = lines.reduce((sum, l) => sum + l.gross, 0);
  const itemsDiscount = lines.reduce((sum, l) => sum + (l.gross * l.discountPercent) / 100, 0);
  const tax = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const totalDiscount = itemsDiscount + Math.max(0, input.discountAmount);
  const shipping = Math.max(0, input.shippingAmount);
  const total = Math.max(0, subtotal - totalDiscount + tax + shipping);

  const { error: updateError } = await supabase
    .from("sales")
    .update({
      customer_name: input.customerName,
      customer_id: input.customerId,
      location_id: input.locationId,
      register_session_id: activeSession.id,
      subtotal,
      discount_amount: totalDiscount,
      tax_amount: tax,
      shipping_amount: shipping,
      total,
      payment_method: input.paymentMethod,
      amount_paid: total,
      sale_date: input.saleDate || new Date().toISOString().slice(0, 10),
    })
    .eq("id", saleId);
  if (updateError) return { ok: false, error: updateError.message };

  const admin = createAdminClient();
  const { error: deleteItemsError, count: deletedItems } = await admin
    .from("sale_items")
    .delete({ count: "exact" })
    .eq("sale_id", saleId)
    .eq("org_id", context.orgId);
  if (deleteItemsError) return { ok: false, error: deleteItemsError.message };
  if ((deletedItems ?? 0) !== (oldItems ?? []).length) {
    return { ok: false, error: "The existing sale items could not be replaced safely." };
  }
  const { error: itemsError } = await admin.from("sale_items").insert(
    lines.map((l) => ({
      sale_id: saleId,
      product_id: l.productId,
      org_id: context.orgId,
      quantity: l.quantity,
      unit_price: l.unitPrice,
      discount_percent: l.discountPercent,
      tax_percent: l.taxPercent,
      line_total: l.lineTotal,
    }))
  );
  if (itemsError) return { ok: false, error: itemsError.message };

  const untrackedIds = productIds.filter((id) => !rowsByProduct.has(id));
  if (untrackedIds.length > 0) {
    const seedRows = untrackedIds.map((id) => ({
      org_id: context.orgId,
      product_id: id,
      location_id: input.locationId,
      quantity: orgWideById.get(id) ?? 0
    }));
    await supabase.from("product_stock_levels").upsert(seedRows, { onConflict: "product_id,location_id", ignoreDuplicates: true });
  }

  for (const item of input.items) {
    const { error: rpcError } = await supabase.rpc("adjust_product_stock_at_location", {
      p_product_id: item.productId,
      p_location_id: input.locationId,
      p_org_id: context.orgId,
      p_delta: -item.quantity,
    });
    if (rpcError) {
      const friendly = rpcError.message.includes("insufficient_stock")
        ? `Someone just sold the last unit(s) of "${item.name}" at this branch. Adjust the quantity and try again.`
        : `Sale updated, but stock adjustment failed for one item: ${rpcError.message}`;
      return { ok: false, error: friendly, saleId };
    }
  }

  const totalDelta = Number(total) - Number(oldSale.total ?? 0);
  if (Math.abs(totalDelta) > 0.005) {
    const accounts = await resolveOperationalAccounts(supabase, context.orgId, "sale");
    if (accounts.error || !accounts.debitAccountId || !accounts.creditAccountId) {
      console.error("Automatic POS edit journal was not posted:", accounts.error ?? "Sales accounts are not configured.");
    } else {
      const amount = Math.abs(totalDelta);
      const journal = await postOperationalJournal(supabase, {
        orgId: context.orgId,
        actorId: user.id,
        sourceModule: "pos_edit",
        sourceId: `${saleId}:${input.saleDate ?? new Date().toISOString().slice(0, 10)}:${total.toFixed(2)}`,
        date: input.saleDate || new Date().toISOString().slice(0, 10),
        locationId: input.locationId,
        reference: `POS-EDIT-${saleId}`,
        description: "POS sale edit adjustment",
        lines: totalDelta > 0
          ? [
              { account_id: accounts.debitAccountId, description: "Additional POS sale proceeds", debit: amount, credit: 0 },
              { account_id: accounts.creditAccountId, description: "Additional sales revenue", debit: 0, credit: amount },
            ]
          : [
              { account_id: accounts.creditAccountId, description: "Reduced sales revenue", debit: amount, credit: 0 },
              { account_id: accounts.debitAccountId, description: "Reduced POS sale proceeds", debit: 0, credit: amount },
            ],
      });
      if (journal.error) console.error("Automatic POS edit journal was not posted:", journal.error);
    }
  }

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath("/inventory");
  return { ok: true, saleId };
}