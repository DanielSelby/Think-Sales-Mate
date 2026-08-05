import Link from "next/link";
import { cn } from "@/lib/utils";

const TABS = [
  { key: "team", label: "Users", href: "/settings/organization" },
  { key: "locations", label: "Locations", href: "/settings/locations" }
] as const;

export function SettingsTabs({ active }: { active: (typeof TABS)[number]["key"] }) {
  return (
    <div className="flex gap-1 border-b border-ledger-100 dark:border-ledger-700">
      {TABS.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "border-b-2 px-3 pb-2.5 text-sm font-medium transition-colors",
            active === tab.key
              ? "border-signal text-ink-900 dark:text-white"
              : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}