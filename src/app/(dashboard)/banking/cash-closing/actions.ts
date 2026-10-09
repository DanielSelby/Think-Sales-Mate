"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { canAccessLocation } from "@/lib/organizations/location-access";
import { headers } from "next/headers";
import { postOperationalJournal } from "@/lib/accounting/post-operational-journal";

export type CashSummary = { opening: number; sales: number; discounts: number; debt: number; customerPayments: number; electronic: number; refunds: number; expenses: number; deposits: number; withdrawals: number; posCashIn: number; posCashOut: number; posRegisterSessionCount: number; expected: number };
const n = (v: unknown) => Number(v ?? 0) || 0;
function splitAmount(method: unknown, bucket: "cash" | "momo" | "card") {
  const value = String(method ?? "");
  if (!/^split\s*\(/i.test(value)) return null;
  const match = value.replace(/^split\s*\(/i, "").replace(/\)\s*$/, "").match(new RegExp(`(?:${bucket === "momo" ? "momo|mobile money" : bucket})\\s+([-+]?\\d+(?:\\.\\d+)?)`, "i"));
  return match ? n(match[1]) : 0;
}
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
  if (!await canPermission("cash_closing", action === "exported" ? "export" : "print")) {
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

export async function calculateExpectedCash(date: string, locationId?: string | null, _shift = "full_day", userId?: string | null): Promise<CashSummary> {
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
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = new Date(new Date(dayStart).getTime() + 24 * 60 * 60 * 1000).toISOString();
  const dayEndInclusive = new Date(new Date(dayEnd).getTime() - 1).toISOString();
  const salesDayFilter = `or(and(created_at.gte.${dayStart},created_at.lte.${dayEndInclusive}),and(status_changed_at.gte.${dayStart},status_changed_at.lte.${dayEndInclusive}))`;
  let salesQuery = scoped(db.from("sales").select("total, discount_amount, amount_paid, refunded_amount, payment_method, refund_payment_method, refund_register_session_id, status, created_at, status_changed_at, sold_by").eq("org_id", ctx.orgId).in("status", ["completed", "returned"]).or(salesDayFilter));
  let expenseQuery = scoped(db.from("expenses").select("amount, payment_method, payment_status, paid_on, expense_date, recorded_by").eq("org_id", ctx.orgId).eq("payment_status", "paid").or(`expense_date.eq.${date},paid_on.eq.${date}`));
  let customerPaymentQuery = scoped(db.from("customer_credit_payments").select("amount, payment_method, recorded_by").eq("org_id", ctx.orgId).eq("payment_date", date));
  if (userId) {
    salesQuery = salesQuery.eq("sold_by", userId);
    expenseQuery = expenseQuery.eq("recorded_by", userId);
    customerPaymentQuery = customerPaymentQuery.eq("recorded_by", userId);
  }
  let txQ = db.from("bank_transactions").select("amount, type, recorded_by").eq("org_id", ctx.orgId).eq("transaction_date", date);
  let posMovementQuery = db.from("pos_cash_movements")
    .select("movement_type, amount")
    .eq("org_id", ctx.orgId)
    .gte("created_at", dayStart)
    .lt("created_at", dayEnd);
  let posSessionQuery = db.from("pos_register_sessions")
    .select("id", { count: "exact", head: true })
    .eq("org_id", ctx.orgId)
    .gte("opened_at", dayStart)
    .lt("opened_at", dayEnd);
  posMovementQuery = scoped(posMovementQuery);
  posSessionQuery = scoped(posSessionQuery);
  if (userId) {
    posMovementQuery = posMovementQuery.eq("created_by", userId);
    posSessionQuery = posSessionQuery.eq("cashier_id", userId);
  }
  const [salesQ, expQ, acctQ] = [
    salesQuery,
    expenseQuery,
    db.from("bank_accounts").select("opening_balance").eq("org_id", ctx.orgId).eq("account_type", "cash"),
  ];
  if (userId) txQ = txQ.eq("recorded_by", userId);
  const [{ data: sales }, expenseResult, { data: transactions }, { data: accounts }, { data: customerPayments }, { data: posMovements, error: posMovementError }, { count: posSessionCount, error: posSessionError }] = await Promise.all([
    salesQ, expQ, txQ, acctQ, customerPaymentQuery, posMovementQuery, posSessionQuery,
  ]);
  if (posMovementError) throw new Error(`Could not load POS drawer movements: ${posMovementError.message}`);
  if (posSessionError) throw new Error(`Could not load POS register sessions: ${posSessionError.message}`);
  const expenses = expenseResult.error
    ? (await (() => {
        let query = scoped(db.from("expenses").select("amount, payment_method, expense_date, recorded_by").eq("org_id", ctx.orgId).eq("expense_date", date));
        if (userId) query = query.eq("recorded_by", userId);
        return query;
      })()).data
    : expenseResult.data;
  const cashSales = (sales ?? [])
    .filter((s: Record<string, unknown>) => splitAmount(s.payment_method, "cash") !== null || String(s.payment_method ?? "").toLowerCase().includes("cash"))
    .filter((s: Record<string, unknown>) => String(s.created_at ?? "").slice(0, 10) === date)
    .reduce((a: number, s: Record<string, unknown>) => a + (splitAmount(s.payment_method, "cash") ?? n(s.total)), 0);
  const discounts = (sales ?? [])
    .filter((s: Record<string, unknown>) => String(s.created_at ?? "").slice(0, 10) === date)
    .reduce((a: number, s: Record<string, unknown>) => a + n(s.discount_amount), 0);
  const customerDebt = (sales ?? [])
    .filter((s: Record<string, unknown>) => !/^split\s*\(/i.test(String(s.payment_method ?? "")))
    .filter((s: Record<string, unknown>) => String(s.payment_method ?? "").toLowerCase().includes("cash"))
    .filter((s: Record<string, unknown>) => s.status === "completed")
    .filter((s: Record<string, unknown>) => String(s.created_at ?? "").slice(0, 10) === date)
    .reduce((a: number, s: Record<string, unknown>) => {
      const total = n(s.total);
      const amountPaid = s.amount_paid == null ? total : n(s.amount_paid);
      return a + Math.max(0, total - amountPaid);
    }, 0);
  const electronic = (sales ?? [])
    .filter((s: Record<string, unknown>) => {
      const method = String(s.payment_method ?? "").toLowerCase();
      return method.includes("mobile") || method.includes("momo") || method.includes("e-cash") || method.includes("electronic");
    })
    .filter((s: Record<string, unknown>) => String(s.created_at ?? "").slice(0, 10) === date)
    .reduce((a: number, s: Record<string, unknown>) => a + (splitAmount(s.payment_method, "momo") ?? n(s.amount_paid ?? s.total)), 0);
  const refunds = (sales ?? [])
    .filter((s: Record<string, unknown>) => s.status === "returned" && !s.refund_register_session_id && String(s.refund_payment_method ?? s.payment_method ?? "").toLowerCase().includes("cash"))
    .filter((s: Record<string, unknown>) => String(s.status_changed_at ?? "").slice(0, 10) === date)
    .reduce((a: number, s: Record<string, unknown>) => a + n(s.refunded_amount), 0);
  const cashExpenses = (expenses ?? [])
    .filter((e: Record<string, unknown>) => {
      const paidDate = String(e.paid_on ?? e.expense_date ?? "");
      return paidDate === date && String(e.payment_method ?? "cash").toLowerCase().includes("cash");
    })
    .reduce((a: number, e: Record<string, unknown>) => a + n(e.amount), 0);
  const deposits = (transactions ?? []).filter((t: Record<string, unknown>) => t.type === "deposit").reduce((a: number, t: Record<string, unknown>) => a + n(t.amount), 0);
  const withdrawals = (transactions ?? []).filter((t: Record<string, unknown>) => t.type === "withdrawal").reduce((a: number, t: Record<string, unknown>) => a + n(t.amount), 0);
  const customerCashPayments = (customerPayments ?? [])
    .filter((p: Record<string, unknown>) => String(p.payment_method ?? "").toLowerCase().includes("cash"))
    .reduce((a: number, p: Record<string, unknown>) => a + n(p.amount), 0);
  const customerElectronicPayments = (customerPayments ?? [])
    .filter((p: Record<string, unknown>) => /mobile|momo|e-cash|electronic/i.test(String(p.payment_method ?? "")))
    .reduce((a: number, p: Record<string, unknown>) => a + n(p.amount), 0);
  const opening = (accounts ?? []).reduce((a: number, x: Record<string, unknown>) => a + n(x.opening_balance), 0);
  const totalElectronic = electronic + customerElectronicPayments;
  const posCashIn = (posMovements ?? []).reduce((sum: number, movement: Record<string, unknown>) => sum + (movement.movement_type === "cash_in" ? n(movement.amount) : 0), 0);
  const posCashOut = (posMovements ?? []).reduce((sum: number, movement: Record<string, unknown>) => sum + (movement.movement_type !== "cash_in" ? n(movement.amount) : 0), 0);
  return {
    opening,
    sales: cashSales,
    discounts,
    debt: customerDebt,
    customerPayments: customerCashPayments,
    electronic: totalElectronic,
    refunds,
    expenses: cashExpenses,
    deposits,
    withdrawals,
    posCashIn,
    posCashOut,
    posRegisterSessionCount: posSessionCount ?? 0,
    expected: opening + cashSales - customerDebt + customerCashPayments - refunds - cashExpenses - deposits - withdrawals + posCashIn - posCashOut,
  };
}

export async function createCashClosing(formData: FormData) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/banking/cash-closing?error=Session%20expired");
  if (!await canPermission("cash_closing", "create")) redirect("/banking/cash-closing?error=Permission%20required");
  const date = String(formData.get("closing_date") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const actual = n(formData.get("actual_cash"));
  const shift = String(formData.get("shift") ?? "full_day");
  const notesCount = n(formData.get("notes_count"));
  const coinCount = n(formData.get("coin_count"));
  const varianceReason = String(formData.get("variance_reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!date || actual < 0) redirect("/banking/cash-closing?error=Enter%20a%20valid%20date%20and%20cash");
  if (ctx.isBranchScoped && !locationId) {
    redirect("/banking/cash-closing?error=Select%20an%20assigned%20branch");
  }
  if (locationId && !canAccessLocation(ctx, locationId)) {
    redirect("/banking/cash-closing?error=You%20are%20not%20assigned%20to%20this%20branch");
  }
  const summary = await calculateExpectedCash(date, locationId, shift, ctx.canViewOtherTransactions ? null : ctx.userId);
  const variance = Number((actual - summary.expected).toFixed(2));
  if (Math.abs(variance) > 0.005 && !varianceReason) redirect("/banking/cash-closing?error=Variance%20reason%20is%20required");
  const classification = variance === 0 ? "balanced" : variance > 0 ? "excess" : "shortage";
  const db = await createClient() as any;
  const { data: setting } = await db.from("cash_closing_settings").select("variance_approval_enabled, variance_threshold").eq("org_id", ctx.orgId).maybeSingle();
  const threshold = n(setting?.variance_threshold) || 50;
  const approvalRequired = Boolean(setting?.variance_approval_enabled ?? true) && Math.abs(variance) > threshold;
  const { data: closing, error } = await db.from("cash_closings").insert({
    org_id: ctx.orgId, location_id: locationId, closing_date: date, period_start: `${date}T00:00:00Z`, period_end: `${date}T23:59:59Z`,
    opening_cash: summary.opening, cash_sales: summary.sales, cash_receipts: summary.debt, cash_customer_payments: summary.customerPayments, cash_e_cash: summary.electronic, cash_refunds: summary.refunds, cash_expenses: summary.expenses,
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
    { closing_id: closing.id, org_id: ctx.orgId, location_id: locationId, action: "created", actor_id: ctx.userId, metadata: { variance }, ...audit },
    { closing_id: closing.id, org_id: ctx.orgId, location_id: locationId, action: "submitted", actor_id: ctx.userId, metadata: { approval_required: approvalRequired }, ...audit },
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
  redirect("/banking/cash-closing?saved=1");
}

export async function approveCashClosing(id: string, comments = "") {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "approve")) return { error: "Approval permission required" };
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
  if (!ctx || !await canPermission("cash_closing", "approve")) return { error: "Approval permission required" };
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
  if (!ctx || !await canPermission("cash_closing", "approve")) return { error: "Approval permission required" };
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
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "edit")) return { error: "Reopen permission required." };
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
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("cash_closing", "approve")) return { error: "Approval permission required" };
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
