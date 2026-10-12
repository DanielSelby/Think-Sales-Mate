"use client";

import Link from "next/link";
import { ClipboardList, FileCheck2, FolderKanban, Settings2 } from "lucide-react";

export type ExpenseWorkspaceView = "list" | "approvals" | "recurring" | "budgets" | "reports" | "attachments" | "settings";

const tabs: { view: ExpenseWorkspaceView | "new" | "categories"; href: string; label: string; icon: typeof ClipboardList }[] = [
  { view: "new", href: "/expenses/new", label: "Add Expense", icon: ClipboardList },
  { view: "list", href: "/expenses", label: "Expense List", icon: FileCheck2 },
  { view: "categories", href: "/expenses/categories", label: "Categories", icon: FolderKanban },
  { view: "approvals", href: "/expenses?view=approvals", label: "Approval Queue", icon: FileCheck2 },
  { view: "recurring", href: "/expenses?view=recurring", label: "Recurring Expenses", icon: ClipboardList },
  { view: "budgets", href: "/expenses?view=budgets", label: "Budget Control", icon: FolderKanban },
  { view: "reports", href: "/expenses?view=reports", label: "Reports & Analytics", icon: FileCheck2 },
  { view: "attachments", href: "/expenses?view=attachments", label: "Attachments", icon: FolderKanban },
  { view: "settings", href: "/expenses?view=settings", label: "Settings", icon: Settings2 },
];

export function ExpenseNavigation({ active }: { active: ExpenseWorkspaceView | "new" | "categories" }) {
  return (
    <nav aria-label="Expense management" className="overflow-x-auto rounded-2xl border border-ledger-100 bg-white p-1 shadow-card dark:border-white/10 dark:bg-ink-900">
      <div className="flex min-w-max items-center gap-1">
        {tabs.map(({ view, href, label, icon: Icon }) => (
          <Link
            key={view}
            href={href}
            aria-current={active === view ? "page" : undefined}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              active === view
                ? "bg-signal text-white shadow-sm"
                : "text-ledger-500 hover:bg-ledger-50 hover:text-ink-900 dark:text-ledger-300 dark:hover:bg-white/[0.06] dark:hover:text-white"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
