import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { DashboardShell } from "@/components/nav/dashboard-shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const activeOrgId = (await cookies()).get("active_org_id")?.value;
  const context     = await getCurrentOrgContext(activeOrgId);
  if (!context) redirect("/onboarding");

  return (
    <DashboardShell orgName={context.orgName}>
      {children}
    </DashboardShell>
  );
}