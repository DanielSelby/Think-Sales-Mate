import { getPortalContext, getStorefrontLocations } from "@/app/order/[orgSlug]/actions";
import { CheckoutView } from "@/components/customer-portal/checkout-view";

export default async function CartPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const context = await getPortalContext(orgSlug);

  if (!context || !context.isEnabled) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <p className="text-center text-sm text-ledger-500">Ordering isn&apos;t available right now.</p>
      </div>
    );
  }

  const locations = context.allowCustomerLocationSelection ? await getStorefrontLocations(context.orgId) : [];

  return (
    <CheckoutView
      orgSlug={orgSlug}
      orgId={context.orgId}
      orgName={context.orgName}
      currency={context.currency}
      showPrices={context.showPrices}
      allowSelectDelivery={context.allowCustomerSelectDelivery}
      allowNotes={context.allowOrderNotes}
      allowLocationSelection={context.allowCustomerLocationSelection}
      locations={locations}
    />
  );
}