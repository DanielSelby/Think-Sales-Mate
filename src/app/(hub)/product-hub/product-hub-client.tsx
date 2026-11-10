"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart,
  BarChart3,
  Bell,
  BookOpen,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  Cloud,
  Code2,
  CreditCard,
  Database,
  Headphones,
  LayoutGrid,
  LifeBuoy,
  LogOut,
  Menu,
  Network,
  RefreshCw,
  Rocket,
  Search,
  Shield,
  Settings,
  ShieldCheck,
  Star,
  Store,
  TrendingUp,
  Users,
  Wrench,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { OrgSwitcher } from "@/components/nav/org-switcher";
import { createClient } from "@/lib/supabase/client";
import type { ProductHubBranding } from "@/lib/supabase/platform-admin";

export interface ProductHubItem {
  slug: string;
  name: string;
  description: string;
  imageUrl: string | null;
  status: "Active" | "Read-only" | "Provisioning" | "Unavailable";
  launchPath: string | null;
  canOpen: boolean;
}

function ProfileAvatar({
  avatarUrl,
  fallbackUrl,
  initials,
}: {
  avatarUrl: string | null;
  fallbackUrl: string | null;
  initials: string;
}) {
  const [imageUrl, setImageUrl] = useState(avatarUrl ?? fallbackUrl);

  if (!imageUrl) {
    return (
      <span className="flex h-[34px] w-[34px] items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-800">
        {initials}
      </span>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt=""
      width={34}
      height={34}
      unoptimized
      onError={() => setImageUrl(imageUrl !== fallbackUrl ? fallbackUrl : null)}
      className="h-[34px] w-[34px] rounded-full object-cover"
    />
  );
}

interface OrganizationOption {
  orgId: string;
  orgName: string;
  role: string;
}

interface ProductHubClientProps {
  orgId: string;
  orgName: string;
  orgLogoUrl: string | null;
  hubBranding: ProductHubBranding;
  organizations: OrganizationOption[];
  userName: string | null;
  userEmail: string;
  avatarUrl: string | null;
  avatarFallbackUrl: string | null;
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

const SERVICES = [
  { title: "Business Software", description: "Industry-specific management applications.", icon: Code2, color: "bg-blue-50 text-blue-700" },
  { title: "Custom Software Development", description: "Tailored software solutions for business requirements.", icon: Building2, color: "bg-violet-50 text-violet-700" },
  { title: "Cloud Solutions", description: "Secure and scalable cloud services.", icon: Cloud, color: "bg-cyan-50 text-cyan-700" },
  { title: "Data & Business Intelligence", description: "Turn business data into meaningful insights.", icon: BarChart, color: "bg-amber-50 text-amber-700" },
  { title: "Digital Transformation", description: "Modernize business operations through technology.", icon: RefreshCw, color: "bg-emerald-50 text-emerald-700" },
  { title: "Technical Support", description: "Reliable assistance whenever customers need it.", icon: Headphones, color: "bg-rose-50 text-rose-700" },
];

const BENEFITS = [
  { title: "Multi-Product Ecosystem", description: "Access multiple business solutions from one platform.", icon: Network },
  { title: "Multi-Organization Support", description: "Manage multiple organizations through a unified platform.", icon: Building2 },
  { title: "Multi-Branch Management", description: "Operate across multiple locations.", icon: Store },
  { title: "Role-Based Access Control", description: "Secure and flexible user access.", icon: Shield },
  { title: "Secure Cloud Infrastructure", description: "Enterprise-oriented security and reliable access.", icon: Cloud },
  { title: "Business Reporting & Analytics", description: "Make data-driven decisions.", icon: TrendingUp },
];

interface ProductHubPreferences {
  favorites: string[];
  recent: string[];
}

function readProductHubPreferences(key: string): ProductHubPreferences {
  const value = window.localStorage.getItem(key);
  if (!value) return { favorites: [], recent: [] };
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== "object" || parsed === null) return { favorites: [], recent: [] };
  const preferences = parsed as { favorites?: unknown; recent?: unknown };
  return {
    favorites: Array.isArray(preferences.favorites)
      ? preferences.favorites.filter((slug): slug is string => typeof slug === "string")
      : [],
    recent: Array.isArray(preferences.recent)
      ? preferences.recent.filter((slug): slug is string => typeof slug === "string")
      : [],
  };
}

export function ProductHubClient({
  orgId,
  orgName,
  orgLogoUrl,
  hubBranding,
  organizations,
  userName,
  userEmail,
  avatarUrl,
  avatarFallbackUrl,
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
  const [hubPreferences, setHubPreferences] = useState<ProductHubPreferences>({ favorites: [], recent: [] });
  const [preferencesReady, setPreferencesReady] = useState(false);
  const [preferencesError, setPreferencesError] = useState("");
  const preferenceKey = `product-hub-preferences:${orgId}`;
  const canSearch = products.length > 4;
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? products.filter((product) => `${product.name} ${product.description}`.toLowerCase().includes(query))
      : products;
  }, [products, search]);
  const accessibleCount = products.filter((product) => product.canOpen).length;
  const deniedProductMessage = searchParams.get("accessDenied") === "product";
  const favoriteProducts = hubPreferences.favorites
    .map((slug) => products.find((product) => product.slug === slug && product.canOpen))
    .filter((product): product is ProductHubItem => Boolean(product));
  const recentProducts = hubPreferences.recent
    .map((slug) => products.find((product) => product.slug === slug && product.canOpen))
    .filter((product): product is ProductHubItem => Boolean(product))
    .slice(0, 4);

  useEffect(() => {
    try {
      // localStorage is only available after hydration.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHubPreferences(readProductHubPreferences(preferenceKey));
      setPreferencesError("");
    } catch (error) {
      console.error("Product Hub preferences could not be loaded:", error);
      setPreferencesError("Favorites and recent apps are unavailable in this browser.");
    } finally {
      setPreferencesReady(true);
    }
  }, [preferenceKey]);

  function saveHubPreferences(next: ProductHubPreferences) {
    setHubPreferences(next);
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(next));
      setPreferencesError("");
    } catch (error) {
      console.error("Product Hub preferences could not be saved:", error);
      setPreferencesError("Could not save your app shortcuts on this device.");
    }
  }

  function recordProductLaunch(slug: string) {
    const recent = [slug, ...hubPreferences.recent.filter((entry) => entry !== slug)].slice(0, 8);
    saveHubPreferences({ ...hubPreferences, recent });
  }

  function toggleFavorite(slug: string) {
    const favorites = hubPreferences.favorites.includes(slug)
      ? hubPreferences.favorites.filter((entry) => entry !== slug)
      : [slug, ...hubPreferences.favorites];
    saveHubPreferences({ ...hubPreferences, favorites });
  }

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

        <nav className="mt-8 space-y-1.5" aria-label="Main navigation">
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
    <div
      data-product-hub-theme={hubBranding.darkThemeEnabled ? "dark" : "light"}
      data-product-hub-surface-style={hubBranding.darkSurfaceStyle}
      className="min-h-screen bg-[#f5f7fb] text-[#18243b]"
    >
      <style jsx global>{`
        [data-product-hub-theme="dark"] {
          --hub-surface: #111d30;
          --hub-inset-surface: #18263a;
          background-color: #0a1322 !important;
          color: #e2e8f0;
        }
        [data-product-hub-theme="dark"][data-product-hub-surface-style="transparent"] {
          --hub-surface: rgba(17, 29, 48, 0.76);
          --hub-inset-surface: rgba(148, 163, 184, 0.08);
          background-image:
            radial-gradient(circle at 85% 12%, rgba(37, 99, 235, 0.18), transparent 28rem),
            radial-gradient(circle at 12% 65%, rgba(8, 145, 178, 0.12), transparent 26rem);
        }
        [data-product-hub-theme="dark"] [data-hub-surface] {
          background-color: var(--hub-surface) !important;
          border-color: #2a3b52 !important;
          background-image: none !important;
        }
        [data-product-hub-theme="dark"][data-product-hub-surface-style="transparent"] [data-hub-surface] {
          backdrop-filter: blur(14px);
        }
        [data-product-hub-theme="dark"] main [class~="text-[#14233e]"],
        [data-product-hub-theme="dark"] main [class~="text-[#152440]"],
        [data-product-hub-theme="dark"] main [class~="text-[#172744]"],
        [data-product-hub-theme="dark"] main [class~="text-[#10234a]"],
        [data-product-hub-theme="dark"] main [class~="text-[#18243b]"],
        [data-product-hub-theme="dark"] main [class~="text-slate-700"],
        [data-product-hub-theme="dark"] main [class~="text-slate-800"],
        [data-product-hub-theme="dark"] main [class~="text-slate-900"] {
          color: #e2e8f0 !important;
        }
        [data-product-hub-theme="dark"] main [class~="text-slate-500"],
        [data-product-hub-theme="dark"] main [class~="text-slate-600"] {
          color: #a8b7cc !important;
        }
        [data-product-hub-theme="dark"] main [class~="text-blue-700"] {
          color: #8fc5ff !important;
        }
        [data-product-hub-theme="dark"] [data-hub-surface] [class~="bg-slate-50"],
        [data-product-hub-theme="dark"] [data-hub-surface] [class~="bg-slate-50/80"],
        [data-product-hub-theme="dark"] [data-hub-surface] [class~="bg-white"] {
          background-color: var(--hub-inset-surface) !important;
        }
        [data-product-hub-theme="dark"] header [class~="text-slate-500"],
        [data-product-hub-theme="dark"] header [class~="text-slate-800"] {
          color: #d3deec !important;
        }
        [data-product-hub-theme="dark"] header [class~="bg-white"] {
          background-color: var(--hub-surface) !important;
          border-color: #2a3b52 !important;
        }
      `}</style>
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
        <header data-hub-surface className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-7">
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
                activeOrgLogoUrl={orgLogoUrl}
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
                <ProfileAvatar
                  key={avatarUrl ?? avatarFallbackUrl ?? "default-avatar"}
                  avatarUrl={avatarUrl}
                  fallbackUrl={avatarFallbackUrl}
                  initials={(userName || userEmail).slice(0, 1).toUpperCase()}
                />
                <span className="hidden max-w-[150px] text-left sm:block">
                  <span className="block truncate text-xs font-semibold text-slate-800">{userName || userEmail}</span>
                  <span className="block truncate text-[10px] text-slate-500">{orgName}</span>
                </span>
                <ChevronDown className="hidden h-4 w-4 text-slate-400 sm:block" />
              </button>
              {profileOpen && (
                <div data-hub-surface className="absolute right-0 top-full z-30 mt-2 w-60 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
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

        <main className="w-full space-y-6 px-4 py-4 sm:space-y-8 sm:px-6 sm:py-6 lg:px-8">
          <section className="sticky top-[68px] z-10 isolate overflow-hidden rounded-2xl bg-gradient-to-br from-[#071c46] via-[#0754b7] to-[#087dd8] px-5 py-5 text-white shadow-[0_18px_50px_rgba(9,65,139,0.2)] sm:min-h-[205px] sm:px-8 sm:py-5">
            {hubBranding.heroArtworkUrl && (
              <>
                <Image
                  src={hubBranding.heroArtworkUrl}
                  alt=""
                  fill
                  priority
                  unoptimized
                  className="absolute inset-0 z-0 bg-[#0754b7] object-contain p-2"
                />
                <div aria-hidden="true" className="absolute inset-0 z-[1] bg-gradient-to-r from-[#071c46]/90 via-[#0754b7]/65 to-[#0754b7]/15" />
              </>
            )}
            <div className="pointer-events-none absolute inset-0 -z-10 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 75% 30%, #66d9ff 0, transparent 27%), radial-gradient(circle at 93% 90%, #3b82f6 0, transparent 28%)" }} />
            <div className="pointer-events-none absolute -right-20 -top-32 -z-10 h-80 w-80 rounded-full border border-white/15 sm:right-[10%]">
              <div className="absolute inset-7 rounded-full border border-white/15" />
              <div className="absolute inset-14 rounded-full border border-white/15" />
            </div>
            <div className="relative z-10 flex min-h-[165px] max-w-[700px] flex-col justify-center sm:min-h-[175px]">
              <p className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-cyan-200 sm:text-xs">
                <span className="h-px w-6 bg-cyan-300" /> Think Digital Solutions
              </p>
              <h1 className="max-w-[620px] text-[25px] font-bold leading-[1.08] tracking-tight sm:text-3xl lg:text-4xl">
                One Platform. Multiple Solutions. Unlimited Possibilities.
              </h1>
              <p className="mt-2 max-w-[550px] text-xs leading-5 text-blue-100 sm:text-sm sm:leading-6">
                Discover, manage and access intelligent business applications designed to simplify operations and accelerate growth.
              </p>
              <div className="mt-4 flex flex-wrap gap-2.5">
                <a href="#applications" className="inline-flex h-10 items-center gap-2 rounded-lg bg-white px-4 text-xs font-bold text-blue-800 shadow-sm transition hover:bg-blue-50 sm:text-sm">
                  <Rocket className="h-4 w-4" /> Explore Your Applications <ArrowRight className="h-4 w-4" />
                </a>
                <a href="#about" className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/40 bg-white/10 px-4 text-xs font-semibold text-white transition hover:bg-white/20 sm:text-sm">
                  <CheckCircle2 className="h-4 w-4" /> Learn More
                </a>
              </div>
            </div>
            {!hubBranding.heroArtworkUrl && (
            <div aria-hidden="true" className="absolute bottom-4 right-6 hidden h-[180px] w-[270px] items-end justify-center lg:flex xl:right-[8%]">
              <div className="absolute right-0 top-2 grid h-10 w-10 place-items-center rounded-xl border border-white/25 bg-white/15 text-cyan-100 shadow-lg"><Users className="h-5 w-5" /></div>
              <div className="absolute left-1 top-10 grid h-10 w-10 place-items-center rounded-xl border border-white/25 bg-white/15 text-cyan-100 shadow-lg"><ShieldCheck className="h-5 w-5" /></div>
              <div className="absolute right-8 top-[62px] grid h-9 w-9 place-items-center rounded-xl border border-white/25 bg-white/15 text-cyan-100 shadow-lg"><Settings className="h-4 w-4" /></div>
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
            )}
          </section>

          <section aria-label="Quick app shortcuts" className="space-y-4">
            {preferencesError && <p role="status" className="text-xs text-amber-700">{preferencesError}</p>}
            {preferencesReady && favoriteProducts.length > 0 && (
              <div className="space-y-2">
                <h2 className="flex items-center gap-2 text-sm font-bold text-[#14233e]">
                  <Star aria-hidden="true" className="h-4 w-4 fill-amber-400 text-amber-500" />
                  Favorites
                </h2>
                <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                  {favoriteProducts.map((product) => {
                    const presentation = PRODUCT_ICONS[product.slug] ?? { icon: LayoutGrid, color: "bg-slate-100 text-slate-700" };
                    const ProductIcon = presentation.icon;
                    return (
                      <Link
                        key={product.slug}
                        href={product.launchPath!}
                        onClick={() => recordProductLaunch(product.slug)}
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-blue-200 hover:shadow-md"
                      >
                        <span className={`relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg ${presentation.color}`}>
                          {product.imageUrl ? <Image src={product.imageUrl} alt="" fill unoptimized className="object-contain p-1" /> : <ProductIcon className="h-5 w-5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#152440]">{product.name}</span>
                        <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0 text-blue-600" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}
            {preferencesReady && recentProducts.length > 0 && (
              <div className="space-y-2">
                <h2 className="text-sm font-bold text-[#14233e]">Recently opened</h2>
                <div className="flex flex-wrap gap-2">
                  {recentProducts.map((product) => (
                    <Link
                      key={product.slug}
                      href={product.launchPath!}
                      onClick={() => recordProductLaunch(product.slug)}
                      className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    >
                      {product.name}<ArrowRight aria-hidden="true" className="h-3 w-3" />
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </section>

          <section id="applications" className="scroll-mt-[320px] space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Workspace</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14233e] sm:text-2xl">Your Applications</h2>
                <p className="mt-1 text-sm text-slate-500">Access your subscribed and authorized products.</p>
              </div>
              <div className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 sm:self-auto">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                You have access to {accessibleCount} {accessibleCount === 1 ? "product" : "products"}
              </div>
            </div>

            {deniedProductMessage && (
              <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Your account does not currently have access to that product. Contact your organization administrator.
              </div>
            )}

            {canSearch && (
              <label data-hub-surface className="flex h-10 max-w-sm items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-slate-400">
                <Search className="h-4 w-4" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search applications"
                  className="w-full bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
                />
              </label>
            )}

            {filteredProducts.length || isOrgAdmin ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {filteredProducts.map((product) => {
                  const presentation = PRODUCT_ICONS[product.slug] ?? { icon: LayoutGrid, color: "bg-slate-100 text-slate-700" };
                  const ProductIcon = presentation.icon;
                  return (
                    <article data-hub-surface key={product.slug} className="group flex min-h-[190px] flex-col rounded-xl border border-slate-200/90 bg-white p-4 shadow-[0_5px_22px_rgba(15,35,65,0.045)] transition duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_30px_rgba(15,60,130,0.1)] sm:p-5">
                      <div className="flex items-start justify-between gap-3">
                        <div className={`relative grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl ${presentation.color}`}>
                          {product.imageUrl ? (
                            <Image src={product.imageUrl} alt="" fill unoptimized className="object-contain p-1" />
                          ) : (
                            <ProductIcon className="h-6 w-6" strokeWidth={1.8} />
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {product.canOpen && (
                            <button
                              type="button"
                              aria-label={hubPreferences.favorites.includes(product.slug) ? `Remove ${product.name} from favorites` : `Add ${product.name} to favorites`}
                              aria-pressed={hubPreferences.favorites.includes(product.slug)}
                              title={hubPreferences.favorites.includes(product.slug) ? "Remove from favorites" : "Add to favorites"}
                              onClick={() => toggleFavorite(product.slug)}
                              className="rounded-md p-1.5 text-slate-400 transition hover:bg-amber-50 hover:text-amber-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                            >
                              <Star className={`h-4 w-4 ${hubPreferences.favorites.includes(product.slug) ? "fill-amber-400 text-amber-500" : ""}`} />
                            </button>
                          )}
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold ${product.status === "Active" ? "bg-emerald-50 text-emerald-700" : product.status === "Read-only" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${product.status === "Active" ? "bg-emerald-500" : product.status === "Read-only" ? "bg-amber-500" : "bg-slate-400"}`} />
                            {product.status}
                          </span>
                        </div>
                      </div>
                      <div className="mt-4 flex-1">
                        <h3 className="text-sm font-bold text-[#152440]">{product.name}</h3>
                        <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-500">
                          {product.description || "Open your organization's application."}
                        </p>
                      </div>
                      <div className="mt-4 border-t border-slate-100 pt-3">
                        {product.canOpen && product.launchPath ? (
                          <Link
                            href={product.launchPath}
                            onClick={() => recordProductLaunch(product.slug)}
                            className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
                          >
                            Open Application
                            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                          </Link>
                        ) : (
                          <span className="inline-flex h-9 items-center rounded-lg bg-slate-100 px-3.5 text-xs font-medium text-slate-500">
                            {product.status === "Provisioning" ? "Provisioning in progress" : "Temporarily unavailable"}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
                {isOrgAdmin && (
                  <article data-hub-surface className="flex min-h-[190px] flex-col justify-between rounded-xl border border-dashed border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-100 text-blue-700"><LayoutGrid className="h-6 w-6" /></div>
                      <div>
                        <h3 className="text-sm font-bold text-[#152440]">Need Another Solution?</h3>
                        <p className="mt-1.5 text-xs leading-5 text-slate-500">Looking for another business solution? Contact us to request a product.</p>
                      </div>
                    </div>
                    <Link href="/support" className="mt-4 inline-flex h-9 w-fit items-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50">
                      Contact Us <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </article>
                )}
              </div>
            ) : (
              <div data-hub-surface className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-10 text-center sm:py-12">
                <LayoutGrid className="mx-auto h-8 w-8 text-slate-400" />
                <h3 className="mt-3 text-sm font-semibold text-slate-800">No applications available</h3>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
                  Applications assigned to your account will appear here. Contact your organization administrator or support for help.
                </p>
                <Link href="/support" className="mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700">
                  Visit Support Center <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            )}
          </section>

          {isOrgAdmin && (
            <section data-hub-surface className="flex flex-col gap-4 rounded-xl border border-blue-100 bg-blue-50/70 p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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

          <section data-hub-surface id="about" className="scroll-mt-[320px] grid overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[0.9fr_1.1fr]">
            <div aria-hidden="true" className="relative flex min-h-[230px] items-center justify-center overflow-hidden bg-gradient-to-br from-[#08234f] via-[#0872c9] to-[#56c3e8] p-4 sm:min-h-[280px] sm:p-6">
              {hubBranding.aboutImageUrl ? (
                <Image src={hubBranding.aboutImageUrl} alt="" fill unoptimized className="absolute inset-0 bg-slate-50 object-contain p-3 sm:p-5" />
              ) : (
                <>
                  <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 30% 30%, white 0 1px, transparent 1.5px)", backgroundSize: "23px 23px" }} />
                  <div className="absolute h-56 w-56 rounded-full border border-white/25" />
                  <div className="absolute h-40 w-40 rounded-full border border-white/25" />
                  <div className="relative z-10 flex h-36 w-full max-w-[310px] items-center justify-center rounded-t-xl border-[7px] border-slate-800 bg-white/95 shadow-2xl">
                    <div className="text-center">
                      <Image src="/thinksales-logo.svg" alt="" width={54} height={54} className="mx-auto" />
                      <p className="mt-2 text-[10px] font-bold tracking-wide text-slate-700">THINK DIGITAL SOLUTIONS</p>
                    </div>
                  </div>
                  <div className="absolute bottom-7 h-3 w-[min(82%,340px)] rounded-b-md bg-slate-400 shadow-xl" />
                  <div className="absolute left-[12%] top-[15%] grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/15 text-white"><Database className="h-5 w-5" /></div>
                  <div className="absolute right-[12%] top-[22%] grid h-10 w-10 place-items-center rounded-xl border border-white/30 bg-white/15 text-white"><Network className="h-5 w-5" /></div>
                </>
              )}
            </div>
            <div className="flex flex-col justify-center p-6 sm:p-9">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">About Think Digital Solutions</p>
              <h2 className="mt-2 text-xl font-bold leading-tight tracking-tight text-[#14233e] sm:text-2xl">Technology Designed Around Your Business.</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
                We develop innovative and reliable software solutions that help businesses, educational institutions and service providers work smarter, grow faster and achieve more.
              </p>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2.5">
                {["Innovation", "Reliability", "Customer Focus", "Digital Growth"].map((value) => (
                  <span key={value} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700"><Check className="h-3.5 w-3.5 text-blue-600" /> {value}</span>
                ))}
              </div>
              <a href="#services" className="mt-6 inline-flex h-9 w-fit items-center gap-2 rounded-lg bg-blue-600 px-4 text-xs font-semibold text-white hover:bg-blue-700">
                Explore Our Services <ArrowRight className="h-3.5 w-3.5" />
              </a>
            </div>
          </section>

          <section id="services" className="scroll-mt-24 space-y-4">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">What We Do</p>
                <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14233e] sm:text-2xl">Our Services</h2>
                <p className="mt-1 text-sm text-slate-500">Technology services to support your business.</p>
              </div>
              <Link href="/support" className="hidden items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 sm:inline-flex">
                Ask about our services <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SERVICES.map(({ title, description, icon: Icon, color }) => (
                <Link data-hub-surface key={title} href="/support" className="group rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md sm:p-5">
                  <span className={`grid h-10 w-10 place-items-center rounded-xl ${color}`}><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-sm font-bold text-[#172744]">{title}</h3>
                  <p className="mt-1.5 text-xs leading-5 text-slate-500">{description}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">Contact us <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" /></span>
                </Link>
              ))}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.45fr_0.75fr]">
            <div data-hub-surface className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Why Choose Think Digital Solutions?</p>
              <h2 className="mt-1 text-xl font-bold tracking-tight text-[#14233e]">A technology partner for your business.</h2>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {BENEFITS.map(({ title, description, icon: Icon }) => (
                  <div key={title} className="flex gap-3 rounded-xl bg-slate-50/80 p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-700"><Icon className="h-4 w-4" /></span>
                    <div><h3 className="text-xs font-bold text-[#172744]">{title}</h3><p className="mt-1 text-[11px] leading-4 text-slate-500">{description}</p></div>
                  </div>
                ))}
              </div>
            </div>
            <div data-hub-surface className="relative flex min-h-[270px] flex-col justify-end overflow-hidden rounded-2xl bg-gradient-to-br from-[#dbeafe] via-[#bfdbfe] to-[#93c5fd] p-6 sm:min-h-[320px]">
              <div aria-hidden="true" className="absolute -right-10 -top-10 h-56 w-56 rounded-full border-[22px] border-white/30" />
              <div aria-hidden="true" className="absolute right-8 top-14 grid h-28 w-28 place-items-center rounded-full bg-white/60 text-blue-700 shadow-inner"><TrendingUp className="h-14 w-14" /></div>
              <div className="relative z-10 max-w-[280px]">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-800">Built for what’s next</p>
                <h2 className="mt-2 text-2xl font-bold leading-tight text-[#10234a]">Your Growth, Our Priority.</h2>
                <p className="mt-2 text-sm leading-5 text-blue-950/75">Partner with us for innovative digital solutions.</p>
                <Link href="/support" className="mt-5 inline-flex h-9 items-center gap-2 rounded-lg bg-blue-700 px-4 text-xs font-semibold text-white hover:bg-blue-800">Get Started <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <div data-hub-surface id="support" className="scroll-mt-24 flex flex-col justify-between gap-5 rounded-2xl border border-blue-100 bg-gradient-to-br from-[#eaf4ff] to-white p-5 sm:p-6">
              <div className="flex gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-blue-700 shadow-sm"><LifeBuoy className="h-6 w-6" /></span>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Customer Support</p><h2 className="mt-1 text-lg font-bold text-[#172744]">Need Assistance?</h2><p className="mt-1 text-xs leading-5 text-slate-600">Our support team is here to help you get the most out of your applications.</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/support" className="inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3.5 text-xs font-semibold text-white hover:bg-blue-700">Visit Support Center <ArrowRight className="h-3.5 w-3.5" /></Link>
                <Link href="/support" className="inline-flex h-9 items-center gap-2 rounded-lg border border-blue-200 bg-white px-3.5 text-xs font-semibold text-blue-700 hover:bg-blue-50"><BookOpen className="h-3.5 w-3.5" /> Help & Guides</Link>
              </div>
            </div>
            <div data-hub-surface className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-blue-700">Updates</p><h2 className="mt-1 text-lg font-bold text-[#172744]">Latest News & Updates</h2></div>
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-700"><Bell className="h-4 w-4" /></span>
              </div>
              <div className="mt-4 flex min-h-[90px] items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-slate-400"><Bell className="h-4 w-4" /></span>
                <div><p className="text-xs font-semibold text-slate-700">No announcements available</p><p className="mt-1 text-[11px] leading-4 text-slate-500">New platform and product updates will appear here when published.</p></div>
              </div>
              <Link href="/communication" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900">View notifications <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
          </section>
        </main>
        <footer className="bg-[#0d1b35] px-4 py-6 text-white sm:px-7 lg:px-10">
          <div className="mx-auto flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/product-hub" className="flex items-center gap-3">
              <Image src="/thinksales-logo.svg" alt="" width={38} height={38} />
              <span><span className="block text-xs font-bold">Think Digital Solutions</span><span className="mt-0.5 block text-[10px] text-blue-200">Technology for Business Growth</span></span>
            </Link>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[11px] text-blue-100/80">
              <Link href="/support" className="hover:text-white">Contact Us</Link>
              <Link href="/support" className="hover:text-white">Support Center</Link>
              <span className="text-blue-200/50">© {new Date().getFullYear()} Think Digital Solutions</span>
            </div>
          </div>
        </footer>
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
