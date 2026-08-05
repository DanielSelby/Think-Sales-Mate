import { getCurrentOrgContext } from "@/lib/organizations/current";
import { redirect } from "next/navigation";
import { createOrganization } from "./actions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage({
  searchParams
}: {
  searchParams: { error?: string };
}) {
  const existing = await getCurrentOrgContext();
  if (existing) redirect("/dashboard");

  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-2xl font-semibold text-ledger-900 dark:text-white">Name your workspace</p>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">
            This is the business that sales, inventory, and everything else in SalesMate will belong to.
          </p>
        </div>

        <form action={createOrganization} className="space-y-4 rounded-card border border-ledger-100 bg-white p-6 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          {searchParams.error && (
            <p className="rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{searchParams.error}</p>
          )}

          <div className="space-y-1.5">
            <label htmlFor="name" className="text-sm font-medium text-ledger-700 dark:text-ledger-200">
              Business name
            </label>
            <Input id="name" name="name" required placeholder="Boateng Traders Ltd." />
          </div>
          <Button type="submit" className="w-full">
            Create workspace
          </Button>
        </form>
      </div>
    </div>
  );
}
