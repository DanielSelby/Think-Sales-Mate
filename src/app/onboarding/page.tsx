import { getCurrentOrgContext } from "@/lib/organizations/current";
import { redirect } from "next/navigation";
import { createOrganization } from "./actions";
import { OrganizationRegistrationForm } from "./organization-registration-form";
import { getUserRegistrationApplications } from "@/lib/organizations/registration";
import { getPublishedPlatformProducts } from "@/lib/supabase/platform-admin";

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
  const products = await getPublishedPlatformProducts();

  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-lg">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-ledger-900 dark:text-white">Set up your workspace</p>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
            Choose the products your business needs. Platform Admin will review your request before access is activated.
          </p>
        </div>

        <OrganizationRegistrationForm action={createOrganization} error={params.error} products={products} />
      </div>
    </div>
  );
}
