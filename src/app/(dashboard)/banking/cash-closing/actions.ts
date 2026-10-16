"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission, canTabPermission, requireTabPermission } from "@/lib/rbac/permissions";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { headers } from "next/headers";
import { postOperationalJournal } from "@/lib/accounting/post-operational-journal";
import { businessDateInTimeZone, getCashClosingPeriod, type CashClosingShiftWindow } from "./shift-time";

export type CashSummary = { opening: number; sales: number; totalSales: number; discounts: number; creditSales: number; customerPayments: number; customerElectronicPayments: number; electronic: number; electronicBreakdown: Record<string, number>; refunds: number; expenses: number; deposits: number; withdrawals: number; posCashIn: number; posCashOut: number; posRegisterSessionCount: number; expected: number };
const n = (v: unknown) => Number(v ?? 0) || 0;
function electronicPaymentAmounts(method: string) {
  const match = method.match(/^split\s*\((.*)\)\s*$/i);
  if (!match) return [];
  const details: Array<{ method: string; amount: number }> = [];
  const paymentPattern = /\b(mobile money|momo|e-cash|electronic|card|bank transfer|cheque|check|wallet|online|other)\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/gi;
  for (const payment of match[1].matchAll(paymentPattern)) {
    const label = payment[1].toLowerCase();
    details.push({
      method: /momo|mobile money/.test(label) ? "MoMo"
        : /card/.test(label) ? "Card"
          : /bank transfer/.test(label) ? "Bank Transfer"
            : /cheque|check/.test(label) ? "Cheque"
              : /wallet/.test(label) ? "Wallet"
                : /online/.test(label) ? "Online"
                  : /e-cash|electronic/.test(label) ? "E-cash" : "Etc.",
      amount: n(payment[2]),
    });
  }
  return details;
}
function splitAmount(method: unknown, bucket: "cash" | "electronic") {
  const value = String(method ?? "");
  if (bucket === "electronic") {
    const details = electronicPaymentAmounts(value);
    return /^split\s*\(/i.test(value)
      ? details.filter((payment) => payment.method === "E-cash" || payment.method === "MoMo")
        .reduce((total, payment) => total + payment.amount, 0)
      : null;
  }
  const match = value.match(/^split\s*\((.*)\)\s*$/i);
  if (!match) return null;
  return [...match[1].matchAll(/(?:^|[^a-z-])cash\s*[:=]?\s*([-+]?\d+(?:\.\d+)?)/gi)].reduce((total, part) => total + n(part[1]), 0);
}
const isCashMethod = (method: string) => /\bcash\b/i.test(method) && !/e-cash/i.test(method);
const isElectronicMethod = (method: string) => /momo|mobile money|e-cash|electronic|card|bank transfer|cheque|check|wallet|online|other/i.test(method);
const paymentAmount = (sale: Record<string, unknown>) => n(sale.amount_paid ?? sale.total);
async function auditContext() {
  const h = await headers();
  return { device: h.get("user-agent") ?? "unknown", ip_address: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown" };
}

async function postCashClosingVarianceJournal(db: any, closing: { id: string; org_id: string; location_id: string | null; closing_date: string; variance: number; classification: string }, actorId: string) {
  const variance = Number(closing.variance ?? 0);
  if (Math.abs(variance) <= 0.005) return;
  const { data: accounts, error } = await db
    .from("accounting_accounts")
    .select("id, name, type")
    .eq("org_id", closing.org_id)
    .eq("is_active", true);
  if (error) {
    console.error("Automatic cash closing journal was not posted:", error.message);
    return;
  }
  const cashAccount = (accounts ?? []).find((account: { name: string; type: string }) =>
    account.type === "asset" && /cash|bank/i.test(account.name),
  );
  const varianceAccount = (accounts ?? []).find((account: { name: string; type: string }) =>
    (account.type === "expense" || account.type === "revenue") && /cash|short|over|variance|adjust/i.test(account.name),
  ) ?? (accounts ?? []).find((account: { type: string }) => account.type === "expense");
  if (!cashAccount || !varianceAccount) {
    console.error("Automatic cash closing journal was not posted: configure a cash and variance account.");
    return;
  }
  const amount = Math.abs(variance);
  const journal = await postOperationalJournal(db, {
    orgId: closing.org_id,
    actorId,
    sourceModule: "cash_closing",
    sourceId: closing.id,
    date: closing.closing_date,
    locationId: closing.location_id,
    reference: `CASH-CLOSING-${closing.id}`,
    description: `Cash closing ${closing.classification} variance`,
    lines: variance > 0
      ? [
          { account_id: cashAccount.id, description: "Cash closing excess", debit: amount, credit: 0 },
          { account_id: varianceAccount.id, description: "Cash closing excess variance", debit: 0, credit: amount },
        ]
      : [
          { account_id: varianceAccount.id, description: "Cash closing shortage variance", debit: amount, credit: 0 },
          { account_id: cashAccount.id, description: "Cash closing shortage", debit: 0, credit: amount },
        ],
  });
  if (journal.error) console.error("Automatic cash closing journal was not posted:", journal.error);
}

export async function logCashClosingAction(closingId: string | null, action: "exported" | "printed") {
  const ctx = await getCurrentOrgContext();
  if (!ctx || !closingId) return { error: "Closing record not found." };
  const permissionAction = action === "exported" ? "export" : "print";
  if (!await canPermission("cash_closing", permissionAction) || !await canTabPermission("banking", "banking", "reconciliation", permissionAction)) {
    return { error: `You do not have permission to ${action === "exported" ? "export" : "print"} cash closings.` };
  }
  const db = await createClient() as any;
  const { data: closing, error: lookupError } = await db.from("cash_closings")
    .select("id, org_id, location_id, created_by")
    .eq("id", closingId)
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!closing || (closing.location_id && !canAccessLocation(ctx, closing.location_id))
    || (!ctx.canViewOtherTransactions && closing.created_by !== ctx.userId)) {
    return { error: "You cannot access this closing." };
  }
  const { error } = await db.from("cash_closing_audit").insert({
    closing_id: closingId, org_id: ctx.orgId, location_id: closing.location_id,
    action, actor_id: ctx.userId, ...(await auditContext()),
  });
  return error ? { error: error.message } : { success: true };
}

export async function logCashClosingActions(closingIds: string[], action: "exported" | "printed") {
  const ctx = await getCurrentOrgContext();
  const uniqueIds = [...new Set(closingIds)];
  if (!ctx || !uniqueIds.length) return { error: "No closing records were selected." };
  const permissionAction = action === "exported" ? "export" : "print";
  if (!await canPermission("cash_closing", permissionAction) || !await canTabPermission("banking", "banking", "reconciliation", permissionAction)) {
    return { error: `You do not have permission to ${action === "exported" ? "export" : "print"} cash closings.` };
  }
  const db = await createClient() as any;
  const auditMetadata = await auditContext();
  for (let offset = 0; offset < uniqueIds.length; offset += 500) {
    const batchIds = uniqueIds.slice(offset, offset + 500);
    const { data: closings, error: lookupError } = await db.from("cash_closings")
      .select("id, org_id, location_id, created_by")
      .eq("org_id", ctx.orgId)
      .in("id", batchIds);
    if (lookupError) return { error: lookupError.message };
    if ((closings ?? []).length !== batchIds.length || (closings ?? []).some((closing: { location_id: string | null; created_by: string }) =>
      (closing.location_id && !canAccessLocation(ctx, closing.location_id))
      || (!ctx.canViewOtherTransactions && closing.created_by !== ctx.userId))) {
      return { error: "You cannot access one or more selected closings." };
    }
    const { error } = await db.from("cash_closing_audit").insert((closings ?? []).map((closing: { id: string; location_id: string | null }) => ({
      closing_id: closing.id,
      org_id: ctx.orgId,
      location_id: closing.location_id,
      action,
      actor_id: ctx.userId,
      ...auditMetadata,
    })));
    if (error) return { error: error.message };
  }
  return { success: true };
}

export async function updateCashClosingBranchSchedule(input: {
  locationId: string;
  requiredShifts: string[];
  shiftWindows: Record<string, { start: string; end: string }>;
  timeZone: string | null;
}) {
  const ctx = await getCurrentOrgContext();
  if (!ctx || !await canPermission("settings", "edit") || !await canTabPermission("banking", "banking", "reconciliation", "edit")) {
    return { error: "You do not have permission to update branch closing schedules." };
  }
  const validShifts = new Set(["full_day", "morning", "afternoon", "night"]);
  const shifts = Array.isArray(input.requiredShifts) ? [...new Set(input.requiredShifts)] : [];
  if (!input.locationId || !shifts.length || shifts.some((shift) => !validShifts.has(shift))
    || (shifts.includes("full_day") && shifts.length > 1)) {
    return { error: "Choose full day or one or more valid shift closings." };
  }
  if (!input.shiftWindows || typeof input.shiftWindows !== "object"
    || Object.keys(input.shiftWindows).some((shift) => !["morning", "afternoon", "night"].includes(shift))) {
    return { error: "Provide valid time windows for the branch shifts." };
  }
  const shiftWindows: Record<string, { start: string; end: string }> = {};
  for (const [shift, window] of Object.entries(input.shiftWindows)) {
    if (!window || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.start)
      || !/^([01]\d|2[0-3]):[0-5]\d$/.test(window.end)
      || window.start === window.end) {
      return { error: `Set a valid, non-zero time window for the ${shift} shift.` };
    }
    shiftWindows[shift] = { start: window.start, end: window.end };
  }
  const timeZone = input.timeZone?.trim() || null;
  if (timeZone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    } catch (error) {
      if (error instanceof RangeError) return { error: "Enter a valid IANA timezone, such as Africa/Accra or Europe/London." };
      throw error;
    }
  }
  for (const shift of shifts.filter((value) => value !== "full_day")) {
    if (!shiftWindows[shift]) {
      return { error: `Set a valid, non-zero time window for the ${shift} shift.` };
    }
  }

  const db = await createClient() as any;
  const { data: location, error: locationError } = await db.from("business_locations")
    .select("id")
    .eq("id", input.locationId)
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (locationError) return { error: locationError.message };
  if (!location || !canAccessLocation(ctx, input.locationId)) {
    return { error: "The selected branch is not available to you." };
  }

  const { error } = await db.from("cash_closing_branch_schedules").upsert({
    org_id: ctx.orgId,
    location_id: input.locationId,
    required_shifts: shifts,
    shift_windows: shiftWindows,
    time_zone: timeZone,
    updated_by: ctx.userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: "location_id" });
  if (error) return { error: error.message };

  revalidatePath("/banking/cash-closing");
  return { success: true };
}

export async function acknowledgeMissedCashClosing(input: { locationId: string; closingDate: string; shift: string }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx || !await canPermission("settings", "edit") || !await canTabPermission("banking", "banking", "reconciliation", "edit")) {
    return { error: "You do not have permission to acknowledge missed branch closings." };
  }
  const validShifts = new Set(["full_day", "morning", "afternoon", "night"]);
  const parsedClosingDate = new Date(`${input.closingDate}T00:00:00.000Z`);
  if (!input.locationId || !validShifts.has(input.shift)
    || !/^\d{4}-\d{2}-\d{2}$/.test(input.closingDate)
    || Number.isNaN(parsedClosingDate.getTime())
    || parsedClosingDate.toISOString().slice(0, 10) !== input.closingDate) {
    return { error: "The missed closing details are invalid." };
  }
  if (!canAccessLocation(ctx, input.locationId)) {
    return { error: "You are not assigned to this branch." };
  }

  const db = await createClient() as any;
  const { data: location, error: locationError } = await db.from("business_locations")
    .select("id")
    .eq("id", input.locationId)
    .eq("org_id", ctx.orgId)
    .eq("is_active", true)
    .maybeSingle();
  if (locationError) return { error: locationError.message };
  if (!location) return { error: "The selected branch is not available." };

  const [{ data: schedule, error: scheduleError }, { data: organizationSettings, error: settingsError }] = await Promise.all([
    db.from("cash_closing_branch_schedules")
      .select("required_shifts, shift_windows, time_zone, tracking_started_on")
      .eq("org_id", ctx.orgId)
      .eq("location_id", input.locationId)
      .maybeSingle(),
    db.from("org_general_settings").select("timezone").eq("org_id", ctx.orgId).maybeSingle(),
  ]);
  if (scheduleError) return { error: scheduleError.message };
  if (settingsError) return { error: `Could not load the organization timezone: ${settingsError.message}` };
  if (schedule?.tracking_started_on && input.closingDate < schedule.tracking_started_on) {
    return { error: "This date is outside the branch's missed-closing tracking period." };
  }
  const requiredShifts = schedule?.required_shifts ?? ["full_day"];
  if (!requiredShifts.includes(input.shift)) {
    return { error: "This shift is not required by the branch schedule." };
  }
  const timeZone = schedule?.time_zone || organizationSettings?.timezone || "UTC";
  let period;
  try {
    period = getCashClosingPeriod(
      input.closingDate,
      input.shift,
      timeZone,
      input.shift === "full_day" ? undefined : schedule?.shift_windows?.[input.shift],
    );
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not determine the closing period." };
  }
  if (period.end > new Date()) return { error: "A closing can only be acknowledged after its scheduled period has ended." };

  const { data: closings, error: closingsError } = await db.from("cash_closings")
    .select("id, status, shift")
    .eq("org_id", ctx.orgId)
    .eq("location_id", input.locationId)
    .eq("closing_date", input.closingDate)
    .eq("shift", input.shift);
  if (closingsError) return { error: closingsError.message };
  if ((closings ?? []).some((closing: { status: string; shift: string | null }) =>
    (closing.shift === input.shift || (input.shift === "full_day" && !closing.shift))
    && !["reopened", "rejected"].includes(closing.status))) {
    return { error: "This shift already has a recorded closing and does not need acknowledgement." };
  }

  const { error: acknowledgementError } = await db.from("cash_closing_missed_shift_acknowledgements").upsert({
    org_id: ctx.orgId,
    location_id: input.locationId,
    closing_date: input.closingDate,
    shift: input.shift,
    acknowledged_by: ctx.userId,
    acknowledged_at: new Date().toISOString(),
  }, { onConflict: "location_id,closing_date,shift" });
  if (acknowledgementError) return { error: acknowledgementError.message };

  revalidatePath("/banking/cash-closing");
  return { success: true };
}

export async function calculateExpectedCash(date: string, locationId?: string | null, shift = "full_day", userId?: string | null, shiftWindow?: CashClosingShiftWindow, timeZone = "UTC"): Promise<CashSummary> {
  await requireTabPermission("banking", "banking", "reconciliation", "view");
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Session expired");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
    throw new Error("A valid business date is required.");
  }
  if (locationId && !canAccessLocation(ctx, locationId)) {
    throw new Error("You are not assigned to this branch.");
  }
  if (userId && !ctx.canViewOtherTransactions && userId !== ctx.userId) {
    throw new Error("You cannot view another user's transactions.");
  }
  const db = await createClient() as any;
  const scoped = (q: any): any => {
    if (locationId) return q.eq("location_id", locationId);
    if (ctx.isBranchScoped) return q.in("location_id", ctx.allowedLocationIds);
    return q;
  };
  const { start, end } = getCashClosingPeriod(date, shift, timeZone, shiftWindow);
  const dayStart = start.toISOString();
  const dayEnd = end.toISOString();
  const dayEndInclusive = new Date(end.getTime() - 1).toISOString();
  const salesDayFilter = `or(and(created_at.gte.${dayStart},created_at.lte.${dayEndInclusive}),and(status_changed_at.gte.${dayStart},status_changed_at.lte.${dayEndInclusive}))`;
  let salesQuery = scoped(db.from("sales").select("total, discount_amount, amount_paid, refunded_amount, payment_method, refund_payment_method, refund_register_session_id, status, created_at, status_changed_at, sold_by").eq("org_id", ctx.orgId).in("status", ["completed", "returned"]).or(salesDayFilter));
  let expenseQuery = scoped(db.from("expenses").select("amount, payment_method, payment_status, paid_on, expense_date, recorded_by, created_at").eq("org_id", ctx.orgId).eq("payment_status", "paid"));
  let customerPaymentQuery = scoped(db.from("customer_credit_payments").select("amount, payment_method, recorded_by, created_at").eq("org_id", ctx.orgId));
  if (shift === "full_day") {
    expenseQuery = expenseQuery.or(`expense_date.eq.${date},paid_on.eq.${date}`);
    customerPaymentQuery = customerPaymentQuery.eq("payment_date", date);
  } else {
    expenseQuery = expenseQuery.gte("created_at", dayStart).lt("created_at", dayEnd);
    customerPaymentQuery = customerPaymentQuery.gte("created_at", dayStart).lt("created_at", dayEnd);
  }
  if (userId) {
    salesQuery = salesQuery.eq("sold_by", userId);
    expenseQuery = expenseQuery.eq("recorded_by", userId);
    customerPaymentQuery = customerPaymentQuery.eq("recorded_by", userId);
  }
  let posMovementQuery = db.from("pos_cash_movements")
    .select("movement_type, amount")
    .eq("org_id", ctx.orgId)
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd);
  let posSessionQuery = db.from("pos_register_sessions")
    .select("id, opening_cash", { count: "exact" })
    .eq("org_id", ctx.orgId)
    .gte("opened_at", dayStart)
    .lt("opened_at", dayEnd);
  posMovementQuery = scoped(posMovementQuery);
  posSessionQuery = scoped(posSessionQuery);
  if (userId) {
    posMovementQuery = posMovementQuery.eq("created_by", userId);
    posSessionQuery = posSessionQuery.eq("cashier_id", userId);
  }
  const [salesResult, expenseResult, customerPaymentResult, posMovementResult, posSessionResult] = await Promise.all([
    salesQuery, expenseQuery, customerPaymentQuery, posMovementQuery, posSessionQuery,
  ]);
  if (salesResult.error) throw new Error(`Could not load sales for cash closing: ${salesResult.error.message}`);
  if (expenseResult.error) throw new Error(`Could not load expenses for cash closing: ${expenseResult.error.message}`);
  if (customerPaymentResult.error) throw new Error(`Could not load customer payments for cash closing: ${customerPaymentResult.error.message}`);
  if (posMovementResult.error) throw new Error(`Could not load POS drawer movements: ${posMovementResult.error.message}`);
  if (posSessionResult.error) throw new Error(`Could not load POS register sessions: ${posSessionResult.error.message}`);
  const sales = salesResult.data ?? [];
  const expenses = expenseResult.data ?? [];
  const customerPayments = customerPaymentResult.data ?? [];
  const posMovements = posMovementResult.data ?? [];
  const saleDateRows = sales.filter((sale: Record<string, unknown>) => {
    const createdAt = Date.parse(String(sale.created_at ?? ""));
    return Number.isFinite(createdAt) && createdAt >= start.getTime() && createdAt < end.getTime();
  });
  const totalSales = saleDateRows
    .filter((sale: Record<string, unknown>) => sale.status === "completed" || sale.status === "returned")
    .reduce((total: number, sale: Record<string, unknown>) => total + n(sale.total), 0);
  const cashSales = saleDateRows.reduce((total: number, sale: Record<string, unknown>) => {
    const method = String(sale.payment_method ?? "");
    const splitCash = splitAmount(method, "cash");
    if (splitCash !== null) return total + splitCash;
    return total + (isCashMethod(method) ? paymentAmount(sale) : 0);
  }, 0);
  const discounts = saleDateRows.reduce((a: number, s: Record<string, unknown>) => a + n(s.discount_amount), 0);
  const creditSales = saleDateRows
    .filter((sale: Record<string, unknown>) => sale.status === "completed")
    .reduce((total: number, sale: Record<string, unknown>) => total + Math.max(0, n(sale.total) - n(sale.amount_paid)), 0);
  const electronicSales = saleDateRows.reduce((total: number, sale: Record<string, unknown>) => {
    const method = String(sale.payment_method ?? "");
    const splitElectronic = splitAmount(method, "electronic");
    if (splitElectronic !== null) return total + splitElectronic;
    return total + (/momo|mobile money|e-cash|electronic/i.test(method) ? paymentAmount(sale) : 0);
  }, 0);
  const electronicBreakdown = saleDateRows.reduce((breakdown: Record<string, number>, sale: Record<string, unknown>) => {
    const method = String(sale.payment_method ?? "");
    const splitDetails = electronicPaymentAmounts(method);
    if (splitDetails.length) {
      for (const payment of splitDetails) breakdown[payment.method] = (breakdown[payment.method] ?? 0) + payment.amount;
      return breakdown;
    }
    if (isElectronicMethod(method)) {
      const label = /momo|mobile money/i.test(method) ? "MoMo"
        : /card/i.test(method) ? "Card"
          : /bank transfer/i.test(method) ? "Bank Transfer"
            : /cheque|check/i.test(method) ? "Cheque"
              : /wallet/i.test(method) ? "Wallet"
                : /online/i.test(method) ? "Online" : /e-cash|electronic/i.test(method) ? "E-cash" : "Etc.";
      breakdown[label] = (breakdown[label] ?? 0) + paymentAmount(sale);
    }
    return breakdown;
  }, {});
  const refunds = sales
    .filter((s: Record<string, unknown>) => s.status === "returned" && !s.refund_register_session_id && isCashMethod(String(s.refund_payment_method ?? s.payment_method ?? "")))
    .filter((s: Record<string, unknown>) => {
      const statusChangedAt = Date.parse(String(s.status_changed_at ?? ""));
      return Number.isFinite(statusChangedAt) && statusChangedAt >= start.getTime() && statusChangedAt < end.getTime();
    })
    .reduce((a: number, s: Record<string, unknown>) => a + n(s.refunded_amount), 0);
  const cashExpenses = (expenses ?? [])
    .filter((e: Record<string, unknown>) => {
      const createdAt = Date.parse(String(e.created_at ?? ""));
      const inShift = shift !== "full_day" && Number.isFinite(createdAt) && createdAt >= start.getTime() && createdAt < end.getTime();
      const paidDate = String(e.paid_on ?? e.expense_date ?? "");
      return (inShift || (shift === "full_day" && paidDate === date)) && isCashMethod(String(e.payment_method ?? "cash"));
    })
    .reduce((a: number, e: Record<string, unknown>) => a + n(e.amount), 0);
  const customerCashPayments = customerPayments
    .filter((p: Record<string, unknown>) => isCashMethod(String(p.payment_method ?? "")))
    .reduce((a: number, p: Record<string, unknown>) => a + n(p.amount), 0);
  const customerElectronicPayments = customerPayments
    .filter((p: Record<string, unknown>) => isElectronicMethod(String(p.payment_method ?? "")))
    .reduce((a: number, p: Record<string, unknown>) => a + n(p.amount), 0);
  const opening = (posSessionResult.data ?? []).reduce((total: number, session: Record<string, unknown>) => total + n(session.opening_cash), 0);
  const posCashIn = posMovements.reduce((sum: number, movement: Record<string, unknown>) => sum + (movement.movement_type === "cash_in" ? n(movement.amount) : 0), 0);
  const posCashOut = posMovements.reduce((sum: number, movement: Record<string, unknown>) => sum + (movement.movement_type !== "cash_in" ? n(movement.amount) : 0), 0);
  return {
    opening,
    sales: cashSales,
    totalSales,
    discounts,
    creditSales,
    customerPayments: customerCashPayments,
    customerElectronicPayments,
    electronic: electronicSales,
    electronicBreakdown,
    refunds,
    expenses: cashExpenses,
    deposits: 0,
    withdrawals: 0,
    posCashIn,
    posCashOut,
    posRegisterSessionCount: posSessionResult.count ?? 0,
    expected: opening + cashSales + customerCashPayments - refunds - cashExpenses + posCashIn - posCashOut,
  };
}

export async function createCashClosing(formData: FormData) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/banking/cash-closing?error=Session%20expired");
  if (!await canPermission("cash_closing", "create") || !await canTabPermission("banking", "banking", "reconciliation", "create")) redirect("/banking/cash-closing?error=Permission%20required");
  const date = String(formData.get("closing_date") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const actual = n(formData.get("actual_cash"));
  const shift = String(formData.get("shift") ?? "full_day");
  const notesCount = n(formData.get("notes_count"));
  const coinCount = n(formData.get("coin_count"));
  const varianceReason = String(formData.get("variance_reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`)) || actual < 0) {
    redirect("/banking/cash-closing?error=Enter%20a%20valid%20date%20and%20cash");
  }
  if (ctx.isBranchScoped && !locationId) {
    redirect("/banking/cash-closing?error=Select%20an%20assigned%20branch");
  }
  if (locationId && !canAccessLocation(ctx, locationId)) {
    redirect("/banking/cash-closing?error=You%20are%20not%20assigned%20to%20this%20branch");
  }
  let shiftWindow: CashClosingShiftWindow | undefined;
  const defaultWindows: Record<string, CashClosingShiftWindow> = {
    morning: { start: "06:00", end: "14:00" },
    afternoon: { start: "14:00", end: "22:00" },
    night: { start: "22:00", end: "06:00" },
  };
  let timeZone = "UTC";
  let branchSchedule: { time_zone?: string; shift_windows?: Record<string, CashClosingShiftWindow> } | null = null;
  const settingsDb = await createClient() as any;
  const { data: organizationSettings, error: organizationSettingsError } = await settingsDb.from("org_general_settings")
    .select("timezone")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  if (organizationSettingsError) {
    redirect(`/banking/cash-closing?error=${encodeURIComponent(`Could not load the organization timezone: ${organizationSettingsError.message}`)}`);
  }
  timeZone = organizationSettings?.timezone || "UTC";
  if (locationId) {
    const scheduleDb = await createClient() as any;
    const { data: schedule, error: scheduleError } = await scheduleDb.from("cash_closing_branch_schedules")
      .select("time_zone, shift_windows")
      .eq("org_id", ctx.orgId)
      .eq("location_id", locationId)
      .maybeSingle();
    if (scheduleError) redirect(`/banking/cash-closing?error=${encodeURIComponent(`Could not load branch shift settings: ${scheduleError.message}`)}`);
    branchSchedule = schedule;
    timeZone = schedule?.time_zone || timeZone;
  }
  if (shift !== "full_day") {
    if (!defaultWindows[shift]) redirect("/banking/cash-closing?error=Select%20a%20valid%20shift");
    shiftWindow = branchSchedule?.shift_windows?.[shift] ?? defaultWindows[shift];
  }
  const { start, end } = getCashClosingPeriod(date, shift, timeZone, shiftWindow);
  const overrideRequested = formData.get("override_open_register") === "on";
  const overrideReason = String(formData.get("open_register_override_reason") ?? "").trim();
  const registerDb = await createClient() as any;
  let openRegistersQuery = registerDb.from("pos_register_sessions")
    .select("id, location_id, register_name, cashier_id, cashier_name, opened_at")
    .eq("org_id", ctx.orgId)
    .eq("status", "open")
    .lt("opened_at", end.toISOString());
  if (locationId) {
    openRegistersQuery = openRegistersQuery.eq("location_id", locationId);
  } else if (ctx.isBranchScoped) {
    openRegistersQuery = openRegistersQuery.in("location_id", ctx.allowedLocationIds);
  }
  const { data: openRegisters, error: openRegistersError } = await openRegistersQuery;
  const closingContext = new URLSearchParams({
    tab: "today",
    business_date: date,
    close_shift: shift,
    ...(locationId ? { location_id: locationId } : {}),
  }).toString();
  if (openRegistersError) {
    redirect(`/banking/cash-closing?${closingContext}&error=${encodeURIComponent(`Could not verify open POS registers: ${openRegistersError.message}`)}#declare-cash`);
  }
  const unresolvedRegisters = openRegisters ?? [];
  let openRegisterOverride: { reason: string; sessionIds: string[] } | null = null;
  if (unresolvedRegisters.length) {
    if (!overrideRequested) {
      redirect(`/banking/cash-closing?${closingContext}&error=${encodeURIComponent("Close all POS registers for this period before completing the end-of-day account, or ask an authorized manager to override with a reason.")}#declare-cash`);
    }
    if (!await canPermission("cash_closing", "approve") || !await canTabPermission("banking", "banking", "reconciliation", "approve")) {
      redirect(`/banking/cash-closing?${closingContext}&error=${encodeURIComponent("Manager approval permission is required to override open POS registers.")}#declare-cash`);
    }
    if (overrideReason.length < 5) {
      redirect(`/banking/cash-closing?${closingContext}&error=${encodeURIComponent("Enter a reason of at least 5 characters for the open-register override.")}#declare-cash`);
    }
    openRegisterOverride = { reason: overrideReason, sessionIds: unresolvedRegisters.map((session: { id: string }) => session.id) };
  }
  const summary = await calculateExpectedCash(date, locationId, shift, ctx.canViewOtherTransactions ? null : ctx.userId, shiftWindow, timeZone);
  const variance = Number((actual - summary.expected).toFixed(2));
  if (Math.abs(variance) > 0.005 && !varianceReason) redirect("/banking/cash-closing?error=Variance%20reason%20is%20required");
  const classification = variance === 0 ? "balanced" : variance > 0 ? "excess" : "shortage";
  const db = await createClient() as any;
  const { data: setting } = await db.from("cash_closing_settings").select("variance_approval_enabled, variance_threshold").eq("org_id", ctx.orgId).maybeSingle();
  const threshold = n(setting?.variance_threshold) || 50;
  const approvalRequired = Boolean(setting?.variance_approval_enabled ?? true) && Math.abs(variance) > threshold;
  const { data: closing, error } = await db.from("cash_closings").insert({
    org_id: ctx.orgId, location_id: locationId, closing_date: date, period_start: start.toISOString(), period_end: new Date(end.getTime() - 1).toISOString(),
    opening_cash: summary.opening, cash_sales: summary.sales, total_sales: summary.totalSales, credit_sales: summary.creditSales, cash_receipts: summary.creditSales, cash_customer_payments: summary.customerPayments, cash_customer_e_cash: summary.customerElectronicPayments, cash_e_cash: summary.electronic, cash_refunds: summary.refunds, cash_expenses: summary.expenses,
    deposits: summary.deposits, withdrawals: summary.withdrawals, pos_cash_in: summary.posCashIn, pos_cash_out: summary.posCashOut,
    pos_register_session_count: summary.posRegisterSessionCount, expected_cash: summary.expected, actual_cash: actual, variance, classification,
    variance_reason: varianceReason || null, notes: notes || null, comments: notes || null, shift,
    coin_breakdown: { notes: notesCount, coins: coinCount }, created_by: ctx.userId, staff_id: ctx.userId,
    approval_threshold: threshold, approval_required: approvalRequired,
    status: approvalRequired ? "pending_approval" : "approved",
    approval_decision: approvalRequired ? null : "approved",
    approved_by: approvalRequired ? null : ctx.userId,
    approved_at: approvalRequired ? null : new Date().toISOString(),
    submitted_at: new Date().toISOString(),
    closed_at: new Date().toISOString(),
  }).select("id").single();
  if (error || !closing) redirect(`/banking/cash-closing?error=${encodeURIComponent(error?.message ?? "Could not save closing")}`);
  const audit = await auditContext();
  const denominations = [1, 2, 5, 10, 20, 50, 100, 200].flatMap((denomination) => {
    const quantity = Math.max(0, Math.floor(n(formData.get(`denomination_${denomination}`))));
    return quantity ? [{ closing_id: closing.id, org_id: ctx.orgId, denomination, quantity }] : [];
  });
  const customDenominations: Array<{ closing_id: string; org_id: string; denomination: number; quantity: number }> = [];
  for (let index = 1; index <= 20; index += 1) {
    const denomination = n(formData.get(`custom_denomination_value_${index}`));
    const quantity = Math.max(0, Math.floor(n(formData.get(`custom_denomination_quantity_${index}`))));
    if (denomination > 0 && quantity > 0) customDenominations.push({ closing_id: closing.id, org_id: ctx.orgId, denomination, quantity });
  }
  if (denominations.length || customDenominations.length) {
    const { error: linesError } = await db.from("cash_closing_lines").insert([...denominations, ...customDenominations]);
    if (linesError) redirect(`/banking/cash-closing?error=${encodeURIComponent(`Closing saved, but cash count lines could not be recorded: ${linesError.message}`)}`);
  }
  const auditEvents = [
    { closing_id: closing.id, org_id: ctx.orgId, location_id: locationId, action: "created", actor_id: ctx.userId, metadata: { variance, open_register_override: openRegisterOverride }, ...audit },
    { closing_id: closing.id, org_id: ctx.orgId, location_id: locationId, action: "submitted", actor_id: ctx.userId, metadata: { approval_required: approvalRequired, open_register_override: openRegisterOverride }, ...audit },
    ...(!approvalRequired ? [{
      closing_id: closing.id,
      org_id: ctx.orgId,
      location_id: locationId,
      action: "approved",
      actor_id: ctx.userId,
      metadata: { decision: "approved", automatic: true },
      ...audit,
    }] : []),
  ];
  const { error: auditError } = await db.from("cash_closing_audit").insert(auditEvents);
  if (auditError) redirect(`/banking/cash-closing?error=${encodeURIComponent(`Closing saved, but its audit record could not be stored: ${auditError.message}`)}`);
  if (approvalRequired || classification !== "balanced") {
    await db.from("notifications").insert({ org_id: ctx.orgId, location_id: locationId, title: approvalRequired ? "Cash closing approval required" : `Cash ${classification}`, message: `${date} ${shift} closing has a ${Math.abs(variance).toFixed(2)} variance.`, type: "cash_closing", entity_type: "cash_closing", entity_id: closing.id });
  }
  if (!approvalRequired && classification !== "balanced") {
    await postCashClosingVarianceJournal(db, { ...closing, variance, classification, closing_date: date, location_id: locationId, org_id: ctx.orgId }, ctx.userId);
  }
  revalidatePath("/banking/cash-closing");
  revalidatePath("/dashboard");
  redirect(`/banking/cash-closing?tab=history&date_from=${encodeURIComponent(date)}&date_to=${encodeURIComponent(date)}&saved=1`);
}

export async function approveCashClosing(id: string, comments = "") {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "approve") || !await canTabPermission("banking", "banking", "reconciliation", "approve")) return { error: "Approval permission required" };
  const db = await createClient() as any;
  const { data: existing } = await db.from("cash_closings").select("location_id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (!existing || (existing.location_id && !canAccessLocation(ctx, existing.location_id))) return { error: "Closing record not found." };
  const approvedAt = new Date().toISOString();
  const { data: closing, error } = await db.from("cash_closings").update({ status: "approved", approval_decision: "approved", approval_comments: comments.trim() || null, approved_by: ctx.userId, approved_at: approvedAt }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "pending_approval").select("id, org_id, location_id, closing_date, variance, classification").maybeSingle();
  if (error) return { error: error.message };
  if (!closing) return { error: "This closing is no longer awaiting approval." };
  if (closing) await postCashClosingVarianceJournal(db, closing, ctx.userId);
  const { error: auditError } = await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, location_id: closing.location_id, action: "approved", actor_id: ctx.userId, metadata: { decision: "approved", comments: comments.trim() || null }, ...(await auditContext()) });
  if (auditError) return { error: auditError.message };
  revalidatePath("/banking/cash-closing"); revalidatePath("/dashboard"); return { success: true };
}

export async function approveCashClosingFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const comments = String(formData.get("comments") ?? "").trim();
  if (!id) return;
  const result = await approveCashClosing(id, comments);
  if (result && "error" in result) redirect(`/banking/cash-closing?tab=approval&error=${encodeURIComponent(result.error)}`);
  redirect("/banking/cash-closing?tab=approval&saved=approved");
}

export async function rejectCashClosing(id: string, reason: string) {
  const ctx = await getCurrentOrgContext();
  if (!ctx || !await canPermission("cash_closing", "approve") || !await canTabPermission("banking", "banking", "reconciliation", "approve")) return { error: "Approval permission required" };
  if (!reason.trim()) return { error: "A rejection reason is required." };
  const db = await createClient() as any;
  const { data: existing, error: lookupError } = await db.from("cash_closings")
    .select("location_id").eq("id", id).eq("org_id", ctx.orgId).maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!existing || (existing.location_id && !canAccessLocation(ctx, existing.location_id))) return { error: "Closing record not found." };
  const { data: closing, error } = await db.from("cash_closings")
    .update({ status: "rejected", approval_decision: "rejected", approval_comments: reason.trim(), approved_by: ctx.userId, approved_at: new Date().toISOString() })
    .eq("id", id).eq("org_id", ctx.orgId).eq("status", "pending_approval").select("id, location_id").maybeSingle();
  if (error) return { error: error.message };
  if (!closing) return { error: "This closing is no longer awaiting approval." };
  const { error: auditError } = await db.from("cash_closing_audit").insert({
    closing_id: id, org_id: ctx.orgId, location_id: closing.location_id, action: "rejected", actor_id: ctx.userId,
    metadata: { reason: reason.trim() }, ...(await auditContext()),
  });
  if (auditError) return { error: auditError.message };
  revalidatePath("/banking/cash-closing");
  return { success: true };
}

export async function requestCashClosingExplanation(id: string, message: string) {
  const ctx = await getCurrentOrgContext();
  if (!ctx || !await canPermission("cash_closing", "approve") || !await canTabPermission("banking", "banking", "reconciliation", "edit")) return { error: "Approval permission required" };
  if (!message.trim()) return { error: "An explanation request is required." };
  const db = await createClient() as any;
  const { data: closing, error: closingError } = await db.from("cash_closings")
    .select("id, org_id, location_id").eq("id", id).eq("org_id", ctx.orgId)
    .eq("status", "pending_approval").maybeSingle();
  if (closingError) return { error: closingError.message };
  if (!closing) return { error: "Pending closing not found." };
  if (closing.location_id && !canAccessLocation(ctx, closing.location_id)) return { error: "Closing record not found." };
  const { error: auditError } = await db.from("cash_closing_audit").insert({
    closing_id: id, org_id: ctx.orgId, location_id: closing.location_id, action: "explanation_requested", actor_id: ctx.userId,
    metadata: { message: message.trim() }, ...(await auditContext()),
  });
  if (auditError) return { error: auditError.message };
  const { error: notificationError } = await db.from("notifications").insert({
    org_id: ctx.orgId, location_id: closing.location_id,
    title: "Cash closing explanation requested", message: message.trim(),
    type: "cash_closing", entity_type: "cash_closing", entity_id: id,
  });
  if (notificationError) return { error: notificationError.message };
  revalidatePath("/banking/cash-closing");
  return { success: true };
}

export async function rejectCashClosingFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  const result = await rejectCashClosing(id, reason);
  if (result && "error" in result) redirect(`/banking/cash-closing?tab=approval&error=${encodeURIComponent(result.error)}`);
  redirect("/banking/cash-closing?tab=approval&saved=rejected");
}

export async function requestCashClosingExplanationFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!id) return;
  const result = await requestCashClosingExplanation(id, message);
  if (result && "error" in result) redirect(`/banking/cash-closing?tab=approval&error=${encodeURIComponent(result.error)}`);
  redirect("/banking/cash-closing?tab=approval&saved=explanation-requested");
}

export async function requestCashClosingReopen(id: string, reason: string) {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "edit") || !await canTabPermission("banking", "banking", "reconciliation", "edit")) return { error: "Reopen permission required." };
  const db = await createClient() as any;
  if (!reason.trim()) return { error: "A reopen reason is required." };
  const { data: closing, error: lookupError } = await db.from("cash_closings").select("location_id, created_by")
    .eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!closing || (closing.location_id && !canAccessLocation(ctx, closing.location_id))
    || (!ctx.canViewOtherTransactions && closing.created_by !== ctx.userId)) return { error: "Closing record not found." };
  const { error } = await db.from("cash_closings").update({ reopen_status: "requested", reopen_requested_by: ctx.userId, reopen_requested_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").eq("reopen_status", "none");
  if (error) return { error: error.message };
  const { error: auditError } = await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, location_id: closing.location_id, action: "reopen_requested", actor_id: ctx.userId, metadata: { reason: reason.trim() }, ...(await auditContext()) });
  if (auditError) return { error: auditError.message };
  revalidatePath("/banking/cash-closing"); return { success: true };
}

export async function requestCashClosingReopenFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();
  if (!id) return;
  const result = await requestCashClosingReopen(id, reason);
  if (result && "error" in result) redirect(`/banking/cash-closing?tab=history&closing_id=${encodeURIComponent(id)}&error=${encodeURIComponent(result.error)}`);
  redirect(`/banking/cash-closing?tab=history&closing_id=${encodeURIComponent(id)}&saved=reopen-requested#closing-details`);
}

export async function approveCashClosingReopen(id: string) {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "approve") || !await canTabPermission("banking", "banking", "reconciliation", "approve")) return { error: "Approval permission required" };
  const db = await createClient() as any;
  const { data: closing, error: lookupError } = await db.from("cash_closings").select("location_id")
    .eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").eq("reopen_status", "requested").maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!closing || (closing.location_id && !canAccessLocation(ctx, closing.location_id))) return { error: "Closing record not found." };
  const { error } = await db.from("cash_closings").update({ status: "reopened", reopen_status: "approved" }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").eq("reopen_status", "requested");
  if (error) return { error: error.message };
  const { error: auditError } = await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, location_id: closing.location_id, action: "reopen_approved", actor_id: ctx.userId, ...(await auditContext()) });
  if (auditError) return { error: auditError.message };
  revalidatePath("/banking/cash-closing"); return { success: true };
}

export async function approveCashClosingReopenFromForm(formData: FormData) {
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return;
  const result = await approveCashClosingReopen(id);
  if (result && "error" in result) redirect(`/banking/cash-closing?tab=approval&error=${encodeURIComponent(result.error)}`);
  redirect("/banking/cash-closing?tab=approval&saved=reopen-approved");
}
