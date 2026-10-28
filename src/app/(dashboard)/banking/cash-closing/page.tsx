import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { approveCashClosingFromForm, approveCashClosingReopenFromForm, calculateExpectedCash, createCashClosing, rejectCashClosingFromForm, requestCashClosingExplanationFromForm, requestCashClosingReopenFromForm } from "./actions";
import { CashClosingReport } from "./report";
import { Banknote, CalendarDays, ChevronDown, ClipboardCheck, Clock3, Coins, Download, FileText, Printer, Receipt, Settings2, ShieldAlert, WalletCards } from "lucide-react";
import { DenominationInputs } from "./denomination-inputs";
import { BranchSelector } from "./branch-selector";
import { BranchScheduleEditor } from "./branch-schedule-editor";
import { BranchClosingStatusPanel } from "./branch-closing-status-panel";
import { CashClosingContextSelector } from "./cash-closing-context-selector";
import { OpenRegisterOverrideFields } from "./open-register-override-fields";
import { MissedClosingAcknowledgement } from "./missed-closing-acknowledgement";
import { UserSelector } from "./user-selector";
import { businessDateForSchedule, businessDateInTimeZone, findMissedCashClosings, getCashClosingPeriod } from "./shift-time";
import { getCurrencyConfigFromSettings, type CurrencyConfig, formatCurrencyAmount } from "@/lib/currency";
import { CashClosingAnalytics } from "./analytics";
import { canPermission, canTabPermission } from "@/lib/rbac/permissions";
import { getEnabledOrganizationModules } from "@/lib/supabase/platform-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { RestaurantFinancialSummary, type RestaurantFinancialSummaryData } from "@/components/restaurant/restaurant-financial-summary";

export const metadata = { title: "Cash Closing · SalesMate ERP" };

type CashClosingSearchParams = {
  error?: string;
  saved?: string;
  tab?: string;
  location_id?: string;
  date_from?: string;
  date_to?: string;
  shift?: string;
  classification?: string;
  user_id?: string;
  status?: string;
  search?: string;
  page?: string;
  closing_id?: string;
  business_date?: string;
  close_shift?: string;
};

export default async function CashClosingPage({ searchParams }: { searchParams?: Promise<CashClosingSearchParams> }) {
  const ctx = await getCurrentOrgContext();
  if (!ctx) return null;
  const canAccessEndOfDay =
    await canPermission("cash_closing", "view") ||
    await canPermission("cash_closing", "create");
  if (!canAccessEndOfDay) redirect("/dashboard");
  const [canCreateClosing, canApproveClosing, canEditClosing, canExportClosings, canPrintClosings, canManageBranchSchedules] = await Promise.all([
    canPermission("cash_closing", "create"),
    canPermission("cash_closing", "edit"),
    canPermission("cash_closing", "export"),
    canPermission("cash_closing", "print"),
    canPermission("settings", "edit"),
    canPermission("cash_closing", "approve"),
  ]);
  const params = (await searchParams) ?? {};
  const tab = params.tab === "variance" ? "history" : params.tab ?? "today";
  const db = await createClient() as any;
  const today = new Date().toISOString().slice(0, 10);
  const requestedLocationId = params.location_id || null;
  const selectedLocationId = requestedLocationId && (!ctx.isBranchScoped || ctx.allowedLocationIds.includes(requestedLocationId)) ? requestedLocationId : null;
  const scheduleLocationId = selectedLocationId ?? (ctx.isBranchScoped && ctx.allowedLocationIds.length === 1 ? ctx.allowedLocationIds[0] : null);
  const { data: organizationSettings, error: organizationSettingsError } = await db.from("org_general_settings")
    .select("timezone")
    .eq("org_id", ctx.orgId)
    .maybeSingle();
  const organizationTimeZone = organizationSettings?.timezone || "UTC";
  const selectedScheduleResult = scheduleLocationId
    ? await db.from("cash_closing_branch_schedules")
      .select("required_shifts, shift_windows, time_zone")
      .eq("org_id", ctx.orgId)
      .eq("location_id", scheduleLocationId)
      .maybeSingle()
    : { data: null, error: null };
  const selectedSchedule = selectedScheduleResult.data as { required_shifts?: string[]; shift_windows?: Record<string, { start: string; end: string }>; time_zone?: string | null } | null;
  const selectedTimeZone = selectedSchedule?.time_zone || organizationTimeZone;
  const summaryDate = scheduleLocationId
    ? businessDateForSchedule(
      new Date(),
      selectedTimeZone,
      selectedSchedule?.required_shifts ?? ["full_day"],
      selectedSchedule?.shift_windows ?? {},
    )
    : businessDateInTimeZone(new Date(), organizationTimeZone);
  const requestedBusinessDate = params.business_date;
  const selectedBusinessDate = requestedBusinessDate
    && /^\d{4}-\d{2}-\d{2}$/.test(requestedBusinessDate)
    && !Number.isNaN(Date.parse(`${requestedBusinessDate}T00:00:00Z`))
    ? requestedBusinessDate
    : summaryDate;
  const closeShiftOptions = ["full_day", "morning", "afternoon", "night"];
  const selectedCloseShift = closeShiftOptions.includes(params.close_shift ?? "")
    ? params.close_shift!
    : "full_day";
  const selectedShiftWindow = selectedCloseShift === "full_day"
    ? undefined
    : selectedSchedule?.shift_windows?.[selectedCloseShift] ?? {
      morning: { start: "06:00", end: "14:00" },
      afternoon: { start: "14:00", end: "22:00" },
      night: { start: "22:00", end: "06:00" },
    }[selectedCloseShift];
  const selectedClosingPeriod = getCashClosingPeriod(selectedBusinessDate, selectedCloseShift, selectedTimeZone, selectedShiftWindow);
  const dateFrom = params.date_from || "";
  const dateTo = params.date_to || "";
  const requestedShift = params.shift || "";
  const requestedClassification = params.classification || "";
  const requestedUserId = params.user_id || "";
  const effectiveUserId = ctx.canViewOtherTransactions ? requestedUserId : ctx.userId;
  const statusFilter = params.status || "";
  const searchText = params.search?.trim() || "";
  const pageNumber = Math.max(1, Number(params.page || 1) || 1);
  const pageSize = 25;
  type AnalyticsClosingRow = {
    id: string;
    location_id: string | null;
    closing_date: string;
    shift: string | null;
    expected_cash: number | string | null;
    actual_cash: number | string | null;
    variance: number | string | null;
    classification: string;
    status: string;
    approval_required: boolean;
    variance_reason: string | null;
    created_by: string;
  };
  type ClosingReportRow = {
    id: string;
    location_id: string | null;
    created_by: string;
    closing_date: string;
    shift: string | null;
    opening_cash: number | null;
    cash_sales: number | null;
    total_sales: number | null;
    credit_sales: number | null;
    cash_receipts: number | null;
    cash_customer_payments: number | null;
    cash_customer_e_cash: number | null;
    cash_e_cash: number | null;
    cash_refunds: number | null;
    cash_expenses: number | null;
    deposits: number | null;
    withdrawals: number | null;
    pos_cash_in: number | null;
    pos_cash_out: number | null;
    pos_register_session_count: number | null;
    actual_cash: number;
    expected_cash: number;
    variance: number;
    classification: string;
    status: string;
    approval_required: boolean;
    variance_reason: string | null;
  };
  const scopedLocations = (locations: Array<{ id: string; name: string }> | null | undefined) =>
    (locations ?? []).filter((location) => !ctx.isBranchScoped || ctx.allowedLocationIds.includes(location.id));
  const [{ data: locations }, { data: currencyRow }, { data: currencySettings }, { data: companyProfile }, { data: members }, summaryResult] = await Promise.all([
    db.from("business_locations").select("id, name").eq("org_id", ctx.orgId).eq("is_active", true).order("name"),
    db.from("currencies").select("*").eq("org_id", ctx.orgId).or("is_base.eq.true,is_default.eq.true").order("is_base", { ascending: false }).limit(1).maybeSingle(),
    db.from("currency_settings").select("*").eq("org_id", ctx.orgId).maybeSingle(),
    db.from("company_profile").select("company_name, logo_url").eq("org_id", ctx.orgId).maybeSingle(),
    db.from("organization_members").select("user_id, username, contact_email, invited_email, branch_scope, location_id, secondary_location_ids").eq("org_id", ctx.orgId).eq("status", "active"),
    selectedScheduleResult.error || organizationSettingsError
      ? Promise.resolve({ data: null, error: selectedScheduleResult.error
        ? `Could not load the selected branch schedule: ${selectedScheduleResult.error.message}`
        : `Could not load the organization timezone: ${organizationSettingsError?.message}` })
      : calculateExpectedCash(selectedBusinessDate, selectedLocationId, selectedCloseShift, effectiveUserId || null, selectedShiftWindow, selectedTimeZone)
        .then((data) => ({ data, error: "" }))
        .catch((error: unknown) => ({ data: null, error: error instanceof Error ? error.message : "Unable to calculate expected cash." })),
  ]);
  const memberIds = [...new Set((members ?? []).map((member: { user_id?: string | null }) => member.user_id).filter((id: string | null | undefined): id is string => Boolean(id)))];
  const memberProfilesResult = memberIds.length
    ? await db.from("profiles").select("id, full_name").in("id", memberIds)
    : { data: [], error: null };
  const memberProfileNames = new Map<string, string | null>((memberProfilesResult.data ?? []).map((profile: { id: string; full_name: string | null }) => [profile.id, profile.full_name]));
  const summary = summaryResult.data ?? { opening: 0, sales: 0, totalSales: 0, discounts: 0, creditSales: 0, customerPayments: 0, customerElectronicPayments: 0, electronic: 0, electronicBreakdown: {}, refunds: 0, expenses: 0, deposits: 0, withdrawals: 0, posCashIn: 0, posCashOut: 0, posRegisterSessionCount: 0, expected: 0 };
  const statusLocations = scopedLocations(locations);
  let restaurantSummary: RestaurantFinancialSummaryData | undefined;
  let restaurantSummaryError: string | null = null;
  if (tab === "today"
    && (await getEnabledOrganizationModules(ctx.orgId)).includes("Restaurant")
    && await canTabPermission("restaurant", "operations", "reports", "view")) {
    const restaurantLocationIds = statusLocations
      .filter((location) => !selectedLocationId || location.id === selectedLocationId)
      .map((location) => location.id);
    if (restaurantLocationIds.length > 0) {
      const { data: restaurantData, error: restaurantError } = await createAdminClient().rpc("get_restaurant_financial_summary", {
        p_org_id: ctx.orgId,
        p_location_ids: restaurantLocationIds,
        p_start_at: selectedClosingPeriod.start.toISOString(),
        p_end_at: selectedClosingPeriod.end.toISOString(),
        p_user_id: effectiveUserId,
      });
      if (restaurantError) restaurantSummaryError = restaurantError.message;
      else restaurantSummary = restaurantData as RestaurantFinancialSummaryData;
    }
  }
  const branchScheduleResult = statusLocations.length
    ? await db.from("cash_closing_branch_schedules")
      .select("location_id, required_shifts, shift_windows, time_zone, tracking_started_on")
      .eq("org_id", ctx.orgId)
      .in("location_id", statusLocations.map((location) => location.id))
    : { data: [], error: null };
  const branchSchedules = new Map<string, { requiredShifts: string[]; shiftWindows: Record<string, { start: string; end: string }>; timeZone: string; timeZoneOverride: string | null; trackingStartedOn: string | null }>(
    (branchScheduleResult.data ?? []).map((schedule: { location_id: string; required_shifts: string[]; shift_windows: Record<string, { start: string; end: string }> | null; time_zone: string | null; tracking_started_on: string | null }) =>
      [schedule.location_id, {
        requiredShifts: schedule.required_shifts,
        shiftWindows: schedule.shift_windows ?? {},
        timeZone: schedule.time_zone || organizationTimeZone,
        timeZoneOverride: schedule.time_zone,
        trackingStartedOn: schedule.tracking_started_on,
      }] as const),
  );
  const now = new Date();
  const statusDateByLocation = new Map(statusLocations.map((location) => [
    location.id,
    businessDateForSchedule(
      now,
      branchSchedules.get(location.id)?.timeZone ?? organizationTimeZone,
      branchSchedules.get(location.id)?.requiredShifts ?? ["full_day"],
      branchSchedules.get(location.id)?.shiftWindows ?? {},
    ),
  ]));
  const statusDates = [...new Set(statusDateByLocation.values())];
  const trackingStartedOnByLocation = new Map(statusLocations.map((location) => [
    location.id,
    branchSchedules.get(location.id)?.trackingStartedOn ?? businessDateInTimeZone(now, branchSchedules.get(location.id)?.timeZone ?? organizationTimeZone),
  ]));
  const oldestTrackingDate = [...trackingStartedOnByLocation.values()].sort()[0];
  const latestStatusDate = statusDates.sort().at(-1);
  type BranchActivityRow = Record<string, string | null> & { location_id: string | null };
  let branchActivityError: { message: string } | null = null;
  const activityDatesByLocation = new Map<string, Set<string>>();
  if (statusLocations.length && oldestTrackingDate && latestStatusDate) {
    const startTimestamp = new Date(Date.parse(`${oldestTrackingDate}T00:00:00.000Z`) - 2 * 24 * 60 * 60 * 1000).toISOString();
    const endTimestamp = new Date(Date.parse(`${latestStatusDate}T00:00:00.000Z`) + 3 * 24 * 60 * 60 * 1000).toISOString();
    const locationIds = statusLocations.map((location) => location.id);
    const loadActivityRows = async (makeQuery: () => any): Promise<BranchActivityRow[]> => {
      const rows: BranchActivityRow[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await makeQuery().range(offset, offset + 999);
        if (error) throw new Error(error.message);
        rows.push(...(data ?? []));
        if (!data || data.length < 1000) return rows;
      }
    };
    try {
      const [salesActivity, expenseActivity, customerPaymentActivity, drawerMovementActivity, registerSessionActivity] = await Promise.all([
        loadActivityRows(() => db.from("sales")
          .select("location_id, created_at, status_changed_at")
          .eq("org_id", ctx.orgId)
          .in("location_id", locationIds)
          .in("status", ["completed", "returned"])
          .or(`and(created_at.gte.${startTimestamp},created_at.lt.${endTimestamp}),and(status_changed_at.gte.${startTimestamp},status_changed_at.lt.${endTimestamp})`)),
        loadActivityRows(() => db.from("expenses")
          .select("location_id, expense_date, paid_on, created_at")
          .eq("org_id", ctx.orgId)
          .in("location_id", locationIds)
          .eq("payment_status", "paid")
          .or(`and(expense_date.gte.${oldestTrackingDate},expense_date.lte.${latestStatusDate}),and(paid_on.gte.${oldestTrackingDate},paid_on.lte.${latestStatusDate}),and(created_at.gte.${startTimestamp},created_at.lt.${endTimestamp})`)),
        loadActivityRows(() => db.from("customer_credit_payments")
          .select("location_id, payment_date, created_at")
          .eq("org_id", ctx.orgId)
          .in("location_id", locationIds)
          .or(`and(payment_date.gte.${oldestTrackingDate},payment_date.lte.${latestStatusDate}),and(created_at.gte.${startTimestamp},created_at.lt.${endTimestamp})`)),
        loadActivityRows(() => db.from("pos_cash_movements")
          .select("location_id, created_at")
          .eq("org_id", ctx.orgId)
          .in("location_id", locationIds)
          .gte("created_at", startTimestamp)
          .lt("created_at", endTimestamp)),
        loadActivityRows(() => db.from("pos_register_sessions")
          .select("location_id, opened_at")
          .eq("org_id", ctx.orgId)
          .in("location_id", locationIds)
          .gte("opened_at", startTimestamp)
          .lt("opened_at", endTimestamp)),
      ]);
      const addActivityDate = (locationId: string | null, date: string | null | undefined) => {
        if (!locationId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
        const dates = activityDatesByLocation.get(locationId) ?? new Set<string>();
        dates.add(date);
        activityDatesByLocation.set(locationId, dates);
      };
      const getActivitySchedule = (locationId: string | null) => locationId
        ? branchSchedules.get(locationId) ?? {
          requiredShifts: ["full_day"],
          shiftWindows: {
            morning: { start: "06:00", end: "14:00" },
            afternoon: { start: "14:00", end: "22:00" },
            night: { start: "22:00", end: "06:00" },
          },
          timeZone: organizationTimeZone,
          timeZoneOverride: null,
          trackingStartedOn: null,
        }
        : null;
      const addTimestampActivity = (rows: BranchActivityRow[], timestampFields: string[]) => {
        for (const row of rows) {
          const schedule = getActivitySchedule(row.location_id);
          if (!row.location_id || !schedule) continue;
          for (const field of timestampFields) {
            const timestamp = row[field];
            if (!timestamp) continue;
            const instant = new Date(timestamp);
            if (!Number.isNaN(instant.getTime())) {
              addActivityDate(row.location_id, businessDateForSchedule(instant, schedule.timeZone, schedule.requiredShifts, schedule.shiftWindows));
            }
          }
        }
      };
      addTimestampActivity(salesActivity, ["created_at", "status_changed_at"]);
      addTimestampActivity(drawerMovementActivity, ["created_at"]);
      addTimestampActivity(registerSessionActivity, ["opened_at"]);
      for (const row of expenseActivity) {
        const schedule = getActivitySchedule(row.location_id);
        if (schedule?.requiredShifts.includes("full_day")) {
          addActivityDate(row.location_id, row.paid_on ?? row.expense_date);
        } else {
          addTimestampActivity([row], ["created_at"]);
        }
      }
      for (const row of customerPaymentActivity) {
        const schedule = getActivitySchedule(row.location_id);
        if (schedule?.requiredShifts.includes("full_day")) {
          addActivityDate(row.location_id, row.payment_date);
        } else {
          addTimestampActivity([row], ["created_at"]);
        }
      }
    } catch (error) {
      branchActivityError = { message: error instanceof Error ? error.message : "Could not load branch transaction activity." };
    }
  }
  const branchClosings: Array<{ id: string; location_id: string | null; closing_date: string; shift: string | null; status: string }> = [];
  let branchClosingError: { message: string } | null = null;
  if (statusLocations.length && oldestTrackingDate && latestStatusDate) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("cash_closings")
        .select("id, location_id, closing_date, shift, status, created_at")
        .eq("org_id", ctx.orgId)
        .in("location_id", statusLocations.map((location) => location.id))
        .gte("closing_date", oldestTrackingDate)
        .lte("closing_date", latestStatusDate)
        .order("closing_date", { ascending: true })
        .order("created_at", { ascending: false })
        .range(offset, offset + 999);
      if (error) {
        branchClosingError = error;
        break;
      }
      branchClosings.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  const missedAcknowledgements: Array<{ location_id: string; closing_date: string; shift: string }> = [];
  let acknowledgementError: { message: string } | null = null;
  if (statusLocations.length && oldestTrackingDate && latestStatusDate) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("cash_closing_missed_shift_acknowledgements")
        .select("location_id, closing_date, shift")
        .eq("org_id", ctx.orgId)
        .in("location_id", statusLocations.map((location) => location.id))
        .gte("closing_date", oldestTrackingDate)
        .lte("closing_date", latestStatusDate)
        .range(offset, offset + 999);
      if (error) {
        acknowledgementError = error;
        break;
      }
      missedAcknowledgements.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  const branchClosingsByLocation = new Map<string, Array<{ id: string; closing_date: string; shift: string | null; status: string }>>();
  for (const closing of branchClosings) {
    if (!closing.location_id) continue;
    const closings = branchClosingsByLocation.get(closing.location_id) ?? [];
    closings.push({ id: closing.id, closing_date: closing.closing_date, shift: closing.shift, status: closing.status });
    branchClosingsByLocation.set(closing.location_id, closings);
  }
  const branchClosingStatuses = statusLocations.map((location) => {
    const branchClosingsForLocation = branchClosingsByLocation.get(location.id) ?? [];
    const schedule = branchSchedules.get(location.id);
    const timeZone = schedule?.timeZone ?? organizationTimeZone;
    const timeZoneOverride = schedule?.timeZoneOverride ?? null;
    const businessDate = statusDateByLocation.get(location.id) ?? today;
    const requiredShifts = schedule?.requiredShifts ?? ["full_day"];
    const hasBusinessActivity = (activityDatesByLocation.get(location.id) ?? new Set<string>()).has(businessDate);
    const closings = branchClosingsForLocation.filter((closing) => closing.closing_date === businessDate);
    const shiftWindows = schedule?.shiftWindows ?? {
      morning: { start: "06:00", end: "14:00" },
      afternoon: { start: "14:00", end: "22:00" },
      night: { start: "22:00", end: "06:00" },
    };
    const trackingStartedOn = trackingStartedOnByLocation.get(location.id) ?? businessDate;
    const missedClosings = findMissedCashClosings({
      startDate: trackingStartedOn,
      endDate: businessDate,
      requiredShifts,
      shiftWindows,
      timeZone,
      now,
      activeDates: [...(activityDatesByLocation.get(location.id) ?? [])],
      closings: branchClosingsForLocation.map((closing) => ({
        closingDate: closing.closing_date,
        shift: closing.shift ?? "full_day",
        status: closing.status,
      })),
      acknowledgements: missedAcknowledgements
        .filter((acknowledgement) => acknowledgement.location_id === location.id)
        .map(({ closing_date, shift }) => ({ closingDate: closing_date, shift })),
    });
    const requiredClosings = requiredShifts.map((shift) => ({
      shift,
      closing: closings.find((candidate) => candidate.shift === shift) ?? null,
    }));
    const issue = requiredClosings.find(({ closing }) => closing?.status === "reopened" || closing?.status === "rejected");
    const missingShifts = requiredClosings.filter(({ closing }) => !closing).map(({ shift }) => shift);
    const isShiftDue = (shift: string) => {
      if (shift === "full_day") return true;
      const window = shiftWindows[shift];
      if (!window) return true;
      const period = getCashClosingPeriod(businessDate, shift, timeZone, window);
      return period.end.getTime() <= now.getTime();
    };
    const dueMissingShifts = missingShifts.filter(isShiftDue);
    const completedShifts = requiredClosings.filter(({ closing }) => closing && closing.status !== "reopened" && closing.status !== "rejected");
    const detail = [
      requiredShifts.map((shift) => {
        if (shift === "full_day") return "Full day";
        const window = shiftWindows[shift];
        const label = shift === "night" ? "Night / overnight" : shift.charAt(0).toUpperCase() + shift.slice(1);
        return window ? `${label} ${window.start}–${window.end} (${timeZone})` : label;
      }).join(", "),
      completedShifts.some(({ closing }) => closing?.status === "pending_approval") ? "Pending approval" : null,
      dueMissingShifts.length ? `Overdue: ${dueMissingShifts.map((shift) => shift === "full_day" ? "Full day" : shift).join(", ")}` : null,
    ].filter(Boolean).join(" · ");
    const closingId = issue?.closing?.id ?? requiredClosings.find(({ closing }) => closing)?.closing?.id ?? null;
    if (issue?.closing?.status === "reopened") return { ...location, requiredShifts, shiftWindows, timeZone, timeZoneOverride, businessDate, missedClosings, state: "reopened" as const, detail: `Reopened · ${detail}`, closingId };
    if (issue?.closing?.status === "rejected") return { ...location, requiredShifts, shiftWindows, timeZone, timeZoneOverride, businessDate, missedClosings, state: "rejected" as const, detail: `Rejected · ${detail}`, closingId };
    if (missingShifts.length === 0) return { ...location, requiredShifts, shiftWindows, timeZone, timeZoneOverride, businessDate, missedClosings, state: "closed" as const, detail, closingId };
    if (!hasBusinessActivity && closings.length === 0) return {
      ...location,
      requiredShifts,
      shiftWindows,
      timeZone,
      timeZoneOverride,
      businessDate,
      missedClosings,
      state: "upcoming" as const,
      detail: "No transactions recorded; closing not required",
      closingId,
    };
    if (!dueMissingShifts.length) return {
      ...location,
      requiredShifts,
      shiftWindows,
      timeZone,
      timeZoneOverride,
      businessDate,
      missedClosings,
      state: closings.length ? "in_progress" as const : "upcoming" as const,
      detail,
      closingId,
    };
    return closings.length
      ? { ...location, requiredShifts, shiftWindows, timeZone, timeZoneOverride, businessDate, missedClosings, state: "partial" as const, detail, closingId }
      : { ...location, requiredShifts, shiftWindows, timeZone, timeZoneOverride, businessDate, missedClosings, state: "not_closed" as const, detail: "No required closing recorded", closingId: null };
  });
  const userOptions = (members ?? [])
    .filter((member: { branch_scope?: string | null; location_id?: string | null; secondary_location_ids?: string[] | null }) => {
      const assignedLocationIds = [
        member.location_id,
        ...(Array.isArray(member.secondary_location_ids) ? member.secondary_location_ids : []),
      ].filter((locationId): locationId is string => Boolean(locationId));
      if (selectedLocationId) {
        return member.branch_scope === "all" || assignedLocationIds.includes(selectedLocationId);
      }
      if (ctx.isBranchScoped) {
        return member.branch_scope === "all" || assignedLocationIds.some((locationId) => ctx.allowedLocationIds.includes(locationId));
      }
      return true;
    })
    .filter((member: { user_id?: string | null }) => member.user_id)
    .map((member: { user_id: string; username?: string | null; contact_email?: string | null; invited_email?: string | null }) => {
      const name = memberProfileNames.get(member.user_id)?.trim();
      return {
        id: member.user_id,
        name: name || member.username?.trim() || member.contact_email || member.invited_email || `User ${member.user_id.slice(0, 8)}`,
      };
    });
  const listDateFrom = tab === "today" ? today : dateFrom || "1900-01-01";
  const listDateTo = tab === "today" ? today : dateTo || "2999-12-31";
  const applyHistoryFilters = (query: any) => {
    query = query.eq("org_id", ctx.orgId)
      .gte("closing_date", listDateFrom)
      .lte("closing_date", listDateTo);
    if (ctx.isBranchScoped) query = query.in("location_id", ctx.allowedLocationIds);
    if (selectedLocationId) query = query.eq("location_id", selectedLocationId);
    if (effectiveUserId) query = query.eq("created_by", effectiveUserId);
    if (requestedShift) query = query.eq("shift", requestedShift);
    if (requestedClassification) query = query.eq("classification", requestedClassification);
    if (statusFilter) query = query.eq("status", statusFilter);
    if (tab === "approval") query = query.or("status.eq.pending_approval,and(status.eq.approved,reopen_status.eq.requested)");
    if (searchText) {
      const matchingBranchIds = scopedLocations(locations).filter((location: { name: string }) => location.name.toLowerCase().includes(searchText.toLowerCase())).map((location: { id: string }) => location.id);
      const matchingUserIds = userOptions.filter((user: { name: string }) => user.name.toLowerCase().includes(searchText.toLowerCase())).map((user: { id: string }) => user.id);
      const filters: string[] = [];
      if (/^[0-9a-f-]{36}$/i.test(searchText)) filters.push(`id.eq.${searchText}`, `created_by.eq.${searchText}`);
      if (matchingBranchIds.length) filters.push(`location_id.in.(${matchingBranchIds.join(",")})`);
      if (matchingUserIds.length) filters.push(`created_by.in.(${matchingUserIds.join(",")})`);
      if (!filters.length) query = query.eq("id", "00000000-0000-0000-0000-000000000000");
      else query = query.or(filters.join(","));
    }
    return query;
  };
  const listQuery = applyHistoryFilters(
    db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, total_sales, credit_sales, cash_receipts, cash_customer_payments, cash_customer_e_cash, cash_e_cash, cash_refunds, cash_expenses, deposits, withdrawals, pos_cash_in, pos_cash_out, pos_register_session_count, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at, created_by, submitted_at, closed_at, approved_by, approved_at, approval_decision, approval_comments, notes, reopen_status", { count: "exact" })
  ).order("created_at", { ascending: false }).range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1);
  const reportQuery = applyHistoryFilters(
    db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, total_sales, credit_sales, cash_receipts, cash_customer_payments, cash_customer_e_cash, cash_e_cash, cash_refunds, cash_expenses, deposits, withdrawals, pos_cash_in, pos_cash_out, pos_register_session_count, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at, created_by, submitted_at, closed_at, approved_by, approved_at, approval_decision, approval_comments, notes, reopen_status")
  );
  const [closingResult, analyticsResult, reportResult] = await Promise.all([
    listQuery,
    (async () => {
      let query = db.from("cash_closings").select("id, location_id, closing_date, shift, expected_cash, actual_cash, variance, classification, status, approval_required, variance_reason, created_by")
        .eq("org_id", ctx.orgId);
      if (ctx.isBranchScoped) query = query.in("location_id", ctx.allowedLocationIds);
      if (selectedLocationId) query = query.eq("location_id", selectedLocationId);
      if (effectiveUserId) query = query.eq("created_by", effectiveUserId);
      if (dateFrom) query = query.gte("closing_date", dateFrom);
      if (dateTo) query = query.lte("closing_date", dateTo);
      const rows: AnalyticsClosingRow[] = [];
      const batchSize = 1000;
      const orderedQuery = query.order("closing_date", { ascending: false });
      for (let offset = 0; ; offset += batchSize) {
        const { data, error } = await orderedQuery.range(offset, offset + batchSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data ?? []));
        if (!data || data.length < batchSize) break;
      }
      return { data: rows, error: null };
    })(),
    (async () => {
      const rows: ClosingReportRow[] = [];
      const batchSize = 1000;
      const orderedQuery = reportQuery.order("created_at", { ascending: false });
      for (let offset = 0; ; offset += batchSize) {
        const { data, error } = await orderedQuery.range(offset, offset + batchSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data ?? []));
        if (!data || data.length < batchSize) break;
      }
      return { data: rows, error: null };
    })(),
  ]);
  const accessibleClosings = (closingResult.data ?? []).filter((row: { location_id?: string | null }) =>
    !ctx.isBranchScoped || Boolean(row.location_id && ctx.allowedLocationIds.includes(row.location_id)));
  const analyticsClosings = (analyticsResult.data ?? []).filter((row: { location_id?: string | null }) =>
    !ctx.isBranchScoped || Boolean(row.location_id && ctx.allowedLocationIds.includes(row.location_id)));
  const allReportClosings = (reportResult.data ?? []).filter((row: { location_id?: string | null }) =>
    !ctx.isBranchScoped || Boolean(row.location_id && ctx.allowedLocationIds.includes(row.location_id)));
  const totalPages = Math.max(1, Math.ceil(Number(closingResult.count ?? accessibleClosings.length) / pageSize));
  const selectedClosing = params.closing_id
    ? accessibleClosings.find((row: { id: string }) => row.id === params.closing_id)
      ?? (await db.from("cash_closings").select("id, location_id, closing_date, shift, opening_cash, cash_sales, total_sales, credit_sales, cash_receipts, cash_customer_payments, cash_customer_e_cash, cash_e_cash, cash_refunds, cash_expenses, deposits, withdrawals, pos_cash_in, pos_cash_out, pos_register_session_count, actual_cash, expected_cash, variance, classification, status, approval_required, variance_reason, created_at, created_by, submitted_at, closed_at, approved_by, approved_at, approval_decision, approval_comments, notes, reopen_status")
        .eq("id", params.closing_id).eq("org_id", ctx.orgId).maybeSingle()).data
    : null;
  const visibleSelectedClosing = selectedClosing && (!ctx.isBranchScoped || Boolean(selectedClosing.location_id && ctx.allowedLocationIds.includes(selectedClosing.location_id)))
    && (ctx.canViewOtherTransactions || selectedClosing.created_by === ctx.userId) ? selectedClosing : null;
  const { data: selectedLines } = visibleSelectedClosing ? await db.from("cash_closing_lines").select("denomination, quantity").eq("closing_id", visibleSelectedClosing.id).eq("org_id", ctx.orgId).order("denomination") : { data: [] };
  const { data: selectedAudit } = visibleSelectedClosing
    ? await db.from("cash_closing_audit").select("action, actor_id, metadata, created_at").eq("closing_id", visibleSelectedClosing.id).eq("org_id", ctx.orgId).order("created_at", { ascending: false })
    : { data: [] };
  const currencyConfig: CurrencyConfig = getCurrencyConfigFromSettings({ code: currencyRow?.code ?? ctx.currency, name: currencyRow?.name, symbol: currencyRow?.symbol, ...currencySettings });
  const todayClosings = accessibleClosings.filter((r: { closing_date: string }) => r.closing_date === today);
  const variance = todayClosings.reduce((sum: number, row: { variance: number }) => sum + Number(row.variance ?? 0), 0);
  const filteredClosings = allReportClosings;
  const closingIds = filteredClosings.map((row: { id: string }) => row.id);
  const reportLines: Array<{ closing_id: string; denomination: number; quantity: number; amount: number }> = [];
  let reportLinesError = "";
  for (let offset = 0; offset < closingIds.length; offset += 500) {
    const { data, error } = await db.from("cash_closing_lines").select("closing_id, denomination, quantity, amount")
      .eq("org_id", ctx.orgId).in("closing_id", closingIds.slice(offset, offset + 500)).order("denomination");
    if (error) {
      reportLinesError = error.message;
      break;
    }
    reportLines.push(...(data ?? []));
  }
  const reportLinesByClosingId = new Map<string, Array<{ closing_id: string; denomination: number; quantity: number; amount: number }>>();
  for (const line of reportLines) {
    const lines = reportLinesByClosingId.get(line.closing_id) ?? [];
    lines.push(line);
    reportLinesByClosingId.set(line.closing_id, lines);
  }
  const reportClosings = filteredClosings.map((row) => ({
    ...row,
    branch_name: (locations ?? []).find((location: { id: string }) => location.id === row.location_id)?.name ?? "All branches",
    created_by_name: userOptions.find((user: { id: string }) => user.id === row.created_by)?.name ?? row.created_by.slice(0, 8),
    denomination_lines: reportLinesByClosingId.get(row.id) ?? [],
  }));
  const paginationUrl = (page: number) => {
    const query = new URLSearchParams();
    query.set("tab", tab);
    query.set("page", String(page));
    if (dateFrom) query.set("date_from", dateFrom);
    if (dateTo) query.set("date_to", dateTo);
    if (selectedLocationId) query.set("location_id", selectedLocationId);
    if (requestedUserId) query.set("user_id", requestedUserId);
    if (requestedShift) query.set("shift", requestedShift);
    if (requestedClassification) query.set("classification", requestedClassification);
    if (statusFilter) query.set("status", statusFilter);
    if (searchText) query.set("search", searchText);
    return `?${query.toString()}`;
  };
  const preservedFilterParams: Record<string, string> = { tab };
  if (dateFrom) preservedFilterParams.date_from = dateFrom;
  if (dateTo) preservedFilterParams.date_to = dateTo;
  if (selectedLocationId) preservedFilterParams.location_id = selectedLocationId;
  if (requestedUserId) preservedFilterParams.user_id = requestedUserId;
  if (requestedShift) preservedFilterParams.shift = requestedShift;
  if (requestedClassification) preservedFilterParams.classification = requestedClassification;
  if (statusFilter) preservedFilterParams.status = statusFilter;
  if (searchText) preservedFilterParams.search = searchText;
  const tabUrl = (nextTab: string) => {
    const query = new URLSearchParams(preservedFilterParams);
    query.set("tab", nextTab);
    query.delete("page");
    return `/banking/cash-closing?${query.toString()}#cash-closing-report`;
  };
  const reportDateLabel = tab === "today"
    ? today
    : dateFrom || dateTo
      ? `${dateFrom || "Beginning"} to ${dateTo || "Present"}`
      : "All dates";
  const reportUserLabel = effectiveUserId
    ? userOptions.find((user: { id: string }) => user.id === effectiveUserId)?.name ?? "Selected user"
    : "All users";
  const reportBranchLabel = selectedLocationId
    ? (locations ?? []).find((location: { id: string }) => location.id === selectedLocationId)?.name ?? "Selected branch"
    : "All accessible branches";
  const reportFilterDescription = [
    reportDateLabel,
    reportBranchLabel,
    reportUserLabel,
    requestedShift ? requestedShift.replace("_", " ") : null,
    requestedClassification || null,
    statusFilter || null,
    searchText ? `Search: ${searchText}` : null,
  ].filter(Boolean).join(" · ");
  const canOverrideOpenRegister = await canPermission("cash_closing", "approve");
  let openRegistersQuery = db.from("pos_register_sessions")
    .select("id, location_id, register_name, cashier_id, cashier_name, opened_at")
    .eq("org_id", ctx.orgId)
    .eq("status", "open")
    .lt("opened_at", selectedClosingPeriod.end.toISOString());
  if (selectedLocationId) {
    openRegistersQuery = openRegistersQuery.eq("location_id", selectedLocationId);
  } else if (ctx.isBranchScoped) {
    openRegistersQuery = openRegistersQuery.in("location_id", ctx.allowedLocationIds);
  }
  const { data: openRegisterRows, error: openRegisterQueryError } = tab === "today" && canCreateClosing
    ? await openRegistersQuery
    : { data: [], error: null };
  const openRegisterSessions = (openRegisterRows ?? []).map((session: {
    id: string;
    location_id: string;
    register_name: string;
    cashier_id: string;
    cashier_name: string | null;
    opened_at: string;
  }) => ({
    id: session.id,
    registerName: session.register_name,
    cashierName: session.cashier_name || userOptions.find((user: { id: string }) => user.id === session.cashier_id)?.name || `Cashier ${session.cashier_id.slice(0, 8)}`,
    branchName: (locations ?? []).find((location: { id: string }) => location.id === session.location_id)?.name ?? "Branch",
    openedAt: session.opened_at,
  }));
  const cards = [
    ["Opening Cash", summary.opening, "bg-emerald-50 text-emerald-600", WalletCards],
    ["Cash Sales", summary.sales, "bg-blue-50 text-blue-600", Receipt],
    ["E-cash / MoMo Sales", summary.electronic, "bg-accentTeal-soft text-accentTeal", Coins],
    ["Total Sales", summary.totalSales, "bg-signal-soft text-signal", Receipt],
    ["Customer Payment (Cash)", summary.customerPayments, "bg-violet-50 text-violet-600", Coins],
    ["Customer Payment (E-cash)", summary.customerElectronicPayments, "bg-cyan-50 text-cyan-700", Coins],
    ["Unpaid Credit Balance", summary.creditSales, "bg-amber-50 text-amber-600", Coins],
    ["Cash Refunds", summary.refunds, "bg-rose-50 text-rose-600", Receipt],
    ["Cash Expenses", summary.expenses, "bg-orange-50 text-orange-600", Banknote],
    ["POS Drawer Cash In", summary.posCashIn, "bg-emerald-50 text-emerald-700", WalletCards],
    ["POS Drawer Cash Out", summary.posCashOut, "bg-rose-50 text-rose-600", WalletCards],
  ] as const;
  return (
    <div className="end-of-day-page min-h-full bg-[#f4f8fc] px-4 py-5 dark:bg-ink-950 md:px-6">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><div className="mb-2 flex items-center gap-2 text-xs text-[#3975ae]"><span>Accounting</span><span>/</span><span className="text-ledger-500">End Of Day Accounts</span></div>          <div className="flex items-center gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-[#3d9bf4] to-[#1670d2] text-white shadow-md"><WalletCards className="h-6 w-6" /></div><div><h1 className="text-2xl font-bold tracking-tight text-[#12345a] dark:text-white">End Of Day Accounts</h1><p className="text-xs text-ledger-500">Total Sales includes all sales recorded today, including unpaid credit. Expected cash uses register floats and physical drawer movements only.</p></div></div></div>
          <div className="flex flex-wrap items-end justify-end gap-2">
            <BranchSelector selectedLocationId={selectedLocationId} locations={scopedLocations(locations)} isBranchScoped={ctx.isBranchScoped} selectedUserId={effectiveUserId} preservedParams={preservedFilterParams} />
            {ctx.canViewOtherTransactions && <UserSelector selectedUserId={requestedUserId} selectedLocationId={selectedLocationId} users={userOptions} preservedParams={preservedFilterParams} />}
            <form method="get" className="flex flex-wrap items-end gap-2 rounded-lg border border-[#d5e2ef] bg-white p-2 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
              <input type="hidden" name="tab" value={tab} />
              {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
              {requestedUserId && <input type="hidden" name="user_id" value={requestedUserId} />}
              {requestedShift && <input type="hidden" name="shift" value={requestedShift} />}
              {requestedClassification && <input type="hidden" name="classification" value={requestedClassification} />}
              {statusFilter && <input type="hidden" name="status" value={statusFilter} />}
              {searchText && <input type="hidden" name="search" value={searchText} />}
              <label className="text-[10px] font-medium text-ledger-500">From<input name="date_from" type="date" defaultValue={dateFrom} className="mt-1 block h-8 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label>
              <label className="text-[10px] font-medium text-ledger-500">To<input name="date_to" type="date" defaultValue={dateTo} className="mt-1 block h-8 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label>
              <button className="h-8 rounded bg-[#1478dd] px-3 text-xs font-semibold text-white" type="submit"><CalendarDays className="mr-1 inline h-3.5 w-3.5" />Apply</button>
            </form>
          </div>
        </div>
        {params.error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{params.error}</div>}
        {params.saved && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Cash closing saved successfully.</div>}
        {summaryResult.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Cash summary could not be calculated: {summaryResult.error}</div>}
        {openRegisterQueryError && tab === "today" && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Open POS registers could not be verified: {openRegisterQueryError.message}. Cash closing is blocked until this check succeeds.</div>}
        {(branchClosingError || acknowledgementError || branchScheduleResult.error || branchActivityError) && ctx.canViewOtherTransactions && tab === "today" && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Branch closing statuses could not be loaded: {branchClosingError?.message ?? acknowledgementError?.message ?? branchScheduleResult.error?.message ?? branchActivityError?.message}</div>}
        {closingResult.error && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Closing records could not be loaded: {closingResult.error.message}</div>}
        {reportResult.error && (tab === "history" || tab === "today") && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Complete report records could not be loaded: {reportResult.error.message}</div>}
        {reportLinesError && (tab === "history" || tab === "today") && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Report denomination details could not be loaded: {reportLinesError}</div>}
        {analyticsResult.error && tab === "analytics" && <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">Analytics could not be loaded: {analyticsResult.error.message}</div>}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">{cards.map(([label, value, tone, Icon]) => <div key={label} title={label === "E-cash / MoMo Sales" ? (Object.entries(summary.electronicBreakdown).length ? Object.entries(summary.electronicBreakdown).map(([method, amount]) => `${method}: ${formatCurrencyAmount(amount, currencyConfig)}`).join("\n") : "No electronic sales recorded today.") : undefined} className={`rounded-xl border border-[#dce8f2] p-4 shadow-sm dark:border-ledger-700 ${label === "Total Sales" ? "bg-signal-soft" : "bg-white dark:bg-ink-900"}`}><div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-full ${tone}`}><Icon className="h-4 w-4" /></div><p className={`text-[11px] font-medium text-ledger-500 ${label === "E-cash / MoMo Sales" ? "cursor-help" : ""}`}>{label}</p><p className={`mt-1 text-lg font-bold ${label === "Total Sales" ? "text-signal" : "text-[#17385d] dark:text-white"}`}>{formatCurrencyAmount(Number(value), currencyConfig)}</p></div>)}</div>
        {tab === "today" && restaurantSummaryError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">Restaurant reconciliation totals could not be loaded: {restaurantSummaryError}</p>}
        {tab === "today" && restaurantSummary && <RestaurantFinancialSummary
          summary={restaurantSummary}
          currency={currencyConfig.code}
          periodLabel={`${selectedBusinessDate} · ${selectedCloseShift.replaceAll("_", " ")}${selectedLocationId ? ` · ${statusLocations.find((location) => location.id === selectedLocationId)?.name ?? "Selected branch"}` : " · All accessible branches"}`}
          href="/restaurant?view=reports"
        />}
        {tab === "today" && ctx.canViewOtherTransactions && !branchClosingError && !acknowledgementError && !branchScheduleResult.error && !branchActivityError && <BranchClosingStatusPanel summary={`Current business date · ${branchClosingStatuses.filter((branch) => branch.state === "closed").length} closed · ${branchClosingStatuses.filter((branch) => branch.state === "partial" || branch.state === "in_progress").length} in progress · ${branchClosingStatuses.filter((branch) => branch.state === "not_closed" || branch.state === "reopened" || branch.state === "rejected").length} need attention · ${branchClosingStatuses.reduce((count, branch) => count + branch.missedClosings.length, 0)} past-due closings outstanding`}>
          <p className="px-4 pt-3 text-[11px] text-ledger-500">Past-due shifts stay listed until a closing is recorded or a manager explicitly acknowledges the miss. Overnight closings use the date the shift started.</p>
          {branchClosingStatuses.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {branchClosingStatuses.map((branch) => {
              const tone = branch.state === "closed"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : branch.state === "partial"
                  ? "border-amber-200 bg-amber-50 text-amber-700"
                  : branch.state === "reopened"
                    ? "border-orange-200 bg-orange-50 text-orange-700"
                     : branch.state === "upcoming" || branch.state === "in_progress"
                       ? "border-blue-200 bg-blue-50 text-blue-700"
                       : "border-red-200 bg-red-50 text-red-700";
              const statusLabel = branch.state === "not_closed" ? "Not closed" : branch.state === "reopened" ? "Reopened" : branch.state === "rejected" ? "Rejected" : branch.state === "partial" ? "Partial" : branch.state === "upcoming" ? "Scheduled" : branch.state === "in_progress" ? "In progress" : "Closed";
              const href = branch.closingId
                ? `/banking/cash-closing?tab=history&date_from=${branch.businessDate}&date_to=${branch.businessDate}&location_id=${branch.id}&closing_id=${branch.closingId}#cash-closing-report`
                : `/banking/cash-closing?tab=history&date_from=${branch.businessDate}&date_to=${branch.businessDate}&location_id=${branch.id}#cash-closing-report`;
              return <div key={branch.id} className="rounded-lg border border-[#e5edf5] p-3 dark:border-ledger-700">
                <Link href={href} className="flex items-center justify-between gap-3 transition">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-[#17385d] dark:text-white">{branch.name}</span><span className="mt-1 block text-[11px] text-ledger-500">{branch.businessDate} · {branch.detail}</span></span>
                  <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${tone}`}>{statusLabel}</span>
                </Link>
                {branch.missedClosings.length > 0 && <div className="mt-3 border-t border-amber-100 pt-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">Outstanding missed closings ({branch.missedClosings.length})</p>
                  <ul className="mt-1 space-y-1.5">
                    {branch.missedClosings.slice(0, 5).map((missed) => (
                      <li key={`${missed.closingDate}-${missed.shift}`} className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <Link
                          href={`/banking/cash-closing?tab=today&business_date=${missed.closingDate}&location_id=${branch.id}&close_shift=${missed.shift}#declare-cash`}
                          className="font-medium text-amber-900 underline decoration-amber-300 underline-offset-2"
                        >
                          {missed.closingDate} · {missed.shift === "full_day" ? "Full day" : missed.shift}
                        </Link>
                        {canManageBranchSchedules && <MissedClosingAcknowledgement locationId={branch.id} closingDate={missed.closingDate} shift={missed.shift} />}
                      </li>
                    ))}
                  </ul>
                  {branch.missedClosings.length > 5 && <p className="mt-1 text-[10px] text-ledger-500">And {branch.missedClosings.length - 5} older missed closing(s).</p>}
                </div>}
                {canManageBranchSchedules && <BranchScheduleEditor key={`${branch.id}-${branch.requiredShifts.join(",")}-${branch.timeZoneOverride ?? "organization"}`} locationId={branch.id} requiredShifts={branch.requiredShifts} shiftWindows={branch.shiftWindows} timeZoneOverride={branch.timeZoneOverride} organizationTimeZone={organizationTimeZone} />}
              </div>;
            })}
          </div> : <p className="p-4 text-sm text-ledger-500">No active branches are available to review.</p>}
        </BranchClosingStatusPanel>}
        <nav className="flex flex-wrap gap-2 border-b border-ledger-200 pb-2 text-sm dark:border-ledger-700">{[["today", "Today's Closings"], ["history", "Closing History"], ["approval", "Approval Queue"], ["analytics", "Analytics"]].map(([key, label]) => <a key={key} href={tabUrl(key)} className={`rounded-md px-3 py-2 ${tab === key ? "text-[var(--theme-primary)]" : "text-ledger-600 hover:bg-ledger-100 dark:text-ledger-300"}`} style={tab === key ? { background: "var(--theme-primary-pale)" } : undefined}>{label}</a>)}</nav>
        {(tab === "history" || tab === "approval") && (
          <section className="overflow-hidden rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e5edf5] p-4">
              <div><h2 className="font-bold text-[#17385d] dark:text-white">{tab === "history" ? "Closing History" : "Approval Queue"}</h2><p className="text-xs text-ledger-500">{tab === "history" ? "All saved closings, including today. Use the date filter to review a specific period." : "Review pending approvals and controlled reopen requests."}</p></div>
              <form className="flex flex-wrap items-end gap-2" method="get">
                <input type="hidden" name="tab" value={tab} />
                {dateFrom && <input type="hidden" name="date_from" value={dateFrom} />}
                {dateTo && <input type="hidden" name="date_to" value={dateTo} />}
                {selectedLocationId && <input type="hidden" name="location_id" value={selectedLocationId} />}
                {requestedUserId && <input type="hidden" name="user_id" value={requestedUserId} />}
                {requestedShift && <input type="hidden" name="shift" value={requestedShift} />}
                {requestedClassification && <input type="hidden" name="classification" value={requestedClassification} />}
                <input name="search" defaultValue={searchText} placeholder="Closing ID, user, branch" className="h-8 w-44 rounded border px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" />
                <select name="shift" defaultValue={requestedShift} className="h-8 rounded border px-2 text-xs"><option value="">All shifts</option><option value="full_day">Full day</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option></select>
                <select name="classification" defaultValue={requestedClassification} className="h-8 rounded border px-2 text-xs"><option value="">All variance types</option><option value="balanced">Balanced</option><option value="shortage">Shortage</option><option value="excess">Excess</option></select>
                {tab !== "approval" && <select name="status" defaultValue={statusFilter} className="h-8 rounded border px-2 text-xs"><option value="">All statuses</option><option value="pending_approval">Pending approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="reopened">Reopened</option></select>}
                <button className="h-8 rounded bg-[#1478dd] px-3 text-xs font-semibold text-white" type="submit">Filter</button>
              </form>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="bg-[#f5f9fc] text-[11px] uppercase tracking-wide text-ledger-500 dark:bg-white/[0.03]">
                  <tr><th className="px-4 py-3">Date / Closing</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">User</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Expected</th><th className="px-4 py-3">Actual</th><th className="px-4 py-3">Variance</th><th className="px-4 py-3">Status / Approval</th><th className="px-4 py-3">Closing Time</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {accessibleClosings.length ? accessibleClosings.map((row: { id: string; location_id?: string | null; closing_date: string; shift?: string; expected_cash: number; actual_cash: number; variance: number; status: string; created_by: string; submitted_at?: string; closed_at?: string; approved_at?: string; approval_decision?: string; reopen_status?: string }) => (
                    <tr key={row.id}>
                      <td className="px-4 py-3"><span className="block">{row.closing_date}</span><span className="text-[10px] text-ledger-500">{row.id.slice(0, 8)}</span></td>
                      <td className="px-4 py-3">{(locations ?? []).find((location: { id: string }) => location.id === row.location_id)?.name ?? "All branches"}</td>
                      <td className="px-4 py-3">{userOptions.find((user: { id: string }) => user.id === row.created_by)?.name ?? row.created_by.slice(0, 8)}</td>
                      <td className="px-4 py-3 capitalize">{(row.shift ?? "full_day").replace("_", " ")}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.expected_cash), currencyConfig)}</td>
                      <td className="px-4 py-3">{formatCurrencyAmount(Number(row.actual_cash), currencyConfig)}</td>
                      <td className={`px-4 py-3 font-semibold ${Number(row.variance) < 0 ? "text-red-500" : Number(row.variance) > 0 ? "text-amber-600" : "text-emerald-600"}`}>{formatCurrencyAmount(Number(row.variance), currencyConfig)}</td>
                      <td className="px-4 py-3"><span className="block capitalize">{row.status.replace("_", " ")}</span><span className="text-[10px] text-ledger-500">{row.approval_decision ?? (row.status === "pending_approval" ? "Awaiting decision" : "—")}</span></td>
                      <td className="px-4 py-3 text-[10px]">{row.closed_at ? new Date(row.closed_at).toLocaleString() : "—"}</td>
                      <td className="space-y-2 px-4 py-3">
                        <a className="block text-[#1675d1] underline" href={`?tab=${tab}&closing_id=${row.id}#closing-details`}>{tab === "approval" ? "Review" : "View details"}</a>
                        {canApproveClosing && tab === "approval" && row.status === "pending_approval" && <div className="space-y-2">
                          <form action={approveCashClosingFromForm}><input type="hidden" name="id" value={row.id} /><button className="rounded-md bg-[#1478dd] px-2.5 py-1.5 text-[11px] font-semibold text-white" type="submit">Approve</button></form>
                          <form action={rejectCashClosingFromForm} className="space-y-1"><input type="hidden" name="id" value={row.id} /><input name="reason" required placeholder="Decision comments" className="h-8 w-40 rounded border px-2 text-[11px]" /><button className="rounded-md border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600" type="submit">Reject</button></form>
                          <form action={requestCashClosingExplanationFromForm} className="space-y-1"><input type="hidden" name="id" value={row.id} /><input name="message" required placeholder="Explanation request" className="h-8 w-40 rounded border px-2 text-[11px]" /><button className="rounded-md border px-2.5 py-1.5 text-[11px] font-semibold text-ledger-600" type="submit">Request explanation</button></form>
                        </div>}
                        {canApproveClosing && tab === "approval" && row.status === "approved" && row.reopen_status === "requested" && <form action={approveCashClosingReopenFromForm}><input type="hidden" name="id" value={row.id} /><button className="rounded-md border border-amber-300 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">Approve reopen</button></form>}
                      </td>
                    </tr>
                  )) : <tr><td colSpan={10} className="px-4 py-10 text-center text-sm text-ledger-500">No closing records match this view.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t p-3 text-xs text-ledger-500">
              <span>Page {pageNumber} of {totalPages} · {closingResult.count ?? accessibleClosings.length} record(s)</span>
              <div className="flex gap-2">
                {pageNumber > 1 && <a className="rounded border px-3 py-1.5" href={paginationUrl(pageNumber - 1)}>Previous</a>}
                {pageNumber < totalPages && <a className="rounded border px-3 py-1.5" href={paginationUrl(pageNumber + 1)}>Next</a>}
              </div>
            </div>
          </section>
        )}
        {visibleSelectedClosing && <section id="closing-details" className="rounded-xl border border-[#dce8f2] bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
          <div className="mb-4 flex items-center justify-between"><div><h2 className="font-bold text-[#17385d] dark:text-white">Closing Details · {visibleSelectedClosing.id}</h2><p className="text-xs text-ledger-500">{visibleSelectedClosing.closing_date} · {(visibleSelectedClosing.shift ?? "full_day").replace("_", " ")} · {(visibleSelectedClosing.status ?? "pending").replaceAll("_", " ")}</p></div><a className="text-xs text-[#1675d1] underline" href={`?tab=${tab}`}>Close</a></div>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6 text-xs">
            {([["Opening cash", visibleSelectedClosing.opening_cash], ["Cash sales", visibleSelectedClosing.cash_sales], ["Total sales", visibleSelectedClosing.total_sales ?? (Number(visibleSelectedClosing.cash_sales ?? 0) + Number(visibleSelectedClosing.cash_e_cash ?? 0) + Number(visibleSelectedClosing.cash_receipts ?? 0))], ["Unpaid credit balance", visibleSelectedClosing.credit_sales ?? visibleSelectedClosing.cash_receipts], ["Customer cash payments", visibleSelectedClosing.cash_customer_payments], ["Customer payment (E-cash)", visibleSelectedClosing.cash_customer_e_cash], ["E-cash sales (excluded from drawer)", visibleSelectedClosing.cash_e_cash], ["Cash refunds", visibleSelectedClosing.cash_refunds], ["Cash expenses", visibleSelectedClosing.cash_expenses], ["POS cash in", visibleSelectedClosing.pos_cash_in], ["POS cash out / paid out", visibleSelectedClosing.pos_cash_out], ["POS register sessions", visibleSelectedClosing.pos_register_session_count], ["Expected cash", visibleSelectedClosing.expected_cash], ["Actual cash", visibleSelectedClosing.actual_cash], ["Variance", visibleSelectedClosing.variance]] as const).map(([label, value]) => <div key={label} className="rounded-lg bg-[#f5f9fc] p-3"><p className="text-ledger-500">{label}</p><strong className="mt-1 block text-[#17385d]">{label === "POS register sessions" ? Number(value ?? 0) : formatCurrencyAmount(Number(value ?? 0), currencyConfig)}</strong></div>)}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Variance reason and notes</h3><p className="rounded-lg border p-3 text-xs">{visibleSelectedClosing.variance_reason || "No reason recorded."}</p><p className="mt-2 rounded-lg border p-3 text-xs">{visibleSelectedClosing.notes || "No user notes recorded."}</p>{visibleSelectedClosing.approval_comments && <p className="mt-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs">Approval decision comments: {visibleSelectedClosing.approval_comments}</p>}</div>
            <div><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Cash count lines</h3><p className="rounded-lg border p-3 text-xs">{selectedLines?.length ? selectedLines.map((line: { denomination: number; quantity: number }) => `${line.denomination} × ${line.quantity}`).join(" · ") : "No denomination lines recorded."}</p></div>
          </div>
          {canApproveClosing && visibleSelectedClosing.status === "pending_approval" && <div className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4">
            <form action={approveCashClosingFromForm} className="flex items-end gap-2"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Approval comments<input name="comments" className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded bg-[#1478dd] px-4 text-xs font-semibold text-white">Approve closing</button></form>
            <form action={rejectCashClosingFromForm} className="flex items-end gap-2"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Rejection reason<input name="reason" required className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded border border-red-200 px-4 text-xs font-semibold text-red-600">Reject</button></form>
          </div>}
          {canEditClosing && visibleSelectedClosing.status === "approved" && visibleSelectedClosing.reopen_status === "none" && <form action={requestCashClosingReopenFromForm} className="mt-4 flex flex-wrap items-end gap-2 border-t pt-4"><input type="hidden" name="id" value={visibleSelectedClosing.id} /><label className="text-xs">Reason to reopen<input name="reason" required className="mt-1 h-9 rounded border px-2" /></label><button className="h-9 rounded border border-amber-300 px-4 text-xs font-semibold text-amber-700">Request controlled reopen</button></form>}
          <div className="mt-4 border-t pt-4"><h3 className="mb-2 text-sm font-semibold text-[#17385d]">Audit trail</h3>{selectedAudit?.length ? <ol className="space-y-2">{selectedAudit.map((event: { action: string; actor_id: string; metadata?: Record<string, unknown>; created_at: string }, index: number) => <li key={`${event.created_at}-${index}`} className="flex flex-wrap justify-between gap-2 rounded-md bg-[#f5f9fc] p-2 text-xs"><span><strong className="capitalize">{event.action.replaceAll("_", " ")}</strong> · {userOptions.find((user: { id: string }) => user.id === event.actor_id)?.name ?? event.actor_id.slice(0, 8)}{typeof event.metadata?.reason === "string" ? ` · ${event.metadata.reason}` : ""}</span><time>{new Date(event.created_at).toLocaleString()}</time></li>)}</ol> : <p className="text-xs text-ledger-500">No audit events are recorded.</p>}</div>
        </section>}
        {tab === "history" && !reportResult.error && !reportLinesError && <CashClosingReport closings={reportClosings} currency={currencyConfig} organizationName={companyProfile?.company_name ?? ctx.orgName} logoUrl={companyProfile?.logo_url ?? null} filterDescription={reportFilterDescription} canExport={canExportClosings} canPrint={canPrintClosings} />}
        {tab === "today" && <>
        <CashClosingContextSelector
          date={selectedBusinessDate}
          locationId={selectedLocationId ?? ""}
          locations={scopedLocations(locations)}
          shift={selectedCloseShift}
        />
        <div className="grid gap-4 xl:grid-cols-[1.1fr_1.25fr_0.9fr_260px]">
          <section className="rounded-xl border border-[#dce8f2] bg-white shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="border-b border-[#e5edf5] p-4"><h2 className="font-bold text-[#17385d] dark:text-white">Cash Summary</h2></div><div className="divide-y divide-[#edf2f7] px-4">{[["Opening Cash", summary.opening], ["Cash Sales", summary.sales], ["E-cash / MoMo Sales", summary.electronic], ["Total Sales", summary.totalSales], ["Unpaid Credit Balance", summary.creditSales], ["Customer Payment (Cash)", summary.customerPayments], ["Customer Payment (E-cash)", summary.customerElectronicPayments], ["Refund / Return Sales", -summary.refunds], ["Cash Expenses", -summary.expenses], ["POS Drawer Cash In", summary.posCashIn], ["POS Drawer Cash Out / Paid Out", -summary.posCashOut]].map(([label, value]) => <div key={String(label)} className={`flex items-center justify-between py-3 text-xs ${label === "Total Sales" ? "bg-signal-soft px-2 text-signal" : ""}`}><span className={label === "Total Sales" ? "font-semibold text-signal" : String(label).startsWith("E-cash") ? "font-medium text-accentTeal" : "text-ledger-600"}>{label}</span><strong className={Number(value) < 0 ? "text-red-500" : label === "Total Sales" ? "text-signal" : String(label).startsWith("E-cash") ? "text-accentTeal" : "text-[#244e75] dark:text-white"}>{Number(value) < 0 ? "- " : ""}{formatCurrencyAmount(Math.abs(Number(value)), currencyConfig)}</strong></div>)}</div><div className="m-4 flex items-center justify-between rounded-lg bg-[#edf7ff] px-3 py-4"><span className="text-sm font-bold text-[#31577c]">Expected Closing Cash</span><strong className="text-lg text-[#1675d1]">{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div><p className="px-4 pb-4 text-xs text-ledger-500">Opening cash is summed from register sessions opened today ({summary.posRegisterSessionCount} session(s)). E-cash / MoMo sales, customer e-cash payments, and credit balances are informational, not drawer cash. Bank account deposits/withdrawals are excluded from this cash expectation.</p></section>
          {canCreateClosing && <section id="declare-cash" className="scroll-mt-6 rounded-xl border border-[#dce8f2] bg-white p-5 shadow-sm dark:border-ledger-700 dark:bg-ink-900">
            <div className="mb-3 flex items-center gap-2"><ClipboardCheck className="h-5 w-5 text-[#1675d1]" /><h2 className="font-bold text-[#17385d] dark:text-white">Declare Your Cash</h2></div>
            <p className="mb-5 rounded-lg bg-[#f0f7fd] p-3 text-xs leading-5 text-ledger-600">Count your physical cash and enter the total amount below. The system will compare it with the expected cash.</p>
            <p className="mb-3 text-xs text-ledger-500">
              Closing for {selectedBusinessDate} · {selectedCloseShift === "full_day" ? "Full day" : selectedCloseShift} · {selectedLocationId ? locations?.find((location: { id: string }) => location.id === selectedLocationId)?.name : "All accessible branches"}
            </p>
            <form action={createCashClosing} className="space-y-3">
              <input type="hidden" name="closing_date" value={selectedBusinessDate} />
              <input type="hidden" name="location_id" value={selectedLocationId ?? scheduleLocationId ?? ""} />
              <input type="hidden" name="shift" value={selectedCloseShift} />
              <div className="border-t border-ledger-100 pt-3">
                <p className="mb-2 text-xs font-bold text-[#31577c]">Cash Count Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-xs">Notes<input name="notes_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label>
                  <label className="text-xs">Coins<input name="coin_count" type="number" min="0" step="0.01" defaultValue="0" className="mt-1 h-9 w-full rounded-md border border-ledger-200 px-2 dark:border-ledger-700 dark:bg-ink-950" /></label>
                </div>
              </div>
              <DenominationInputs expectedCash={summary.expected} currency={currencyConfig} />
              {openRegisterSessions.length > 0 && <OpenRegisterOverrideFields canOverride={canOverrideOpenRegister} sessions={openRegisterSessions} />}
              <label className="text-xs">Reason for Variance
                <span className="mt-1 block text-[11px] text-ledger-500">Briefly explain why the physical cash differs from the expected amount.</span>
                <textarea name="variance_reason" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" />
              </label>
              <label className="text-xs">Comments<textarea name="notes" rows={2} className="mt-1 w-full rounded-md border border-ledger-200 p-2 dark:border-ledger-700 dark:bg-ink-950" /></label>
              <button
                className="h-10 w-full rounded-md bg-[#1478dd] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f65bd] disabled:cursor-not-allowed disabled:opacity-50"
                type="submit"
                disabled={Boolean(openRegisterQueryError) || (openRegisterSessions.length > 0 && !canOverrideOpenRegister)}
              >
                Complete Closing
              </button>
            </form>
          </section>}
          <section className={`rounded-xl border p-4 shadow-sm ${variance < 0 ? "border-red-200 bg-red-50/50" : variance > 0 ? "border-amber-200 bg-amber-50/50" : "border-emerald-200 bg-emerald-50/50"}`}><div className="mb-3 flex items-center gap-2"><ShieldAlert className={`h-5 w-5 ${variance < 0 ? "text-red-500" : "text-emerald-500"}`} /><h2 className="font-bold text-[#17385d]">Cash {variance < 0 ? "Shortage" : variance > 0 ? "Excess" : "Status"}</h2></div><div className="rounded-lg bg-white/80 p-4 text-xl font-bold text-red-500">{formatCurrencyAmount(Math.abs(variance), currencyConfig)}</div><div className="mt-4 space-y-2 text-xs"><div className="flex justify-between"><span>Expected Cash</span><strong>{formatCurrencyAmount(summary.expected, currencyConfig)}</strong></div><div className="flex justify-between"><span>Closings Today</span><strong>{todayClosings.length}</strong></div></div><p className="mt-4 rounded-lg bg-white/70 p-3 text-xs text-ledger-600">A variance requires a reason before completing the day.</p></section>
          <aside className="space-y-4"><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3 flex items-center justify-between"><h2 className="font-bold text-[#17385d] dark:text-white">Today&apos;s Closing Status</h2><Clock3 className="h-4 w-4 text-ledger-400" /></div><div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-[7px] border-[#dceaf7] text-center text-xs font-bold text-[#31577c]">{todayClosings.length} closing(s)</div><p className="mt-3 text-center text-xs font-semibold text-ledger-600">{todayClosings.length ? "Closing records saved" : "No closings yet"}</p><a href="#cash-closing-report" className="mt-3 block rounded-md bg-[#1478dd] py-2 text-center text-xs font-semibold text-white">Close Day</a></section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Recent Closings</h2>{analyticsClosings.slice(0, 5).map((r) => <div key={r.id} className="flex items-center justify-between border-t border-ledger-100 py-2 text-[10px]"><span>{r.closing_date} · {(r.shift ?? "full_day").replace("_", " ")}</span><span className={`rounded-full px-2 py-1 ${r.classification === "shortage" ? "bg-red-100 text-red-600" : r.classification === "excess" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-600"}`}>{r.classification}</span></div>)}</section><section className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><h2 className="mb-3 font-bold text-[#17385d] dark:text-white">Quick Actions</h2><div className="grid grid-cols-2 gap-2"><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><FileText className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />View Reports</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Download className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Export Report</a><a href="#cash-closing-report" className="rounded-lg border p-3 text-center text-[10px]"><Printer className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Print Report</a><Link href="/banking/cash-closing?tab=settings" className="rounded-lg border p-3 text-center text-[10px]"><Settings2 className="mx-auto mb-1 h-4 w-4 text-[#1675d1]" />Settings</Link></div></section></aside>
        </div>
        {!reportResult.error && !reportLinesError && <CashClosingReport closings={reportClosings} currency={currencyConfig} organizationName={companyProfile?.company_name ?? ctx.orgName} logoUrl={companyProfile?.logo_url ?? null} filterDescription={reportFilterDescription} canExport={canExportClosings} canPrint={canPrintClosings} />}
        </>}
        {tab === "analytics" && <div>
        <CashClosingAnalytics
          closings={analyticsClosings}
          locations={(locations ?? []).map((location: { id: string; name: string }) => ({ id: location.id, name: location.name }))}
          users={userOptions}
          currency={currencyConfig}
          organizationName={ctx.orgName}
        />
        </div>}
      </div>
    </div>
  );
}
