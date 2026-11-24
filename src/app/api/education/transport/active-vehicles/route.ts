import { NextResponse, type NextRequest } from "next/server";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const context = await getCurrentOrgContext();
  if (!context) return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  if (!await canTabPermission("education_transport", "transport", "fleet", "create")) {
    return NextResponse.json({ error: "You do not have permission to create transport routes." }, { status: 403 });
  }

  const branchId = request.nextUrl.searchParams.get("branch") ?? "";
  const search = (request.nextUrl.searchParams.get("search") ?? "").trim().slice(0, 80);
  const safeSearch = search.replace(/[^A-Za-z0-9\s_-]/g, "");
  if (safeSearch.length < 2) {
    return NextResponse.json({ vehicles: [] }, { headers: { "Cache-Control": "private, no-store" } });
  }

  const { campuses } = await getAccessibleEducationCampuses(context.orgId, context.userId);
  if (!campuses.some((campus) => campus.id === branchId)) {
    return NextResponse.json({ error: "The selected campus is outside your access scope." }, { status: 403 });
  }
  const pattern = `%${safeSearch}%`;
  const { data, error } = await (await createClient()).from("education_transport_vehicles")
    .select("id, registration_number, make_model, capacity")
    .eq("org_id", context.orgId).eq("branch_id", branchId).eq("status", "active")
    .or(`registration_number.ilike.${pattern},make_model.ilike.${pattern}`)
    .order("registration_number").order("id").limit(25);
  if (error) {
    console.error("Could not search active Think Education transport vehicles:", error.message);
    return NextResponse.json({ error: "Could not search active vehicles." }, { status: 500 });
  }
  return NextResponse.json({ vehicles: data ?? [] }, { headers: { "Cache-Control": "private, no-store" } });
}
