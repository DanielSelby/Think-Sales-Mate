import { getCurrentOrgContext } from "@/lib/organizations/current";
import { redirect } from "next/navigation";
import { createOrganization } from "./actions";
import { OrganizationRegistrationForm } from "./organization-registration-form";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const params = await searchParams;
  const existing = await getCurrentOrgContext();
  if (existing) redirect("/dashboard");
  const { applications } = await getUserRegistrationApplications();
  if (applications.length) redirect("/registration-status");

  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-ledger-900 dark:text-white">Name your workspace</p>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
            This is the business that sales, inventory, and everything else in SalesMate will belong to.
          </p>
        </div>

        <OrganizationRegistrationForm action={createOrganization} error={params.error} />
      </div>
    </div>
  );
}
