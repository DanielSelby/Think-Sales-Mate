import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 500;
const MAX_EXPORT_PAYMENTS = 50_000;
const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer", "card", "cheque", "other"] as const;
type PaymentMethod = typeof PAYMENT_METHODS[number];

type PaymentRecord = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: PaymentMethod;
  reference: string | null;
  created_at: string;
};

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isValidDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function csvCell(value: string | number | null): string {
  let text = value === null ? "" : String(value);
  if (typeof value === "string" && /^[\s]*[=+\-@]/.test(value)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function csvRow(values: Array<string | number | null>): string {
  return values.map(csvCell).join(",");
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });

  const permissions = await Promise.all([
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_finance", "finance", "payments", "export"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (permissions.some((allowed) => !allowed)) {
    return NextResponse.json({ error: "You do not have permission to export payment collections." }, { status: 403 });
  }

  const search = request.nextUrl.searchParams;
  const from = search.get("from") ?? "";
  const to = search.get("to") ?? "";
  const requestedBranch = search.get("branch") ?? "";
  const requestedMethod = search.get("method") ?? "";
  if (!isValidDate(from) || !isValidDate(to) || from > to) {
    return NextResponse.json({ error: "A valid date range with the start on or before the end is required." }, { status: 400 });
  }
  const rangeLength = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
  if (rangeLength > 366) {
    return NextResponse.json({ error: "Choose a date range of 367 days or less." }, { status: 400 });
  }
  if (requestedMethod && !PAYMENT_METHODS.includes(requestedMethod as PaymentMethod)) {
    return NextResponse.json({ error: "The selected payment method is invalid." }, { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is not in your Think Education access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) {
    return NextResponse.json({ error: "No accessible Think Education campuses were found." }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: academicYears, error: yearsError } = await supabase.from("education_academic_years")
    .select("id, name")
    .eq("org_id", context.orgId);
  if (yearsError) {
    console.error("Could not load academic years for Think Education payment export:", yearsError.message);
    return NextResponse.json({ error: "Could not load academic years for export." }, { status: 500 });
  }
  const yearNameById = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  const endExclusive = `${shiftDate(to, 1)}T00:00:00.000Z`;
  let countQuery = supabase.from("education_fee_payments")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .gte("created_at", `${from}T00:00:00.000Z`)
    .lt("created_at", endExclusive);
  if (requestedMethod) countQuery = countQuery.eq("payment_method", requestedMethod as PaymentMethod);
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count Think Education payment export rows:", countError.message);
    return NextResponse.json({ error: "Could not count payment records for export." }, { status: 500 });
  }
  const paymentCount = count ?? 0;
  if (paymentCount > MAX_EXPORT_PAYMENTS) {
    return NextResponse.json({
      error: `This export contains ${paymentCount} payments, above the ${MAX_EXPORT_PAYMENTS} row limit. Narrow the date range, campus, or payment method.`,
    }, { status: 413 });
  }

  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const rows = [csvRow([
    "Payment ID", "Payment Date", "Student Number", "Student Name", "Campus",
    "Academic Year", "Charge Description", "Charge Status", "Payment Amount",
    "Payment Method", "Payment Reference",
  ])];

  for (let offset = 0; offset < paymentCount; offset += PAGE_SIZE) {
    let paymentsQuery = supabase.from("education_fee_payments")
      .select("id, charge_id, amount, payment_method, reference, created_at")
      .eq("org_id", context.orgId)
      .gte("created_at", `${from}T00:00:00.000Z`)
      .lt("created_at", endExclusive)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, paymentCount - 1));
    if (requestedMethod) paymentsQuery = paymentsQuery.eq("payment_method", requestedMethod as PaymentMethod);
    const { data, error } = await paymentsQuery;
    if (error) {
      console.error("Could not load Think Education payments for export:", error.message);
      return NextResponse.json({ error: "Could not load payment records for export." }, { status: 500 });
    }

    const paymentBatch = (data ?? []) as PaymentRecord[];
    const chargeIds = Array.from(new Set(paymentBatch.map((payment) => payment.charge_id)));
    const { data: charges, error: chargesError } = await supabase.from("education_fee_charges")
      .select("id, branch_id, student_id, academic_year_id, description, status")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", chargeIds);
    if (chargesError) {
      console.error("Could not load Think Education charges for payment export:", chargesError.message);
      return NextResponse.json({ error: "Could not load charge details for export." }, { status: 500 });
    }
    const chargeById = new Map((charges ?? []).map((charge) => [charge.id, charge]));
    const studentIds = Array.from(new Set((charges ?? []).map((charge) => charge.student_id)));
    const { data: students, error: studentsError } = studentIds.length
      ? await supabase.from("education_students")
        .select("id, student_number, first_name, last_name")
        .eq("org_id", context.orgId)
        .in("branch_id", branchIds)
        .in("id", studentIds)
      : { data: [], error: null };
    if (studentsError) {
      console.error("Could not load Think Education students for payment export:", studentsError.message);
      return NextResponse.json({ error: "Could not load student details for export." }, { status: 500 });
    }
    const studentById = new Map((students ?? []).map((student) => [student.id, student]));

    for (const payment of paymentBatch) {
      const charge = chargeById.get(payment.charge_id);
      if (!charge) continue;
      const student = studentById.get(charge.student_id);
      rows.push(csvRow([
        payment.id,
        payment.created_at,
        student?.student_number ?? "",
        student ? `${student.first_name} ${student.last_name}` : "",
        campusNameById.get(charge.branch_id) ?? "",
        yearNameById.get(charge.academic_year_id) ?? "",
        charge.description,
        charge.status,
        payment.amount.toFixed(2),
        payment.payment_method,
        payment.reference,
      ]));
    }
  }

  const csv = `\uFEFF${rows.join("\r\n")}`;
  const filename = `think-education-collections-${from}-to-${to}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
