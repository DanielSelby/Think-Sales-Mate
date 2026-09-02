import { getPortalContext, getCatalog } from "@/app/order/[orgSlug]/actions";
import { BrowseView } from "@/components/customer-portal/browse-view";
import { Clock3 } from "lucide-react";

export default async function BrowsePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await getPortalContext(orgSlug);

  if (!context) {
    return <EmptyState message="This ordering page doesn't exist." />;
  }
  if (!context.isEnabled) {
    return <UnavailableState orgName={context.orgName} />;
  }

  const products = await getCatalog(context.orgId);

  return (
    <BrowseView
      orgSlug={orgSlug}
      orgName={context.orgName}
      currency={context.currency}
      showPrices={context.showPrices}
      products={products}
    />
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-center text-sm text-ledger-500">{message}</p>
    </div>
  );
}

function UnavailableState({ orgName }: { orgName: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-ledger-50 px-4 dark:bg-ink-950">
      <div className="w-full max-w-md rounded-2xl border border-ledger-200 bg-white p-8 text-center shadow-sm dark:border-ledger-700 dark:bg-ink-900">
        <div className="mx-auto flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-signal/10 text-signal">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-signal/40">
            <Clock3 className="h-6 w-6" />
          </div>
        </div>
        <h1 className="mt-6 font-display text-xl font-bold text-ink-900 dark:text-white">Ordering is temporarily offline</h1>
        <p className="mt-2 text-sm leading-relaxed text-ledger-500 dark:text-ledger-400">
          {orgName} is not accepting online orders right now. We&apos;ll open soon -- please check back later.
        </p>
      </div>
    </div>
  );
}