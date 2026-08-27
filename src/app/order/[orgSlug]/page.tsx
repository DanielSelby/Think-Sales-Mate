import { getPortalContext, getCatalog } from "@/app/order/[orgSlug]/actions";
import { BrowseView } from "@/components/customer-portal/browse-view";

export default async function BrowsePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await getPortalContext(orgSlug);

  if (!context) {
    return <EmptyState message="This ordering page doesn't exist." />;
  }
  if (!context.isEnabled) {
    return <EmptyState message={`${context.orgName} isn't accepting online orders right now.`} />;
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