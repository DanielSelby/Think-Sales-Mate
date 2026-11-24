import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const MAX_EXPORT_ROWS = 100_000;
const LOAN_FILTERS = ["all", "overdue", "due_soon", "not_due_soon"] as const;

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_library", "library", "circulation", "export")) {
    return NextResponse.json({ error: "You do not have permission to export library loans." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const requestedFilter = params.get("loan_status") ?? "all";
  const loanFilter = LOAN_FILTERS.includes(requestedFilter as (typeof LOAN_FILTERS)[number])
    ? requestedFilter
    : "all";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  if (!branchIds.length) return NextResponse.json({ error: "No accessible campuses were found." }, { status: 403 });

  const today = new Date().toISOString().slice(0, 10);
  const dueSoonThrough = new Date(`${today}T00:00:00.000Z`);
  dueSoonThrough.setUTCDate(dueSoonThrough.getUTCDate() + 7);
  const dueSoonThroughText = dueSoonThrough.toISOString().slice(0, 10);
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const supabase = await createClient();
  const csvRows: unknown[][] = [
    ["Student", "Campus", "Book", "Copy", "Loaned on", "Due on", "Renewals", "Status"],
  ];

  for (let offset = 0; offset <= MAX_EXPORT_ROWS; offset += BATCH_SIZE) {
    let query = supabase.from("education_library_loans")
      .select("id, branch_id, copy_id, student_id, loaned_on, due_on, renewal_count")
      .eq("org_id", context.orgId).in("branch_id", branchIds).is("returned_on", null)
      .order("due_on").order("id");
    if (loanFilter === "overdue") query = query.lt("due_on", today);
    if (loanFilter === "due_soon") query = query.gte("due_on", today).lte("due_on", dueSoonThroughText);
    if (loanFilter === "not_due_soon") query = query.gt("due_on", dueSoonThroughText);
    const { data: loans, error: loansError } = await query.range(offset, offset + BATCH_SIZE - 1);
    if (loansError) {
      console.error("Could not export Think Education library loans:", loansError.message);
      return NextResponse.json({ error: "Could not export library loans." }, { status: 500 });
    }
    if (offset === MAX_EXPORT_ROWS && (loans?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Library loan export exceeds the 100,000 record limit." }, { status: 413 });
    }
    if (!loans?.length) break;

    const copyIds = [...new Set(loans.map((loan) => loan.copy_id))];
    const studentIds = [...new Set(loans.map((loan) => loan.student_id))];
    const [{ data: copies, error: copiesError }, { data: students, error: studentsError }] = await Promise.all([
      supabase.from("education_library_copies")
        .select("id, branch_id, book_id, copy_number")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", copyIds),
      supabase.from("education_students")
        .select("id, student_number, first_name, last_name")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", studentIds),
    ]);
    if (copiesError) {
      console.error("Could not load library copy details for export:", copiesError.message);
      return NextResponse.json({ error: "Could not export library copy details." }, { status: 500 });
    }
    if (studentsError) {
      console.error("Could not load borrower details for export:", studentsError.message);
      return NextResponse.json({ error: "Could not export borrower details." }, { status: 500 });
    }
    const copyById = new Map((copies ?? []).map((copy) => [copy.id, copy]));
    const bookIds = [...new Set((copies ?? []).map((copy) => copy.book_id))];
    const { data: books, error: booksError } = bookIds.length
      ? await supabase.from("education_library_books").select("id, title")
        .eq("org_id", context.orgId).in("branch_id", branchIds).in("id", bookIds).eq("status", "active")
      : { data: [], error: null };
    if (booksError) {
      console.error("Could not load library book titles for export:", booksError.message);
      return NextResponse.json({ error: "Could not export library book titles." }, { status: 500 });
    }
    const studentById = new Map((students ?? []).map((student) => [student.id, student]));
    const bookById = new Map((books ?? []).map((book) => [book.id, book]));
    for (const loan of loans) {
      const copy = copyById.get(loan.copy_id);
      const student = studentById.get(loan.student_id);
      const status = loan.due_on < today ? "Overdue" : loan.due_on <= dueSoonThroughText ? "Due soon" : "Due later";
      csvRows.push([
        student ? `${student.first_name} ${student.last_name} (${student.student_number})` : "Unknown student",
        campusNameById.get(loan.branch_id) ?? loan.branch_id,
        copy ? bookById.get(copy.book_id)?.title ?? "Unknown book" : "Unknown book",
        copy?.copy_number ?? "",
        loan.loaned_on,
        loan.due_on,
        String(loan.renewal_count),
        status,
      ]);
    }
    if (loans.length < BATCH_SIZE) break;
  }

  const csv = csvRows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-library-loans-${today}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
