import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const CHARGE_LIMIT = 20_000;
const PAYMENT_LIMIT = 100_000;
const PAGE_SIZE = 500;
const BATCH_SIZE = 200;
type AgingBucket = "not_due" | "days_1_30" | "days_31_60" | "days_61_90" | "over_90";

type AgingAccount = {
  branch_id: string;
  student_id: string;
  charges: number;
  balance_cents: number;
  not_due_cents: number;
  days_1_30_cents: number;
  days_31_60_cents: number;
  days_61_90_cents: number;
  over_90_cents: number;
};

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

function cents(value: number) {
  return Math.round(value * 100);
}

function ageBucket(dueOn: string | null, today: number): AgingBucket {
  if (!dueOn) return "not_due";
  const [year, month, day] = dueOn.split("-").map(Number);
  const dueDate = Date.UTC(year, month - 1, day);
  const daysPastDue = Math.floor((today - dueDate) / 86_400_000);
  if (daysPastDue > 90) return "over_90";
  if (daysPastDue > 60) return "days_61_90";
  if (daysPastDue > 30) return "days_31_60";
  if (daysPastDue > 0) return "days_1_30";
  return "not_due";
}

function dateParam(value: string | null) {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : "";
}

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) return new Response("Unauthorized.", { status: 401 });
  const permissions = await Promise.all([
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "charges", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_students", "students", "list", "export"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (permissions.some((allowed) => !allowed)) {
    return new Response("You do not have permission to export fee aging data.", { status: 403 });
  }

  const url = new URL(request.url);
  const requestedBranch = url.searchParams.get("branch") ?? "";
  const requestedYear = dateParam(url.searchParams.get("year"));
  if (url.searchParams.get("year") && !requestedYear) return new Response("Invalid academic year filter.", { status: 400 });

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return new Response("The selected campus is outside your access.", { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) return new Response("No campuses are available in your assigned scope.", { status: 404 });

  const supabase = await createClient();
  let academicYearName = "All academic years";
  if (requestedYear) {
    const { data: year, error } = await supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId)
      .eq("id", requestedYear)
      .maybeSingle();
    if (error) {
      console.error("Could not verify academic year for fee aging export:", error.message);
      return new Response("Could not load the selected academic year.", { status: 500 });
    }
    if (!year) return new Response("The selected academic year is unavailable.", { status: 404 });
    academicYearName = year.name;
  }

  let countQuery = supabase.from("education_fee_charges")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds)
    .eq("status", "open");
  if (requestedYear) countQuery = countQuery.eq("academic_year_id", requestedYear);
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count open charges for fee aging export:", countError.message);
    return new Response("Could not count charges for the aging export.", { status: 500 });
  }
  const chargeCount = count ?? 0;
  if (chargeCount > CHARGE_LIMIT) {
    return new Response(
      `This export includes more than ${CHARGE_LIMIT.toLocaleString()} open charges. Filter by campus or academic year and try again.`,
      { status: 413 },
    );
  }

  const charges: Array<{ id: string; branch_id: string; student_id: string; amount: number; due_on: string | null }> = [];
  for (let offset = 0; offset < chargeCount; offset += PAGE_SIZE) {
    let query = supabase.from("education_fee_charges")
      .select("id, branch_id, student_id, amount, due_on")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, chargeCount - 1));
    if (requestedYear) query = query.eq("academic_year_id", requestedYear);
    const { data, error } = await query;
    if (error) {
      console.error("Could not load charges for fee aging export:", error.message);
      return new Response("Could not load charges for the aging export.", { status: 500 });
    }
    charges.push(...(data ?? []));
  }

  const paidByCharge = new Map<string, number>();
  const chargeIds = charges.map((charge) => charge.id);
  const paymentBatches: Array<{ chargeIds: string[]; count: number }> = [];
  let totalPaymentCount = 0;
  for (let offset = 0; offset < chargeIds.length; offset += BATCH_SIZE) {
    const chargeBatch = chargeIds.slice(offset, offset + BATCH_SIZE);
    const { count: batchPaymentCount, error: batchCountError } = await supabase.from("education_fee_payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .in("charge_id", chargeBatch);
    if (batchCountError) {
      console.error("Could not count payments for fee aging export:", batchCountError.message);
      return new Response("Could not count payments for the aging export.", { status: 500 });
    }
    const countForBatch = batchPaymentCount ?? 0;
    totalPaymentCount += countForBatch;
    if (totalPaymentCount > PAYMENT_LIMIT) {
      return new Response(
        `This export requires scanning more than ${PAYMENT_LIMIT.toLocaleString()} payments. Filter by campus or academic year and try again.`,
        { status: 413 },
      );
    }
    paymentBatches.push({ chargeIds: chargeBatch, count: countForBatch });
  }
  for (const { chargeIds: chargeBatch, count: batchPaymentCount } of paymentBatches) {
    for (let paymentOffset = 0; paymentOffset < batchPaymentCount; paymentOffset += PAGE_SIZE) {
      const { data, error } = await supabase.from("education_fee_payments")
        .select("charge_id, amount")
        .eq("org_id", context.orgId)
        .in("charge_id", chargeBatch)
        .order("charge_id")
        .order("id")
        .range(paymentOffset, Math.min(paymentOffset + PAGE_SIZE - 1, batchPaymentCount - 1));
      if (error) {
        console.error("Could not load payments for fee aging export:", error.message);
        return new Response("Could not load payments for the aging export.", { status: 500 });
      }
      for (const payment of data ?? []) {
        paidByCharge.set(payment.charge_id, (paidByCharge.get(payment.charge_id) ?? 0) + cents(Number(payment.amount)));
      }
    }
  }

  const localToday = new Date();
  const today = Date.UTC(localToday.getFullYear(), localToday.getMonth(), localToday.getDate());
  const accountByStudent = new Map<string, AgingAccount>();
  for (const charge of charges) {
    const balanceCents = Math.max(0, cents(Number(charge.amount)) - (paidByCharge.get(charge.id) ?? 0));
    if (balanceCents <= 0) continue;
    const account = accountByStudent.get(charge.student_id) ?? {
      branch_id: charge.branch_id,
      student_id: charge.student_id,
      charges: 0,
      balance_cents: 0,
      not_due_cents: 0,
      days_1_30_cents: 0,
      days_31_60_cents: 0,
      days_61_90_cents: 0,
      over_90_cents: 0,
    };
    const bucket = ageBucket(charge.due_on, today);
    account.charges += 1;
    account.balance_cents += balanceCents;
    account[`${bucket}_cents` as "not_due_cents" | "days_1_30_cents" | "days_31_60_cents" | "days_61_90_cents" | "over_90_cents"] += balanceCents;
    accountByStudent.set(charge.student_id, account);
  }

  const accounts = Array.from(accountByStudent.values())
    .sort((left, right) => right.balance_cents - left.balance_cents || left.student_id.localeCompare(right.student_id));
  const students: Array<{ id: string; student_number: string; first_name: string; last_name: string }> = [];
  const studentIds = accounts.map((account) => account.student_id);
  for (let offset = 0; offset < studentIds.length; offset += BATCH_SIZE) {
    const { data, error } = await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", studentIds.slice(offset, offset + BATCH_SIZE));
    if (error) {
      console.error("Could not load students for fee aging export:", error.message);
      return new Response("Could not load student details for the aging export.", { status: 500 });
    }
    students.push(...(data ?? []));
  }
  const studentById = new Map(students.map((student) => [student.id, student]));
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const { data: organization, error: organizationError } = await supabase.from("organizations")
    .select("currency")
    .eq("id", context.orgId)
    .single();
  if (organizationError) {
    console.error("Could not load currency for fee aging export:", organizationError.message);
    return new Response("Could not load currency for the aging export.", { status: 500 });
  }

  const headers = [
    "Student number", "Student name", "Campus", "Academic year", "Outstanding charges",
    `Total outstanding (${organization.currency})`, `Not due (${organization.currency})`,
    `1-30 days overdue (${organization.currency})`, `31-60 days overdue (${organization.currency})`,
    `61-90 days overdue (${organization.currency})`, `Over 90 days overdue (${organization.currency})`,
  ];
  const lines = [
    headers.map(escapeCsv).join(","),
    ...accounts.map((account) => {
      const student = studentById.get(account.student_id);
      return [
        student?.student_number ?? "",
        student ? `${student.first_name} ${student.last_name}` : "",
        campusNameById.get(account.branch_id) ?? "Campus",
        academicYearName,
        String(account.charges),
        (account.balance_cents / 100).toFixed(2),
        (account.not_due_cents / 100).toFixed(2),
        (account.days_1_30_cents / 100).toFixed(2),
        (account.days_31_60_cents / 100).toFixed(2),
        (account.days_61_90_cents / 100).toFixed(2),
        (account.over_90_cents / 100).toFixed(2),
      ].map(escapeCsv).join(",");
    }),
  ];

  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="think-education-fee-aging.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
