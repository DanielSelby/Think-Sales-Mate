"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { OrgSwitcher } from "@/components/nav/org-switcher";
import { createClient } from "@/lib/supabase/client";

export interface ProductHubItem {
  slug: string;
  name: string;
  description: string;
  status: "Active" | "Read-only" | "Provisioning" | "Unavailable";
  launchPath: string | null;
  canOpen: boolean;
}

interface OrganizationOption {
  orgId: string;
  orgName: string;
  role: string;
}

interface ProductHubClientProps {
  orgId: string;
  orgName: string;
  organizations: OrganizationOption[];
  userName: string | null;
  userEmail: string;
  avatarUrl: string | null;
  unreadCount: number;
  isOrgAdmin: boolean;
  products: ProductHubItem[];
}

const PRODUCT_ICONS: Record<string, { icon: LucideIcon; color: string }> = {
  "thinksales-erp": { icon: BarChart3, color: "bg-blue-100 text-blue-700" },
  restaurant: { icon: Store, color: "bg-purple-100 text-purple-700" },
  "think-service-repairs": { icon: Wrench, color: "bg-emerald-100 text-emerald-700" },
};

const sidebarLinks = [
  { label: "Home", href: "/product-hub", icon: LayoutGrid },
  { label: "Organization", href: "/settings/organization", icon: Building2, adminOnly: true },
  { label: "Users", href: "/settings/organization#users", icon: Users, adminOnly: true },
  { label: "Subscription", href: "/subscription-status", icon: CreditCard },
  { label: "Settings", href: "/settings", icon: Settings, adminOnly: true },
  { label: "Support", href: "/support", icon: LifeBuoy },
];

export function ProductHubClient({
  orgId,
  orgName,
  organizations,
  userName,
  userEmail,
  avatarUrl,
  unreadCount,
  isOrgAdmin,
  products,
}: ProductHubClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const canSearch = products.length > 4;
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(query))
      : products;
  }, [products, search]);
  const accessibleCount = products.filter((product) => product.canOpen).length;
  const deniedProductMessage = searchParams.get("accessDenied") === "product";

  async function signOut() {
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (error) {
      console.error("Could not sign out:", error);
      setSignOutError("Could not sign out. Please try again.");
    }
  }

  function renderSidebar(mobile = false) {
    return (
      <div className="flex h-full flex-col bg-[#101c35] px-4 py-5 text-white">
        <Link href="/product-hub" className="flex items-center gap-3 px-2">
          <Image src="/thinksales-logo.svg" alt="" width={38} height={38} priority />
          <span className="min-w-0">
            <span className="block truncate text-[11px] font-bold tracking-[0.13em]">THINK DIGITAL</span>
            <span className="block text-[10px] tracking-[0.14em] text-blue-200">SOLUTIONS</span>
          </span>
        </Link>

        <nav className="mt-10 space-y-1.5" aria-label="Main navigation">
          {sidebarLinks.filter((item) => !item.adminOnly || isOrgAdmin).map(({ label, href, icon: Icon }) => {
            const active = label === "Home";
            return (
              <Link
                key={label}
                href={href}
                onClick={() => mobile && setMobileMenuOpen(false)}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                  active ? "bg-blue-600 text-white shadow-sm" : "text-blue-100 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon className="h-[18px] w-[18px] shrink-0" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto">
          {signOutError && <p className="mb-2 px-2 text-xs text-rose-300">{signOutError}</p>}
          <button
            type="button"
            onClick={() => void signOut()}
            className="flex h-11 w-full items-center gap-3 rounded-lg px-3 text-sm font-medium text-blue-100 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-[18px] w-[18px]" />
            Log Out
          </button>
          <p className="mt-5 px-2 text-[10px] text-blue-300/75">Think Digital Solutions</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#18243b]">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[252px] md:block">{renderSidebar()}</aside>

      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-950/50"
            aria-label="Close navigation"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="absolute inset-y-0 left-0 w-[270px] shadow-2xl">{renderSidebar(true)}</aside>
        </div>
      )}

      <div className="min-h-screen md:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-7">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 md:hidden"
              aria-label="Open navigation"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700 sm:flex">
              <Building2 className="h-[18px] w-[18px]" />
            </div>
            <div className="min-w-0">
              <p className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-400 sm:block">Organization</p>
              <OrgSwitcher
                activeOrgId={orgId}
                options={organizations.map((organization) => ({
                  orgId: organization.orgId,
                  orgName: organization.orgName,
                  role: organization.role,
                }))}
              />
            </div>
            <ChevronDown className="ml-[-8px] hidden h-4 w-4 text-slate-400 sm:block" aria-hidden="true" />
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <Link
              href="/communication"
              aria-label={unreadCount ? `${unreadCount} unread notifications` : "Notifications"}
              className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute right-0.5 top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[9px] font-bold leading-4 text-white">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              )}
            </Link>
            <div className="relative">
              <button
                type="button"
                onClick={() => setProfileOpen((open) => !open)}
                className="flex items-center gap-2 rounded-full p-1 hover:bg-slate-50"
                aria-expanded={profileOpen}
                aria-label="Open profile menu"
              >
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="" width={34} height={34} className="h-[34px] w-[34px] rounded-full object-cover" />
                ) : (
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
                    {(userName || userEmail).slice(0, 1).toUpperCase()}
                  </span>
                )}
                <span className="hidden max-w-[150px] text-left sm:block">
                  <span className="block truncate text-xs font-semibold text-slate-800">{userName || userEmail}</span>
                  <span className="block truncate text-[10px] text-slate-500">{orgName}</span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
              {profileOpen && (
                <div className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  <div className="border-b border-slate-100 px-3 py-2">
                    <p className="truncate text-sm font-semibold text-slate-800">{userName || "Account"}</p>
                    <p className="truncate text-xs text-slate-500">{userEmail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void signOut()}
                    className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-[1450px] space-y-8 px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
          <section className="relative isolate flex min-h-[220px] overflow-hidden rounded-2xl bg-gradient-to-r from-[#e7f2ff] via-[#eaf4ff] to-[#d7eaff] px-6 py-7 sm:min-h-[250px] sm:px-10 sm:py-9">
            <div className="pointer-events-none absolute -right-8 -top-20 -z-10 h-64 w-64 rounded-full border-[34px] border-white/35" />
            <div className="pointer-events-none absolute right-[22%] top-12 -z-10 h-28 w-28 rounded-full bg-white/25" />
            <div className="flex max-w-[620px] flex-col justify-center">
              <p className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Think Digital Solutions</p>
              <h1 className="max-w-[570px] text-2xl font-bold leading-tight tracking-tight text-[#122443] sm:text-3xl lg:text-[36px]">
                Welcome to Think Digital Solutions
              </h1>
              <p className="mt-3 text-sm text-slate-600 sm:text-base">Select a product below to open your application</p>
            </div>
            <div aria-hidden="true" className="absolute bottom-6 right-8 hidden h-[156px] w-[225px] items-end justify-center sm:flex lg:right-[9%]">
              <div className="relative z-10 h-[140px] w-[204px] rounded-t-xl border-[7px] border-slate-700 bg-white p-3 shadow-xl">
                <div className="flex items-center gap-1 border-b border-slate-100 pb-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-red-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-300" />
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                  <span className="ml-2 h-1.5 w-16 rounded-full bg-slate-100" />
                </div>
                <div className="mt-3 flex gap-2">
                  <div className="w-8 rounded bg-blue-50" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3 w-16 rounded bg-blue-100" />
                    <div className="flex h-16 items-end gap-1 rounded bg-slate-50 px-2 pb-2">
                      <span className="h-5 w-4 rounded-t bg-blue-200" />
                      <span className="h-8 w-4 rounded-t bg-blue-400" />
                      <span className="h-6 w-4 rounded-t bg-blue-300" />
                      <span className="h-11 w-4 rounded-t bg-blue-600" />
                      <span className="h-8 w-4 rounded-t bg-sky-300" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="absolute bottom-0 h-3 w-[225px] rounded-b-md bg-slate-500 shadow-lg" />
            </div>
          </section>

          <section className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold tracking-tight text-[#14233e] sm:text-2xl">Your Products</h2>
                <p className="mt-1 text-sm text-slate-500">Applications available to your account</p>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                <span className="font-medium">You have access to {accessibleCount} {accessibleCount === 1 ? "product" : "products"}</span>
              </div>
            </div>

            {deniedProductMessage && (
              <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your account does not currently have access to that product. Contact your organization administrator.
              </div>
            )}

            {canSearch && (
              <label className="flex h-10 max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products"
                  className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </label>
            )}

            {filteredProducts.length ? (
              <div className="grid gap-4 lg:grid-cols-2">
                {filteredProducts.map((product) => {
                  const presentation = PRODUCT_ICONS[product.slug] ?? { icon: LayoutGrid, color: "bg-slate-100 text-slate-700" };
                  const ProductIcon = presentation.icon;
                  return (
                    <article key={product.slug} className="flex min-h-[162px] flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-[0_3px_15px_rgba(15,35,65,0.045)] sm:flex-row sm:items-center sm:p-5">
                      <div className={`flex h-[68px] w-[68px] shrink-0 items-center justify-center rounded-xl ${presentation.color}`}>
                        <ProductIcon className="h-8 w-8" strokeWidth={1.8} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h3 className="text-base font-bold text-[#152440]">{product.name}</h3>
                        <p className="mt-1.5 line-clamp-2 min-h-10 text-sm leading-5 text-slate-500">
                          {product.description || "Open your organization's application."}
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-medium">
                          <span className={`h-2 w-2 rounded-full ${product.status === "Active" ? "bg-emerald-500" : product.status === "Read-only" ? "bg-amber-500" : "bg-slate-400"}`} />
                          <span className={product.status === "Active" ? "text-emerald-700" : "text-slate-600"}>{product.status}</span>
                        </div>
                      </div>
                      <div className="flex items-center border-t border-slate-100 pt-4 sm:ml-2 sm:min-h-[98px] sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
                        {product.canOpen && product.launchPath ? (
                          <Link
                            href={product.launchPath}
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-blue-700 sm:w-auto"
                          >
                            Open Product
                            <ArrowRight className="h-4 w-4" />
                          </Link>
                        ) : (
                          <span className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-slate-100 px-4 text-sm font-medium text-slate-500 sm:w-auto">
                            Not available
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
                <LayoutGrid className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-800">No products available yet</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Your organization&apos;s active products will appear here when they are ready and assigned to your account.
                </p>
              </div>
            )}
          </section>

          {isOrgAdmin && (
            <section className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-[#172744]">Manage product access</h2>
                  <p className="mt-1 text-sm text-slate-600">Assign organization products to individual team members.</p>
                </div>
              </div>
              <Link href="/settings/organization#users" className="inline-flex h-10 items-center justify-center rounded-lg border border-blue-200 bg-white px-4 text-sm font-semibold text-blue-700 hover:bg-blue-50">
                Manage users
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </section>
          )}

          <section className="flex flex-col items-start justify-between gap-4 rounded-xl border border-blue-100 bg-[#eaf4ff] p-5 sm:flex-row sm:items-center sm:px-6 sm:py-5">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-blue-700">
                <LifeBuoy className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[#172744]">Need help?</h2>
                <p className="mt-1 text-sm text-slate-600">Visit our support center or contact your administrator.</p>
              </div>
            </div>
            <Link href="/support" className="inline-flex h-10 items-center justify-center rounded-lg bg-blue-600 px-5 text-sm font-semibold text-white hover:bg-blue-700">
              Get Support
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </section>
        </main>
      </div>

      {mobileMenuOpen && (
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="fixed right-4 top-4 z-[60] rounded-full bg-white p-2 text-slate-700 shadow md:hidden"
          aria-label="Close navigation menu"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
