import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

const BATCH_SIZE = 1000;
const STAFF_CATEGORIES = ["teaching", "non_teaching"] as const;

function csvCell(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_staff", "staff", "directory", "export")) {
    return NextResponse.json({ error: "You do not have permission to export staff records." }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const requestedBranch = params.get("branch") ?? "";
  const requestedCategory = params.get("category") ?? "";
  const search = (params.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  const category = STAFF_CATEGORIES.includes(requestedCategory as (typeof STAFF_CATEGORIES)[number])
    ? requestedCategory
    : "";
  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  const campusIds = campuses.map((campus) => campus.id);
  if (requestedBranch && !campusIds.includes(requestedBranch)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const branchIds = requestedBranch ? [requestedBranch] : campusIds;
  const campusNameById = new Map(campuses.map((campus) => [campus.id, campus.name]));
  const supabase = await createClient();
  const rows: string[][] = [
    ["Staff ID", "Name", "Campus", "Category", "Role", "Contact", "Status"],
  ];

  for (let offset = 0; branchIds.length && offset <= 100_000; offset += BATCH_SIZE) {
    let query = supabase.from("education_staff")
      .select("id, staff_number, first_name, last_name, branch_id, staff_category, job_title, email, status")
      .eq("org_id", context.orgId).in("branch_id", branchIds)
      .order("last_name").order("first_name").order("id");
    if (category) query = query.eq("staff_category", category);
    if (safeSearch) {
      const pattern = `%${safeSearch}%`;
      query = query.or(`staff_number.ilike.${pattern},first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern}`);
    }
    const { data, error } = await query.range(offset, offset + BATCH_SIZE - 1);
    if (error) {
      console.error("Could not export Think Education staff:", error.message);
      return NextResponse.json({ error: "Could not export staff records." }, { status: 500 });
    }
    if (offset === 100_000 && (data?.length ?? 0) > 0) {
      return NextResponse.json({ error: "Staff export exceeds the 100,000 record export limit." }, { status: 413 });
    }
    for (const member of data ?? []) {
      rows.push([
        member.staff_number,
        `${member.first_name} ${member.last_name}`.trim(),
        campusNameById.get(member.branch_id) ?? member.branch_id,
        member.staff_category.replace("_", " "),
        member.job_title || "—",
        member.email || "—",
        member.status.replace("_", " "),
      ]);
    }
    if ((data?.length ?? 0) < BATCH_SIZE) break;
  }

  const csv = rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(csv, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Disposition": `attachment; filename="education-staff-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Content-Type": "text/csv; charset=utf-8",
    },
  });
}
