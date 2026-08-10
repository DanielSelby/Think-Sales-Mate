"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DEFAULT_LEAVE_TYPES, countBusinessDays } from "@/lib/hrm/leave";

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Leave types — seeded once per org on first visit to the page
// ---------------------------------------------------------------------------

export interface LeaveTypeOption {
  id: string;
  name: string;
  color: string;
  isPaid: boolean;
}

export async function ensureLeaveTypes(): Promise<LeaveTypeOption[]> {
  const context = await getCurrentOrgContext();
  if (!context) return [];
  const supabase = createClient();

  const { data: existing } = await supabase.from("leave_types").select("id, name, color, is_paid").eq("org_id", context.orgId);
  if (existing && existing.length > 0) return existing.map((t) => ({ id: t.id, name: t.name, color: t.color, isPaid: t.is_paid }));

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: inserted, error } = await supabase
    .from("leave_types")
    .insert(
      DEFAULT_LEAVE_TYPES.map((t) => ({
        org_id: context.orgId,
        name: t.name,
        color: t.color,
        is_paid: t.isPaid,
        default_annual_days: t.defaultAnnualDays,
      }))
    )
    .select("id, name, color, is_paid");

  if (error || !inserted) return [];
  return inserted.map((t) => ({ id: t.id, name: t.name, color: t.color, isPaid: t.is_paid }));
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export interface CreateLeaveRequestInput {
  employeeId: string;
  leaveTypeId: string;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export async function createLeaveRequest(input: CreateLeaveRequestInput): Promise<SimpleResult> {
  if (new Date(input.endDate) < new Date(input.startDate)) return { ok: false, error: "End date can't be before start date." };

  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const duration = countBusinessDays(input.startDate, input.endDate);

  const { data, error } = await supabase
    .from("leave_requests")
    .insert({
      org_id: context.orgId,
      employee_id: input.employeeId,
      leave_type_id: input.leaveTypeId,
      start_date: input.startDate,
      end_date: input.endDate,
      duration_days: duration,
      reason: input.reason,
      status: "pending",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? "Couldn't create the leave request." };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "leave.requested",
    entity_type: "leave_requests",
    entity_id: data.id,
    metadata: { duration_days: duration },
  });

  revalidatePath("/hrm/leave");
  return { ok: true };
}

export async function approveLeaveRequest(requestId: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: request, error: fetchError } = await supabase
    .from("leave_requests")
    .select("org_id, employee_id, duration_days, status")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { ok: false, error: "Leave request not found." };
  if (request.status === "approved") return { ok: false, error: "Already approved." };

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "approved", decided_by: user.id, decided_at: new Date().toISOString() })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };

  await adjustBalance(supabase, request.org_id, request.employee_id, request.duration_days);

  await supabase.from("audit_logs").insert({
    org_id: request.org_id,
    actor_id: user.id,
    action: "leave.approved",
    entity_type: "leave_requests",
    entity_id: requestId,
    metadata: {},
  });

  revalidatePath("/hrm/leave");
  return { ok: true };
}

export async function rejectLeaveRequest(requestId: string, note?: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: request, error: fetchError } = await supabase
    .from("leave_requests")
    .select("org_id")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { ok: false, error: "Leave request not found." };

  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "rejected", decided_by: user.id, decided_at: new Date().toISOString(), decision_note: note ?? null })
    .eq("id", requestId);
  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: request.org_id,
    actor_id: user.id,
    action: "leave.rejected",
    entity_type: "leave_requests",
    entity_id: requestId,
    metadata: { note },
  });

  revalidatePath("/hrm/leave");
  return { ok: true };
}

export async function deleteLeaveRequest(requestId: string): Promise<SimpleResult> {
  const supabase = createClient();
  const { data: request, error: fetchError } = await supabase
    .from("leave_requests")
    .select("org_id, employee_id, duration_days, status")
    .eq("id", requestId)
    .single();
  if (fetchError || !request) return { ok: false, error: "Leave request not found." };

  const { error } = await supabase.from("leave_requests").delete().eq("id", requestId);
  if (error) return { ok: false, error: error.message };

  // If it had already been approved (and thus counted against the balance),
  // reverse that so deleting doesn't leave the balance permanently wrong.
  if (request.status === "approved") {
    await adjustBalance(supabase, request.org_id, request.employee_id, -request.duration_days);
  }

  revalidatePath("/hrm/leave");
  return { ok: true };
}

async function adjustBalance(
  supabase: ReturnType<typeof createClient>,
  orgId: string,
  employeeId: string,
  deltaDays: number
) {
  const year = new Date().getFullYear();
  const { data: existing } = await supabase
    .from("leave_balances")
    .select("id, used_days")
    .eq("employee_id", employeeId)
    .eq("year", year)
    .maybeSingle();

  if (existing) {
    await supabase
      .from("leave_balances")
      .update({ used_days: Math.max(0, existing.used_days + deltaDays), updated_at: new Date().toISOString() })
      .eq("id", existing.id);
  } else {
    await supabase.from("leave_balances").insert({
      org_id: orgId,
      employee_id: employeeId,
      year,
      allocated_days: 21,
      used_days: Math.max(0, deltaDays),
    });
  }
}