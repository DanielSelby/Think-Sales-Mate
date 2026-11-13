import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const CHARGE_LIMIT = 5000;
const PAYMENT_LIMIT = 20_000;
const PAGE_SIZE = 500;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeCsv(value: string) {
  const safeValue = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replaceAll('"', '""')}"`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ studentId: string }> },
) {
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
    return new Response("You do not have permission to export this student statement.", { status: 403 });
  }

  const [{ studentId }, url] = await Promise.all([params, Promise.resolve(new URL(request.url))]);
  if (!UUID_PATTERN.test(studentId)) return new Response("Student not found.", { status: 404 });
  const requestedYear = url.searchParams.get("year") ?? "";
  if (requestedYear && !UUID_PATTERN.test(requestedYear)) {
    return new Response("Invalid academic year filter.", { status: 400 });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (!campusIds.length) return new Response("Student not found.", { status: 404 });

  const supabase = await createClient();
  const [
    { data: student, error: studentError },
    { data: academicYears, error: yearsError },
    { data: organization, error: organizationError },
  ] = await Promise.all([
    supabase.from("education_students")
      .select("id, branch_id, student_number, first_name, last_name")
      .eq("org_id", context.orgId)
      .in("branch_id", campusIds)
      .eq("id", studentId)
      .maybeSingle(),
    supabase.from("education_academic_years")
      .select("id, name")
      .eq("org_id", context.orgId),
    supabase.from("organizations")
      .select("currency")
      .eq("id", context.orgId)
      .single(),
  ]);
  if (studentError) {
    console.error("Could not load student for fee statement export:", studentError.message);
    return new Response("Could not load the student statement.", { status: 500 });
  }
  if (yearsError) {
    console.error("Could not load academic years for fee statement export:", yearsError.message);
    return new Response("Could not load academic years for the statement.", { status: 500 });
  }
  if (organizationError) {
    console.error("Could not load currency for fee statement export:", organizationError.message);
    return new Response("Could not load organization currency.", { status: 500 });
  }
  if (!student) return new Response("Student not found.", { status: 404 });

  const yearNameById = new Map((academicYears ?? []).map((year) => [year.id, year.name]));
  if (requestedYear && !yearNameById.has(requestedYear)) {
    return new Response("The selected academic year is unavailable.", { status: 404 });
  }
  let countQuery = supabase.from("education_fee_charges")
    .select("id", { count: "exact", head: true })
    .eq("org_id", context.orgId)
    .eq("branch_id", student.branch_id)
    .eq("student_id", student.id);
  if (requestedYear) countQuery = countQuery.eq("academic_year_id", requestedYear);
  const { count, error: countError } = await countQuery;
  if (countError) {
    console.error("Could not count charges for fee statement export:", countError.message);
    return new Response("Could not count charges for the statement.", { status: 500 });
  }
  const chargeCount = count ?? 0;
  if (chargeCount > CHARGE_LIMIT) {
    return new Response(
      `This statement contains more than ${CHARGE_LIMIT.toLocaleString()} charges. Filter by academic year and try again.`,
      { status: 413 },
    );
  }

  const charges: Array<{
    id: string;
    academic_year_id: string;
    description: string;
    amount: number;
    due_on: string | null;
    status: "open" | "void";
    created_at: string;
  }> = [];
  for (let offset = 0; offset < chargeCount; offset += PAGE_SIZE) {
    let query = supabase.from("education_fee_charges")
      .select("id, academic_year_id, description, amount, due_on, status, created_at")
      .eq("org_id", context.orgId)
      .eq("branch_id", student.branch_id)
      .eq("student_id", student.id)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, Math.min(offset + PAGE_SIZE - 1, chargeCount - 1));
    if (requestedYear) query = query.eq("academic_year_id", requestedYear);
    const { data, error } = await query;
    if (error) {
      console.error("Could not load charges for fee statement export:", error.message);
      return new Response("Could not load charges for the statement.", { status: 500 });
    }
    charges.push(...(data ?? []));
  }

  const chargeIds = charges.map((charge) => charge.id);
  let paymentCount = 0;
  for (let offset = 0; offset < chargeIds.length; offset += PAGE_SIZE) {
    const { count: batchCount, error } = await supabase.from("education_fee_payments")
      .select("id", { count: "exact", head: true })
      .eq("org_id", context.orgId)
      .in("charge_id", chargeIds.slice(offset, offset + PAGE_SIZE));
    if (error) {
      console.error("Could not count payments for fee statement export:", error.message);
      return new Response("Could not count payments for the statement.", { status: 500 });
    }
    paymentCount += batchCount ?? 0;
    if (paymentCount > PAYMENT_LIMIT) {
      return new Response(
        `This statement contains more than ${PAYMENT_LIMIT.toLocaleString()} payments. Filter by academic year and try again.`,
        { status: 413 },
      );
    }
  }

  const payments: Array<{
    id: string;
    charge_id: string;
    amount: number;
    payment_method: string;
    reference: string | null;
    created_at: string;
  }> = [];
  for (let offset = 0; offset < chargeIds.length; offset += PAGE_SIZE) {
    const chargeBatch = chargeIds.slice(offset, offset + PAGE_SIZE);
    for (let paymentOffset = 0; ; paymentOffset += PAGE_SIZE) {
      const { data, error } = await supabase.from("education_fee_payments")
        .select("id, charge_id, amount, payment_method, reference, created_at")
        .eq("org_id", context.orgId)
        .in("charge_id", chargeBatch)
        .order("created_at")
        .order("id")
        .range(paymentOffset, paymentOffset + PAGE_SIZE - 1);
      if (error) {
        console.error("Could not load payments for fee statement export:", error.message);
        return new Response("Could not load payments for the statement.", { status: 500 });
      }
      payments.push(...(data ?? []));
      if ((data ?? []).length < PAGE_SIZE) break;
    }
  }

  const paymentsByCharge = new Map<string, typeof payments>();
  for (const payment of payments) {
    paymentsByCharge.set(payment.charge_id, [...(paymentsByCharge.get(payment.charge_id) ?? []), payment]);
  }
  const csvRows = [[
    "Student number", "Student name", "Campus", "Transaction", "Date", "Academic year",
    "Description", "Due date", "Charge status", `Charge amount (${organization.currency})`,
    `Payment amount (${organization.currency})`, "Payment method", "Reference",
  ]];
  const campusName = campuses.find((campus) => campus.id === student.branch_id)?.name ?? "Campus";
  for (const charge of charges) {
    const common = [
      student.student_number,
      `${student.first_name} ${student.last_name}`,
      campusName,
      "",
      "",
      yearNameById.get(charge.academic_year_id) ?? "Academic year",
      charge.description,
      charge.due_on ?? "",
      charge.status,
      "",
      "",
      "",
      "",
    ];
    csvRows.push([
      ...common.slice(0, 3),
      "Charge",
      charge.created_at,
      ...common.slice(5, 9),
      Number(charge.amount).toFixed(2),
      "",
      "",
      "",
    ]);
    for (const payment of paymentsByCharge.get(charge.id) ?? []) {
      csvRows.push([
        ...common.slice(0, 3),
        "Payment",
        payment.created_at,
        ...common.slice(5, 9),
        "",
        Number(payment.amount).toFixed(2),
        payment.payment_method.replaceAll("_", " "),
        payment.reference ?? "",
      ]);
    }
  }
  const csv = `\uFEFF${csvRows.map((row) => row.map(escapeCsv).join(",")).join("\r\n")}`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="think-education-statement-${student.student_number.replace(/[^a-zA-Z0-9_-]/g, "_")}.csv"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
