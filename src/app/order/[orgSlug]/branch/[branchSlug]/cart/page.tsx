import { getBranchStorefront, getPortalContext } from "@/app/order/[orgSlug]/actions";
import { CheckoutView } from "@/components/customer-portal/checkout-view";

export default async function BranchCartPage({
  params,
}: {
  params: Promise<{ orgSlug: string; branchSlug: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  const context = await getPortalContext(orgSlug);
  const branch = await getBranchStorefront(orgSlug, branchSlug);

  if (!context || !context.isEnabled || !context.branchStorefrontsEnabled || !branch) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-sm text-ledger-500">This branch storefront is unavailable.</p>
      </div>
    );
  }

  return (
    <CheckoutView
      orgSlug={orgSlug}
      storefrontPath={`/order/${orgSlug}/branch/${branchSlug}`}
      orgId={context.orgId}
      orgName={context.orgName}
      branchSlug={branchSlug}
      fixedBranchLocationId={branch.id}
      branchName={branch.name}
      customerPortalHeroUrl={context.customerPortalHeroUrl}
      whatsappBusinessNumber={context.whatsappBusinessNumber}
      customerPortalWhatsAppMessage={context.customerPortalWhatsAppMessage}
      currency={context.currency}
      showPrices={context.showPrices}
      allowSelectDelivery={context.allowCustomerSelectDelivery}
      standardDeliveryFee={context.standardDeliveryFee}
      expressDeliveryFee={context.expressDeliveryFee}
      pickupDeliveryFee={context.pickupDeliveryFee}
      allowNotes={context.allowOrderNotes}
      allowLocationSelection={false}
      locations={[]}
    />
  );
}
