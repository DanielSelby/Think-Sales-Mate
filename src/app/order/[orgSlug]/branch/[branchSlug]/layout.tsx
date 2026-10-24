import { CartProvider } from "@/components/customer-portal/cart-context";

export default async function BranchOrderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string; branchSlug: string }>;
}) {
  const { orgSlug, branchSlug } = await params;
  return <CartProvider orgSlug={`${orgSlug}:branch:${branchSlug}`}>{children}</CartProvider>;
}
