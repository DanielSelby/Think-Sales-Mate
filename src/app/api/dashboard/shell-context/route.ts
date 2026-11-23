import { NextResponse } from "next/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { getOrganizationUsageSummary } from "@/lib/organizations/usage-summary";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const context = await getCurrentOrgContext();
  if (!context) {
    return NextResponse.json({ error: "Session expired" }, { status: 401 });
  }

  const productSlug = new URL(request.url).searchParams.get("product");
  const supabase = await createClient();
  const [usage, educationCampuses, locationResult] = await Promise.all([
    getOrganizationUsageSummary(context.orgId).catch((error: unknown) => {
      console.error("Organization capacity details could not be loaded:", error);
      return null;
    }),
    productSlug === "think-education"
      ? getAccessibleEducationCampuses(context.orgId, context.userId)
      : Promise.resolve({ campuses: [] }),
    productSlug === "think-education"
      ? Promise.resolve({ data: [] })
      : supabase
        .from("business_locations")
        .select("id, name")
        .eq("org_id", context.orgId)
        .eq("is_active", true)
        .order("name"),
  ]);

  const locations = "data" in locationResult ? locationResult.data ?? [] : [];
  return NextResponse.json({
    usage,
    campuses: educationCampuses.campuses,
    locations,
  }, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
