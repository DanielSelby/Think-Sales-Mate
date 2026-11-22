"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canUseLocation } from "@/lib/organizations/location-access";
import { requireTabPermission } from "@/lib/rbac/permissions";

type PermissionAction = "create" | "edit" | "delete" | "approve";

const INTENT_PERMISSION: Record<string, PermissionAction> = {
  save_settings: "edit",
  save_location: "edit",
  add_shift: "create",
  update_shift: "edit",
  delete_shift: "delete",
  assign_shift: "create",
  request_correction: "create",
  review_correction: "approve",
  add_break_policy: "create",
  update_break_policy: "edit",
  start_break: "create",
  end_break: "edit",
  request_overtime: "create",
  review_overtime: "approve",
};

function requiredString(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required field: ${name}.`);
  }
  return value.trim();
}

function optionalString(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function requiredNumber(formData: FormData, name: string): number {
  const value = Number(requiredString(formData, name));
  if (!Number.isFinite(value)) throw new Error(`Invalid number for ${name}.`);
  return value;
}

function validateDate(value: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new Error(`Invalid date for ${field}.`);
  }
  return value;
}

function dateTimeToIso(date: string, time: string | null): string | null {
  if (!time) return null;
  if (!/^\d{2}:\d{2}$/.test(time)) throw new Error("Enter a valid attendance time.");
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("Enter a valid attendance time.");
  return parsed.toISOString();
}

async function validateLocation(
  context: NonNullable<Awaited<ReturnType<typeof getCurrentOrgContext>>>,
  locationId: string | null,
) {
  if (!locationId) {
    if (context.isBranchScoped) throw new Error("Select an accessible branch.");
    return;
  }
  if (!canUseLocation(context, locationId)) throw new Error("You cannot access that branch.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("business_locations")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw new Error(`Could not validate the branch: ${error.message}`);
  if (!data) throw new Error("The selected branch does not belong to this organization.");
}

export async function manageAttendance(formData: FormData): Promise<void> {
  const intent = requiredString(formData, "intent");
  const permission = INTENT_PERMISSION[intent];
  if (!permission) throw new Error("Unsupported attendance management action.");
  await requireTabPermission("hrm_payroll", "hrm", "attendance", permission);

  const context = await getCurrentOrgContext();
  if (!context) throw new Error("No active organization.");
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError) throw new Error(`Could not verify the signed-in user: ${userError.message}`);
  if (!user) throw new Error("You must be signed in.");

  switch (intent) {
    case "save_settings": {
      const { error } = await supabase.from("attendance_management_settings").upsert({
        org_id: context.orgId,
        work_start_time: requiredString(formData, "workStartTime"),
        work_end_time: requiredString(formData, "workEndTime"),
        grace_period_minutes: requiredNumber(formData, "gracePeriodMinutes"),
        late_threshold_minutes: requiredNumber(formData, "lateThresholdMinutes"),
        standard_daily_hours: requiredNumber(formData, "standardDailyHours"),
        overtime_threshold_minutes: requiredNumber(formData, "overtimeThresholdMinutes"),
        overtime_rate_multiplier: requiredNumber(formData, "overtimeRateMultiplier"),
        geofencing_enabled: formData.get("geofencingEnabled") === "on",
        gps_verification_required: formData.get("gpsVerificationRequired") === "on",
        notify_late_arrival: formData.get("notifyLateArrival") === "on",
        notify_absence: formData.get("notifyAbsence") === "on",
        updated_by: user.id,
        updated_at: new Date().toISOString(),
      }, { onConflict: "org_id" });
      if (error) throw new Error(`Could not save attendance settings: ${error.message}`);
      break;
    }
    case "save_location": {
      const locationId = requiredString(formData, "locationId");
      await validateLocation(context, locationId);
      const latitudeRaw = optionalString(formData, "latitude");
      const longitudeRaw = optionalString(formData, "longitude");
      const latitude = latitudeRaw === null ? null : Number(latitudeRaw);
      const longitude = longitudeRaw === null ? null : Number(longitudeRaw);
      if (
        (latitudeRaw !== null && (!Number.isFinite(latitude) || latitude! < -90 || latitude! > 90))
        || (longitudeRaw !== null && (!Number.isFinite(longitude) || longitude! < -180 || longitude! > 180))
        || ((latitude === null) !== (longitude === null))
      ) {
        throw new Error("Enter a valid latitude and longitude, or leave both blank.");
      }
      const { error } = await supabase.rpc("update_attendance_location_geofence", {
        p_org_id: context.orgId,
        p_location_id: locationId,
        p_latitude: latitude,
        p_longitude: longitude,
        p_radius_meters: requiredNumber(formData, "radiusMeters"),
        p_gps_verification_required: formData.get("gpsVerificationRequired") === "on",
      });
      if (error) throw new Error(`Could not save location geofencing: ${error.message}`);
      break;
    }
    case "add_shift":
    case "update_shift": {
      const locationId = optionalString(formData, "locationId");
      await validateLocation(context, locationId);
      const workingDays = formData.getAll("workingDay").map(Number);
      if (workingDays.length < 1 || workingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
        throw new Error("Select at least one valid shift day.");
      }
      const shift = {
        org_id: context.orgId,
        name: requiredString(formData, "name"),
        starts_at: requiredString(formData, "startsAt"),
        ends_at: requiredString(formData, "endsAt"),
        working_days: workingDays,
        department: optionalString(formData, "department"),
        location_id: locationId,
        status: formData.get("status") === "inactive" ? "inactive" as const : "active" as const,
        updated_at: new Date().toISOString(),
      };
      if (intent === "add_shift") {
        const { error } = await supabase.from("attendance_shifts").insert({ ...shift, created_by: user.id });
        if (error) throw new Error(`Could not create the shift: ${error.message}`);
      } else {
        const shiftId = requiredString(formData, "shiftId");
        const { error } = await supabase.from("attendance_shifts").update(shift)
          .eq("org_id", context.orgId).eq("id", shiftId);
        if (error) throw new Error(`Could not update the shift: ${error.message}`);
      }
      break;
    }
    case "delete_shift": {
      const { error } = await supabase.from("attendance_shifts").delete()
        .eq("org_id", context.orgId).eq("id", requiredString(formData, "shiftId"));
      if (error) throw new Error(`Could not delete the shift: ${error.message}`);
      break;
    }
    case "assign_shift": {
      const shiftId = requiredString(formData, "shiftId");
      const employeeId = requiredString(formData, "employeeId");
      const assignmentDate = validateDate(requiredString(formData, "assignmentDate"), "assignment date");
      const { data: shift, error: shiftError } = await supabase.from("attendance_shifts")
        .select("id, location_id").eq("org_id", context.orgId).eq("id", shiftId).maybeSingle();
      if (shiftError) throw new Error(`Could not load the selected shift: ${shiftError.message}`);
      if (!shift) throw new Error("The selected shift does not exist.");
      const { data: employee, error: employeeError } = await supabase.from("employees")
        .select("id").eq("org_id", context.orgId).eq("id", employeeId).maybeSingle();
      if (employeeError) throw new Error(`Could not load the selected employee: ${employeeError.message}`);
      if (!employee) throw new Error("The selected employee does not belong to this organization.");
      const effectiveLocationId = optionalString(formData, "locationId") ?? shift.location_id;
      await validateLocation(context, effectiveLocationId);
      const { error } = await supabase.from("attendance_shift_assignments").upsert({
        org_id: context.orgId,
        shift_id: shiftId,
        employee_id: employeeId,
        location_id: effectiveLocationId,
        assignment_date: assignmentDate,
        assigned_by: user.id,
      }, { onConflict: "org_id,employee_id,assignment_date" });
      if (error) throw new Error(`Could not assign the shift: ${error.message}`);
      break;
    }
    case "request_correction": {
      const employeeId = requiredString(formData, "employeeId");
      const workDate = validateDate(requiredString(formData, "workDate"), "work date");
      const requestedCheckIn = dateTimeToIso(workDate, optionalString(formData, "requestedCheckIn"));
      const requestedCheckOut = dateTimeToIso(workDate, optionalString(formData, "requestedCheckOut"));
      if (!requestedCheckIn && !requestedCheckOut) throw new Error("Enter a requested check-in or check-out time.");
      const { data: employee, error: employeeError } = await supabase.from("employees")
        .select("id, location_id").eq("org_id", context.orgId).eq("id", employeeId).maybeSingle();
      if (employeeError) throw new Error(`Could not load the selected employee: ${employeeError.message}`);
      if (!employee) throw new Error("The selected employee does not belong to this organization.");
      const { data: record, error: recordError } = await supabase.from("attendance_records")
        .select("id, check_in, check_out, location_id")
        .eq("org_id", context.orgId).eq("employee_id", employeeId).eq("work_date", workDate).maybeSingle();
      if (recordError) throw new Error(`Could not load the attendance record: ${recordError.message}`);
      const submittedLocationId = optionalString(formData, "locationId");
      if (record?.location_id && !canUseLocation(context, record.location_id)) {
        throw new Error("You cannot request a correction for attendance outside your branch access.");
      }
      if (record?.location_id && submittedLocationId && submittedLocationId !== record.location_id) {
        throw new Error("The requested branch must match the existing attendance record.");
      }
      const locationId = record?.location_id ?? submittedLocationId ?? employee.location_id ?? null;
      await validateLocation(context, locationId);
      const { error } = await supabase.from("attendance_correction_requests").insert({
        org_id: context.orgId,
        attendance_record_id: record?.id ?? null,
        employee_id: employeeId,
        location_id: locationId ?? record?.location_id ?? null,
        work_date: workDate,
        original_check_in: record?.check_in ?? null,
        requested_check_in: requestedCheckIn,
        original_check_out: record?.check_out ?? null,
        requested_check_out: requestedCheckOut,
        reason: requiredString(formData, "reason"),
        requested_by: user.id,
      });
      if (error) throw new Error(`Could not submit the correction request: ${error.message}`);
      break;
    }
    case "review_correction": {
      const { error } = await supabase.rpc("review_attendance_correction", {
        p_request_id: requiredString(formData, "requestId"),
        p_decision: requiredString(formData, "decision"),
        p_decision_note: optionalString(formData, "decisionNote"),
      });
      if (error) throw new Error(`Could not review the correction request: ${error.message}`);
      break;
    }
    case "add_break_policy": {
      const { error } = await supabase.from("attendance_break_policies").insert({
        org_id: context.orgId,
        name: requiredString(formData, "name"),
        duration_minutes: requiredNumber(formData, "durationMinutes"),
        is_paid: formData.get("isPaid") === "on",
        applies_after_hours: requiredNumber(formData, "appliesAfterHours"),
        created_by: user.id,
      });
      if (error) throw new Error(`Could not create the break policy: ${error.message}`);
      break;
    }
    case "update_break_policy": {
      const policyId = requiredString(formData, "policyId");
      const { error } = await supabase.from("attendance_break_policies").update({
        name: requiredString(formData, "name"),
        duration_minutes: requiredNumber(formData, "durationMinutes"),
        is_paid: formData.get("isPaid") === "on",
        applies_after_hours: requiredNumber(formData, "appliesAfterHours"),
        is_active: formData.get("isActive") === "on",
        updated_at: new Date().toISOString(),
      }).eq("org_id", context.orgId).eq("id", policyId);
      if (error) throw new Error(`Could not update the break policy: ${error.message}`);
      break;
    }
    case "start_break": {
      const employeeId = requiredString(formData, "employeeId");
      const locationId = optionalString(formData, "locationId");
      await validateLocation(context, locationId);
      const { data: employee, error: employeeError } = await supabase.from("employees")
        .select("id").eq("org_id", context.orgId).eq("id", employeeId).maybeSingle();
      if (employeeError) throw new Error(`Could not load the selected employee: ${employeeError.message}`);
      if (!employee) throw new Error("The selected employee does not belong to this organization.");
      const policyId = optionalString(formData, "policyId");
      if (policyId) {
        const { data: policy, error: policyError } = await supabase.from("attendance_break_policies")
          .select("id").eq("org_id", context.orgId).eq("id", policyId).eq("is_active", true).maybeSingle();
        if (policyError) throw new Error(`Could not load the break policy: ${policyError.message}`);
        if (!policy) throw new Error("Select an active break policy.");
      }
      const { error } = await supabase.from("attendance_break_sessions").insert({
        org_id: context.orgId,
        employee_id: employeeId,
        policy_id: policyId,
        location_id: locationId,
        notes: optionalString(formData, "notes"),
        created_by: user.id,
      });
      if (error) throw new Error(`Could not start the break: ${error.message}`);
      break;
    }
    case "end_break": {
      const { error } = await supabase.from("attendance_break_sessions").update({ ended_at: new Date().toISOString() })
        .eq("org_id", context.orgId).eq("id", requiredString(formData, "sessionId")).is("ended_at", null);
      if (error) throw new Error(`Could not end the break: ${error.message}`);
      break;
    }
    case "request_overtime": {
      const attendanceRecordId = requiredString(formData, "attendanceRecordId");
      const { data: record, error: recordError } = await supabase.from("attendance_records")
        .select("id, employee_id, location_id")
        .eq("org_id", context.orgId).eq("id", attendanceRecordId).maybeSingle();
      if (recordError) throw new Error(`Could not load the attendance record: ${recordError.message}`);
      if (!record) throw new Error("The selected attendance record does not exist.");
      await validateLocation(context, record.location_id);
      const { error } = await supabase.from("attendance_overtime_requests").insert({
        org_id: context.orgId,
        attendance_record_id: record.id,
        employee_id: record.employee_id,
        location_id: record.location_id,
        requested_hours: requiredNumber(formData, "requestedHours"),
        reason: requiredString(formData, "reason"),
        requested_by: user.id,
      });
      if (error) throw new Error(`Could not submit the overtime request: ${error.message}`);
      break;
    }
    case "review_overtime": {
      const decision = requiredString(formData, "decision");
      const { error } = await supabase.rpc("review_attendance_overtime_request", {
        p_request_id: requiredString(formData, "requestId"),
        p_decision: decision,
        p_approved_hours: decision === "approved" ? requiredNumber(formData, "approvedHours") : null,
        p_decision_note: optionalString(formData, "decisionNote"),
      });
      if (error) throw new Error(`Could not review the overtime request: ${error.message}`);
      break;
    }
    default:
      throw new Error("Unsupported attendance management action.");
  }

  revalidatePath("/hrm/attendance");
  revalidatePath("/hrm/attendance/shifts");
  revalidatePath("/hrm/attendance/locations");
  revalidatePath("/hrm/attendance/corrections");
  revalidatePath("/hrm/attendance/reports");
  revalidatePath("/hrm/attendance/breaks");
  revalidatePath("/hrm/attendance/calendar");
  revalidatePath("/hrm/attendance/overtime");
  revalidatePath("/hrm/attendance/settings");
}
