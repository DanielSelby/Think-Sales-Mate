import Link from "next/link";
import {
  SlidersHorizontal,
  Building2,
  MapPin,
  Users2,
  Coins,
  ShoppingBag,
  ShieldCheck,
  PackageCheck
} from "lucide-react";

const SECTIONS = [
  { label: "General", desc: "Business preferences", href: "/settings/general", icon: SlidersHorizontal },
  { label: "Company", desc: "Profile & information", href: "/settings/company", icon: Building2 },
  { label: "Branches", desc: "Manage branches", href: "/settings/locations", icon: MapPin },
  { label: "Users & Roles", desc: "Access & permissions", href: "/settings/organization", icon: Users2 },
  { label: "Currencies", desc: "Multi-currency settings", href: "/settings/currencies", icon: Coins },
  { label: "Customer Ordering", desc: "Storefront & order settings", href: "/settings/customer-ordering", icon: ShoppingBag },
  { label: "Products & Access", desc: "Subscriptions and product requests", href: "/settings/products", icon: PackageCheck },
  { label: "Duplicate Product Control", desc: "Prevent duplicate catalog items", href: "/settings/products/duplicates", icon: ShieldCheck }
];

const SECTION_GROUPS = [
  {
    title: "Workspace and access",
    description: "Organization identity, locations, and team access.",
    links: ["/settings/general", "/settings/company", "/settings/locations", "/settings/organization"],
  },
  {
    title: "Business configuration",
    description: "Configure currencies and customer ordering.",
    links: ["/settings/currencies", "/settings/customer-ordering"],
  },
  {
    title: "Products and controls",
    description: "Review product access and catalog safeguards.",
    links: ["/settings/products", "/settings/products/duplicates"],
  },
];

export default function SettingsHubPage() {
  return (
    <div className="workspace-settings-page mx-auto max-w-6xl space-y-6">
      <header className="flex flex-col gap-4 rounded-2xl border border-ledger-100 bg-white p-5 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
            <SlidersHorizontal className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-blue-700">Workspace controls</p>
            <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Settings</h1>
            <p className="mt-1 max-w-2xl text-sm text-ledger-500 dark:text-ledger-400">
              Configure organization details, access, locations, and the business rules your teams rely on.
            </p>
          </div>
        </div>
        <span className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
          Choose a section to manage
        </span>
      </header>

      {SECTION_GROUPS.map((group) => (
        <section key={group.title} className="space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">{group.title}</h2>
            <p className="mt-0.5 text-xs text-ledger-500 dark:text-ledger-400">{group.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {SECTIONS.filter((section) => group.links.includes(section.href)).map((section) => (
              <Link
                key={section.href}
                href={section.href}
                className="group flex min-h-32 flex-col items-center gap-2 rounded-card border border-ledger-100 bg-white p-5 text-center shadow-card transition duration-200 hover:-translate-y-0.5 hover:border-signal hover:shadow-md dark:border-ledger-700 dark:bg-ink-900"
              >
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-blue-50 text-blue-700 transition-transform group-hover:scale-105">
                  <section.icon className="h-5 w-5" />
                </span>
                <span className="text-sm font-medium text-ink-900 dark:text-white">{section.label}</span>
                <span className="text-[11px] text-ledger-400">{section.desc}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}