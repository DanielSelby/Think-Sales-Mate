"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { headers } from "next/headers";

export type CashSummary = { opening: number; sales: number; receipts: number; refunds: number; expenses: number; deposits: number; withdrawals: number; expected: number };
const n = (v: unknown) => Number(v ?? 0) || 0;
async function auditContext() {
  const h = await headers();
  return { device: h.get("user-agent") ?? "unknown", ip_address: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? h.get("x-real-ip") ?? "unknown" };
}

export async function calculateExpectedCash(date: string, locationId?: string | null, _shift = "full_day"): Promise<CashSummary> {
  const ctx = await getCurrentOrgContext();
  if (!ctx) throw new Error("Session expired");
  const db = await createClient() as any;
  const scoped = (q: any): any => {
    if (locationId) return q.eq("location_id", locationId);
    if (ctx.isBranchScoped) return q.in("location_id", ctx.allowedLocationIds);
    return q;
  };
  const [salesQ, expQ, txQ, acctQ] = [
    scoped(db.from("sales").select("total, amount_paid, refunded_amount, payment_method").eq("org_id", ctx.orgId).eq("status", "completed").gte("created_at", `${date}T00:00:00.000Z`).lt("created_at", `${date}T23:59:59.999Z`)),
    scoped(db.from("expenses").select("amount, payment_method").eq("org_id", ctx.orgId).eq("expense_date", date)),
    db.from("bank_transactions").select("amount, type").eq("org_id", ctx.orgId).eq("transaction_date", date),
    db.from("bank_accounts").select("opening_balance").eq("org_id", ctx.orgId).eq("account_type", "cash"),
  ];
  const [{ data: sales }, { data: expenses }, { data: transactions }, { data: accounts }] = await Promise.all([salesQ, expQ, txQ, acctQ]);
  const cashSales = (sales ?? []).filter((s: Record<string, unknown>) => String(s.payment_method ?? "").toLowerCase().includes("cash")).reduce((a: number, s: Record<string, unknown>) => a + n(s.amount_paid ?? s.total), 0);
  const refunds = (sales ?? []).reduce((a: number, s: Record<string, unknown>) => a + n(s.refunded_amount), 0);
  const cashExpenses = (expenses ?? []).filter((e: Record<string, unknown>) => String(e.payment_method ?? "cash").toLowerCase().includes("cash")).reduce((a: number, e: Record<string, unknown>) => a + n(e.amount), 0);
  const deposits = (transactions ?? []).filter((t: Record<string, unknown>) => t.type === "deposit").reduce((a: number, t: Record<string, unknown>) => a + n(t.amount), 0);
  const withdrawals = (transactions ?? []).filter((t: Record<string, unknown>) => t.type === "withdrawal").reduce((a: number, t: Record<string, unknown>) => a + n(t.amount), 0);
  const opening = (accounts ?? []).reduce((a: number, x: Record<string, unknown>) => a + n(x.opening_balance), 0);
  const receipts = 0;
  return { opening, sales: cashSales, receipts, refunds, expenses: cashExpenses, deposits, withdrawals, expected: opening + cashSales + receipts - refunds - cashExpenses - deposits - withdrawals };
}

export async function createCashClosing(formData: FormData) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) redirect("/banking/cash-closing?error=Session%20expired");
  if (!await canPermission("banking", "create")) redirect("/banking/cash-closing?error=Permission%20required");
  const date = String(formData.get("closing_date") ?? "").trim();
  const locationId = String(formData.get("location_id") ?? "").trim() || null;
  const actual = n(formData.get("actual_cash"));
  const shift = String(formData.get("shift") ?? "full_day");
  const notesCount = n(formData.get("notes_count"));
  const coinCount = n(formData.get("coin_count"));
  const varianceReason = String(formData.get("variance_reason") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();
  if (!date || actual < 0) redirect("/banking/cash-closing?error=Enter%20a%20valid%20date%20and%20cash");
  const summary = await calculateExpectedCash(date, locationId, shift);
  const variance = Number((actual - summary.expected).toFixed(2));
  if (Math.abs(variance) > 0.005 && !varianceReason) redirect("/banking/cash-closing?error=Variance%20reason%20is%20required");
  const classification = variance === 0 ? "balanced" : variance > 0 ? "excess" : "shortage";
  const db = await createClient() as any;
  const { data: setting } = await db.from("cash_closing_settings").select("variance_approval_enabled, variance_threshold").eq("org_id", ctx.orgId).maybeSingle();
  const threshold = n(setting?.variance_threshold) || 50;
  const approvalRequired = Boolean(setting?.variance_approval_enabled ?? true) && Math.abs(variance) > threshold;
  const { data: closing, error } = await db.from("cash_closings").insert({
    org_id: ctx.orgId, location_id: locationId, closing_date: date, period_start: `${date}T00:00:00Z`, period_end: `${date}T23:59:59Z`,
    opening_cash: summary.opening, cash_sales: summary.sales, cash_receipts: summary.receipts, cash_refunds: summary.refunds, cash_expenses: summary.expenses,
    deposits: summary.deposits, withdrawals: summary.withdrawals, expected_cash: summary.expected, actual_cash: actual, variance, classification,
    variance_reason: varianceReason || null, notes: notes || null, comments: notes || null, shift,
    coin_breakdown: { notes: notesCount, coins: coinCount }, created_by: ctx.userId,
    approval_threshold: threshold, approval_required: approvalRequired,
    status: approvalRequired ? "pending_approval" : "approved",
  }).select("id").single();
  if (error || !closing) redirect(`/banking/cash-closing?error=${encodeURIComponent(error?.message ?? "Could not save closing")}`);
  const audit = await auditContext();
  await db.from("cash_closing_audit").insert({ closing_id: closing.id, org_id: ctx.orgId, action: "created", actor_id: ctx.userId, metadata: { variance }, ...audit });
  const denominations = [1, 2, 5, 10, 20, 50, 100].flatMap((denomination) => {
    const quantity = Math.max(0, Math.floor(n(formData.get(`denomination_${denomination}`))));
    return quantity ? [{ closing_id: closing.id, org_id: ctx.orgId, denomination, quantity }] : [];
  });
  if (denominations.length) await db.from("cash_closing_lines").insert(denominations);
  if (approvalRequired || classification !== "balanced") {
    await db.from("notifications").insert({ org_id: ctx.orgId, location_id: locationId, title: approvalRequired ? "Cash closing approval required" : `Cash ${classification}`, message: `${date} ${shift} closing has a ${Math.abs(variance).toFixed(2)} variance.`, type: "cash_closing", entity_type: "cash_closing", entity_id: closing.id });
  }
  revalidatePath("/banking/cash-closing");
  redirect("/banking/cash-closing?saved=1");
}

export async function approveCashClosing(id: string) {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("banking", "approve")) return { error: "Approval permission required" };
  const db = await createClient() as any;
  const { error } = await db.from("cash_closings").update({ status: "approved", approved_by: ctx.userId, approved_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "pending_approval");
  if (error) return { error: error.message };
  await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, action: "approved", actor_id: ctx.userId, ...(await auditContext()) });
  revalidatePath("/banking/cash-closing"); return { success: true };
}

export async function requestCashClosingReopen(id: string, reason: string) {
  const ctx = await getCurrentOrgContext(); if (!ctx) return { error: "Session expired" };
  const db = await createClient() as any;
  if (!reason.trim()) return { error: "A reopen reason is required." };
  const { error } = await db.from("cash_closings").update({ reopen_status: "requested", reopen_requested_by: ctx.userId, reopen_requested_at: new Date().toISOString() }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").eq("reopen_status", "none");
  if (error) return { error: error.message };
  await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, action: "reopen_requested", actor_id: ctx.userId, metadata: { reason }, ...(await auditContext()) });
  revalidatePath("/banking/cash-closing"); return { success: true };
}

export async function approveCashClosingReopen(id: string) {
  const ctx = await getCurrentOrgContext(); if (!ctx || !await canPermission("banking", "approve")) return { error: "Approval permission required" };
  const db = await createClient() as any;
  const { error } = await db.from("cash_closings").update({ status: "reopened", reopen_status: "approved" }).eq("id", id).eq("org_id", ctx.orgId).eq("status", "approved").eq("reopen_status", "requested");
  if (error) return { error: error.message };
  await db.from("cash_closing_audit").insert({ closing_id: id, org_id: ctx.orgId, action: "reopen_approved", actor_id: ctx.userId, ...(await auditContext()) });
  revalidatePath("/banking/cash-closing"); return { success: true };
}
