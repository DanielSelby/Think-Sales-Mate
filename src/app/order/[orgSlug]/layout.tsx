import { CartProvider } from "@/components/customer-portal/cart-context";
import { getPortalContext } from "@/app/order/[orgSlug]/actions";

export default async function OrderLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ orgSlug: string }>;
}) {
  const { orgSlug } = await params;
  const context = await getPortalContext(orgSlug);
  const isDark = context?.portalTheme === "dark";
  const colorTheme = context?.portalColorTheme ?? "fintech";
  return (
    <div className={`portal-theme-${colorTheme} ${isDark ? "dark" : ""} min-h-screen bg-parchment-50 dark:bg-ink-950`}>
      <style dangerouslySetInnerHTML={{ __html: `
        .portal-theme-green .bg-signal{background-color:#004b23!important}.portal-theme-green .text-signal{color:#004b23!important}.portal-theme-green .border-signal{border-color:#004b23!important}
        .portal-theme-navy .bg-signal{background-color:#1B2A6B!important}.portal-theme-navy .text-signal{color:#1B2A6B!important}.portal-theme-navy .border-signal{border-color:#1B2A6B!important}
        .portal-theme-teal .bg-signal{background-color:#006d77!important}.portal-theme-teal .text-signal{color:#006d77!important}.portal-theme-teal .border-signal{border-color:#006d77!important}
        .portal-theme-plum .bg-signal{background-color:#412234!important}.portal-theme-plum .text-signal{color:#412234!important}.portal-theme-plum .border-signal{border-color:#412234!important}
        .portal-theme-fintech .bg-signal{background-color:#153361!important}.portal-theme-fintech .text-signal{color:#153361!important}.portal-theme-fintech .border-signal{border-color:#153361!important}
        .portal-theme-royal .bg-signal{background-color:#003fbd!important}.portal-theme-royal .text-signal{color:#003fbd!important}.portal-theme-royal .border-signal{border-color:#003fbd!important}
        .portal-theme-harvest .bg-signal{background-color:#283618!important}.portal-theme-harvest .text-signal{color:#283618!important}.portal-theme-harvest .border-signal{border-color:#283618!important}
        .portal-theme-eclipse .bg-signal{background-color:#1b4332!important}.portal-theme-eclipse .text-signal{color:#1b4332!important}.portal-theme-eclipse .border-signal{border-color:#1b4332!important}
      ` }} />
      <CartProvider orgSlug={orgSlug}>{children}</CartProvider>
    </div>
  );
}