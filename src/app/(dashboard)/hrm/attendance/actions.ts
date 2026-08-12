"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { computeHours, isLateCheckIn } from "@/lib/hrm/attendance";
import type { AttendanceStatus } from "@/types/database";

export interface SimpleResult {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Self check-in/out — matched by email against the logged-in user, since
// `employees` has no direct link to auth.users/profiles. If no employee row
// shares the user's email, there's nothing to check in automatically; the
// UI falls back to letting them pick an employee manually.
// ---------------------------------------------------------------------------

export interface CurrentEmployeeMatch {
  id: string;
  name: string;
}

export async function getCurrentEmployeeMatch(): Promise<CurrentEmployeeMatch | null> {
  const context = await getCurrentOrgContext();
  if (!context) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("employees")
    .select("id, full_name")
    .eq("org_id", context.orgId)
    .eq("email", context.userEmail)
    .maybeSingle();
  return data ? { id: data.id, name: data.full_name } : null;
}

export async function checkIn(employeeId: string, workType: string): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const today = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  const status: AttendanceStatus = isLateCheckIn(now) ? "late" : "present";

  const { error } = await supabase
    .from("attendance_records")
    .upsert(
      { org_id: context.orgId, employee_id: employeeId, work_date: today, check_in: now, status, work_type: workType, created_by: user.id },
      { onConflict: "employee_id,work_date" }
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hrm/attendance");
  return { ok: true };
}

export async function checkOut(recordId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { data: record, error: fetchError } = await supabase
    .from("attendance_records")
    .select("check_in, status")
    .eq("id", recordId)
    .single();
  if (fetchError || !record || !record.check_in) return { ok: false, error: "No check-in found for this record." };

  const now = new Date().toISOString();
  const totalHours = computeHours(record.check_in, now);

  // Early leave if checking out before a typical 8-hour day and it's still
  // before end-of-day (5pm) — a simple heuristic, not a shift policy engine.
  const isEarly = new Date(now).getHours() < 17 && totalHours < 8;
  const nextStatus: AttendanceStatus = record.status === "late" ? "late" : isEarly ? "early_leave" : "present";

  const { error } = await supabase
    .from("attendance_records")
    .update({ check_out: now, total_hours: totalHours, status: nextStatus })
    .eq("id", recordId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hrm/attendance");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Manual entry / correction (admin marking attendance for any employee)
// ---------------------------------------------------------------------------

export interface MarkAttendanceInput {
  employeeId: string;
  workDate: string;
  status: AttendanceStatus;
  checkIn: string | null;
  checkOut: string | null;
  workType: string;
  notes: string | null;
}

export async function markAttendance(input: MarkAttendanceInput): Promise<SimpleResult> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const checkInIso = input.checkIn ? new Date(`${input.workDate}T${input.checkIn}`).toISOString() : null;
  const checkOutIso = input.checkOut ? new Date(`${input.workDate}T${input.checkOut}`).toISOString() : null;
  const totalHours = checkInIso && checkOutIso ? computeHours(checkInIso, checkOutIso) : 0;

  const { error } = await supabase
    .from("attendance_records")
    .upsert(
      {
        org_id: context.orgId,
        employee_id: input.employeeId,
        work_date: input.workDate,
        check_in: checkInIso,
        check_out: checkOutIso,
        status: input.status,
        work_type: input.workType,
        total_hours: totalHours,
        notes: input.notes,
        created_by: user.id,
      },
      { onConflict: "employee_id,work_date" }
    );
  if (error) return { ok: false, error: error.message };

  await supabase.from("audit_logs").insert({
    org_id: context.orgId,
    actor_id: user.id,
    action: "attendance.corrected",
    entity_type: "attendance_records",
    entity_id: null,
    metadata: { employee_id: input.employeeId, work_date: input.workDate, status: input.status },
  });

  revalidatePath("/hrm/attendance");
  return { ok: true };
}

export async function deleteAttendanceRecord(recordId: string): Promise<SimpleResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("attendance_records").delete().eq("id", recordId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/hrm/attendance");
  return { ok: true };
}

export async function bulkMarkAbsent(workDate: string): Promise<SimpleResult & { marked?: number }> {
  const context = await getCurrentOrgContext();
  if (!context) return { ok: false, error: "No active organization." };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { data: employees } = await supabase.from("employees").select("id").eq("org_id", context.orgId).eq("status", "active");
  const { data: existing } = await supabase.from("attendance_records").select("employee_id").eq("org_id", context.orgId).eq("work_date", workDate);
  const existingIds = new Set((existing ?? []).map((r) => r.employee_id));
  const missing = (employees ?? []).filter((e) => !existingIds.has(e.id));

  if (missing.length === 0) return { ok: true, marked: 0 };

  const { error } = await supabase.from("attendance_records").insert(
    missing.map((e) => ({ org_id: context.orgId, employee_id: e.id, work_date: workDate, status: "absent" as AttendanceStatus, created_by: user.id }))
  );
  if (error) return { ok: false, error: error.message };

  revalidatePath("/hrm/attendance");
  return { ok: true, marked: missing.length };
}