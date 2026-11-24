import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_students", "students", "list", "view")) {
    return NextResponse.json({ error: "You do not have permission to search student records." }, { status: 403 });
  }

  const branchId = request.nextUrl.searchParams.get("branch") ?? "";
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s-]/g, "").trim();
  if (safeSearch.length < 2) return NextResponse.json({ students: [] });

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }

  const terms = safeSearch.split(/\s+/).filter(Boolean).slice(0, 4);
  const filters = terms.flatMap((term) => [
    `student_number.ilike.%${term}%`,
    `first_name.ilike.%${term}%`,
    `last_name.ilike.%${term}%`,
    `other_names.ilike.%${term}%`,
  ]);
  const { data, error } = await (await createClient()).from("education_students")
    .select("id, student_number, first_name, last_name")
    .eq("org_id", context.orgId)
    .eq("branch_id", branchId)
    .eq("status", "active")
    .or(filters.join(","))
    .order("last_name")
    .order("first_name")
    .order("id")
    .limit(25);
  if (error) {
    console.error("Could not search Think Education students for fee management:", error.message);
    return NextResponse.json({ error: "Could not search for students." }, { status: 500 });
  }

  return NextResponse.json({ students: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
