import { getBranchStorefront, getCatalog, getPortalContext } from "@/app/order/[orgSlug]/actions";
import { BrowseView } from "@/components/customer-portal/browse-view";

export default async function BranchBrowsePage({
  params,
}: {
  params: Promise<{ orgSlug: string; branchSlug: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  const context = await getPortalContext(orgSlug);
  const branch = await getBranchStorefront(orgSlug, branchSlug);

  if (!context || !branch) return <BranchUnavailable />;
  if (!context.isEnabled) return <BranchUnavailable message="This store is not accepting online orders right now." />;

  const products = await getCatalog(context.orgId, branch.id);
  return (
    <BrowseView
      orgSlug={orgSlug}
      storefrontPath={`/order/${orgSlug}/branch/${branchSlug}`}
      branchName={branch.name}
      orgName={context.orgName}
      organizationPhone={context.organizationPhone}
      whatsappBusinessNumber={context.whatsappBusinessNumber}
      customerPortalWhatsAppMessage={context.customerPortalWhatsAppMessage}
      companyLogoUrl={context.companyLogoUrl}
      customerPortalHeroUrl={context.customerPortalHeroUrl}
      systemLogoUrl={context.systemLogoUrl}
      currency={context.currency}
      showPrices={context.showPrices}
      products={products}
    />
  );
}

function BranchUnavailable({ message = "This branch storefront is unavailable." }: { message?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-center text-sm text-ledger-500">{message}</p>
    </div>
  );
}
