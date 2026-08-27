import { CartProvider } from "@/components/customer-portal/cart-context";

export default async function OrderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  return (
    <div className="min-h-screen bg-parchment-50 dark:bg-ink-950">
      <CartProvider orgSlug={orgSlug}>{children}</CartProvider>
    </div>
  );
}