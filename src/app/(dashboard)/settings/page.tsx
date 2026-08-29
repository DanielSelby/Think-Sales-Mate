import Link from "next/link";
import {
  SlidersHorizontal,
  Building2,
  MapPin,
  Users2,
  Coins,
  Percent,
  CreditCard,
  Mail,
  ShoppingBag
} from "lucide-react";

const SECTIONS = [
  { label: "General", desc: "Business preferences", href: "/settings/general", icon: SlidersHorizontal },
  { label: "Company", desc: "Profile & information", href: "/settings/company", icon: Building2 },
  { label: "Branches", desc: "Manage branches", href: "/settings/locations", icon: MapPin },
  { label: "Users & Roles", desc: "Access & permissions", href: "/settings/organization", icon: Users2 },
  { label: "Currencies", desc: "Multi-currency settings", href: "/settings/currencies", icon: Coins },
  { label: "Taxes", desc: "Tax rates & rules", href: "/settings/taxes", icon: Percent },
  { label: "Payments", desc: "Payment methods", href: "/settings/payments", icon: CreditCard },
  { label: "Email", desc: "Email templates", href: "/settings/email", icon: Mail },
  { label: "Customer Ordering", desc: "Storefront & order settings", href: "/settings/customer-ordering", icon: ShoppingBag }
];

export default function SettingsHubPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Settings</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage your business preferences and system configurations.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="flex flex-col items-center gap-2 rounded-card border border-ledger-100 bg-white p-5 text-center shadow-card transition-colors hover:border-signal dark:border-ledger-700 dark:bg-ink-900"
          >
            <s.icon className="h-5 w-5 text-ledger-400" />
            <span className="text-sm font-medium text-ink-900 dark:text-white">{s.label}</span>
            <span className="text-[11px] text-ledger-400">{s.desc}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}