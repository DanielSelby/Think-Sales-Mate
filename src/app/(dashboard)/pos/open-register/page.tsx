import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canPermission } from "@/lib/rbac/permissions";
import { OpenRegisterForm } from "@/components/pos/open-register-form";

export const metadata = { title: "Open Register · ThinkSales Pro" };

export default async function OpenRegisterPage({ searchParams }: { searchParams: Promise<{ closed?: string; auditWarning?: string }> }) {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");
  if (!await canPermission("pos", "view")) redirect("/dashboard");
  const params = await searchParams;

  const supabase = await createClient();
  const db = supabase as any;
  const { data: activeSession, error: sessionError } = await db
    .from("pos_register_sessions")
    .select("id")
    .eq("org_id", context.orgId)
    .eq("cashier_id", context.userId)
    .eq("status", "open")
    .maybeSingle();
  if (sessionError) throw new Error("Could not verify the register session.");
  if (activeSession) redirect("/pos");

  const { data: locations, error: locationsError } = await supabase
    .from("business_locations")
    .select("id, name")
    .eq("org_id", context.orgId)
    .eq("is_active", true)
    .order("name");
  if (locationsError) throw new Error("Could not load your available branches.");
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();

  const authorizedLocations = context.masterLocationId
    ? (locations ?? []).filter((location) => location.id === context.masterLocationId)
    : context.isBranchScoped
      ? (locations ?? []).filter((location) => context.allowedLocationIds.includes(location.id))
      : locations ?? [];

  return (
    <OpenRegisterForm
      locations={authorizedLocations}
      currency={context.currency}
      cashierName={profile?.full_name || context.userEmail}
      canOpen={await canPermission("pos", "create")}
      sessionClosed={params.closed === "1"}
      auditWarning={params.auditWarning === "1"}
    />
  );
}
