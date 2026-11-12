import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const PAGE_SIZE = 500;
const MAX_EXPORT_CHARGES = 50_000;
const MAX_EXPORT_PAYMENTS = 100_000;

type ExportCharge = {
  id: string;
  branch_id: string;
  student_id: string;
  academic_year_id: string;
  description: string;
  amount: number;
  due_on: string | null;
  status: string;
  created_at: string;
};

type ExportStudent = {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
};

type ExportPayment = {
  id: string;
  charge_id: string;
  amount: number;
  payment_method: string;
  reference: string | null;
  created_at: string;
};

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
    canTabPermission("education_finance", "finance", "charges", "view"),
    canTabPermission("education_finance", "finance", "charges", "export"),
    canTabPermission("education_finance", "finance", "payments", "view"),
    canTabPermission("education_students", "students", "list", "view"),
    canTabPermission("education_academics", "academics", "calendar", "view"),
  ]);
  if (permissions.some((allowed) => !allowed)) {
    return NextResponse.json({ error: "You do not have permission to export this finance report." }, { status: 403 });
  }

  const requestedBranch = request.nextUrl.searchParams.get("branch") ?? "";
  const requestedYear = request.nextUrl.searchParams.get("year") ?? "";
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
  let yearsQuery = supabase.from("education_academic_years")
    .select("id, name")
    .eq("org_id", context.orgId);
  if (requestedYear) yearsQuery = yearsQuery.eq("id", requestedYear);
  const { data: years, error: yearsError } = await yearsQuery;
  if (yearsError) {
    console.error("Could not verify the Think Education export year:", yearsError.message);
    return NextResponse.json({ error: "Could not verify the academic year filter." }, { status: 500 });
  }
  if (requestedYear && !years?.length) {
    return NextResponse.json({ error: "The selected academic year was not found." }, { status: 400 });
  }
  const yearNameById = new Map((years ?? []).map((year) => [year.id, year.name]));

  let countQuery = supabase.from("education_fee_charges")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .in("branch_id", branchIds);
  if (requestedYear) countQuery = countQuery.eq("academic_year_id", requestedYear);
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count Think Education charges for export:", countError.message);
    return NextResponse.json({ error: "Could not count fee charges for the export." }, { status: 500 });
  }
  const chargeCount = count ?? 0;
  if (chargeCount > MAX_EXPORT_CHARGES) {
    return NextResponse.json({
      error: `This export contains ${chargeCount} charges, above the ${MAX_EXPORT_CHARGES} row limit. Filter by campus or academic year and try again.`,
    }, { status: 413 });
  }

  const studentNameById = new Map<string, string>();
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const rows = [
    csvRow([
      "Charge ID", "Student Number", "Student Name", "Campus", "Academic Year",
      "Description", "Charge Amount (first payment row)", "Paid (first payment row)", "Balance (first payment row)", "Status", "Due Date",
      "Charge Created", "Payment Date", "Payment Amount", "Payment Method", "Payment Reference",
    ]),
  ];
  let exportedPaymentCount = 0;

  for (let offset = 0; offset < chargeCount; offset += PAGE_SIZE) {
    let chargesQuery = supabase.from("education_fee_charges")
      .select("id, branch_id, student_id, academic_year_id, description, amount, due_on, status, created_at")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, chargeCount - 1));
    if (requestedYear) chargesQuery = chargesQuery.eq("academic_year_id", requestedYear);
    const { data: charges, error: chargesError } = await chargesQuery;
    if (chargesError) {
      console.error("Could not load Think Education charges for export:", chargesError.message);
      return NextResponse.json({ error: "Could not load fee charges for the export." }, { status: 500 });
    }
    const batch = (charges ?? []) as ExportCharge[];
    if (!batch.length) break;

    const studentIds = Array.from(new Set(batch.map((charge) => charge.student_id)));
    const { data: students, error: studentsError } = await supabase.from("education_students")
      .select("id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", branchIds)
      .in("id", studentIds);
    if (studentsError) {
      console.error("Could not load Think Education students for export:", studentsError.message);
      return NextResponse.json({ error: "Could not load student details for the export." }, { status: 500 });
    }
    for (const student of (students ?? []) as ExportStudent[]) {
      studentNameById.set(student.id, `${student.first_name} ${student.last_name}`);
    }

    const chargeIds = batch.map((charge) => charge.id);
    const payments: ExportPayment[] = [];
    for (let paymentOffset = 0; ; paymentOffset += PAGE_SIZE) {
      const { data, error } = await supabase.from("education_fee_payments")
        .select("id, charge_id, amount, payment_method, reference, created_at")
        .eq("org_id", context.orgId)
        .in("charge_id", chargeIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(paymentOffset, paymentOffset + PAGE_SIZE - 1);
      if (error) {
        console.error("Could not load Think Education payments for export:", error.message);
        return NextResponse.json({ error: "Could not load fee payment details for the export." }, { status: 500 });
      }
      const paymentBatch = (data ?? []) as ExportPayment[];
      payments.push(...paymentBatch);
      exportedPaymentCount += paymentBatch.length;
      if (exportedPaymentCount > MAX_EXPORT_PAYMENTS) {
        return NextResponse.json({
          error: `This export contains more than ${MAX_EXPORT_PAYMENTS} payment records. Filter by campus or academic year and try again.`,
        }, { status: 413 });
      }
      if (paymentBatch.length < PAGE_SIZE) break;
    }

    const paymentsByCharge = new Map<string, ExportPayment[]>();
    for (const payment of payments) {
      paymentsByCharge.set(payment.charge_id, [...(paymentsByCharge.get(payment.charge_id) ?? []), payment]);
    }
    for (const charge of batch) {
      const chargePayments = paymentsByCharge.get(charge.id) ?? [];
      const paid = chargePayments.reduce((sum, payment) => sum + payment.amount, 0);
      const balance = charge.status === "open" ? Math.max(0, charge.amount - paid) : 0;
      const student = students?.find((item) => item.id === charge.student_id);
      const common = [
        charge.id,
        student?.student_number ?? "",
        studentNameById.get(charge.student_id) ?? "",
        campusNameById.get(charge.branch_id) ?? "",
        yearNameById.get(charge.academic_year_id) ?? "",
        charge.description,
      ];
      const chargeDetails = [charge.status, charge.due_on, charge.created_at];
      if (chargePayments.length) {
        chargePayments.forEach((payment, index) => {
          rows.push(csvRow([
            ...common,
            index === 0 ? charge.amount.toFixed(2) : null,
            index === 0 ? paid.toFixed(2) : null,
            index === 0 ? balance.toFixed(2) : null,
            ...chargeDetails,
            payment.created_at,
            payment.amount.toFixed(2),
            payment.payment_method,
            payment.reference,
          ]));
        });
      } else {
        rows.push(csvRow([
          ...common,
          charge.amount.toFixed(2),
          paid.toFixed(2),
          balance.toFixed(2),
          ...chargeDetails,
          null,
          null,
          null,
          null,
        ]));
      }
    }
  }

  const csv = `\uFEFF${rows.join("\r\n")}`;
  const filename = `think-education-fees-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
