"use client";

import Link from "next/link";
import { BarChart3, CalendarClock, FileText, FolderKanban, Paperclip, Repeat2, Settings2, Wallet } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";
import { formatExpenseNumber } from "@/lib/expenses/format";
import type { ExpenseWorkspaceView } from "@/components/expenses/expense-navigation";
import type { ExpenseKpis, ExpenseRow } from "@/components/expenses/expense-list-view";

export interface ExpenseBudgetRow {
  category: string;
  monthlyLimit: number;
  monthSpend: number;
  transactions: number;
}

export interface ExpenseAttachmentRow {
  id: string;
  expenseId: string;
  expenseNumber: number;
  category: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  createdAt: string;
  url: string | null;
  linkError: string | null;
}

interface Props {
  view: Exclude<ExpenseWorkspaceView, "list">;
  expenses: ExpenseRow[];
  kpis: ExpenseKpis;
  currency: string;
  categoryBreakdown: { category: string; total: number }[];
  budgets: ExpenseBudgetRow[];
  attachments: ExpenseAttachmentRow[];
}

const titles: Record<Props["view"], string> = {
  approvals: "Expense Approval Queue",
  recurring: "Recurring Expenses",
  budgets: "Expense Budget Control",
  reports: "Expense Reports & Analytics",
  attachments: "Expense Attachments",
  settings: "Expense Settings",
};

function money(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function Empty({ children }: { children: string }) {
  return <p className="px-4 py-10 text-center text-sm text-ledger-500 dark:text-ledger-300">{children}</p>;
}

export function ExpenseWorkspaceView({ view, expenses, kpis, currency, categoryBreakdown, budgets, attachments }: Props) {
  const monthlyExpenses = expenses.filter((expense) => expense.isRecurring);

  return (
    <section className="expenses-page space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-ledger-500">Expenses</p>
        <h1 className="mt-1 text-2xl font-bold text-ink-900 dark:text-white">{titles[view]}</h1>
        <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-300">
          {view === "recurring" && "Review recurring expense schedules recorded on expense entries."}
          {view === "budgets" && "Compare current-month spending with each configured monthly category limit."}
          {view === "reports" && "Review expense totals and category spending using the records available to you."}
          {view === "attachments" && "Open files attached to expenses you are permitted to view."}
          {view === "settings" && "Manage expense categories, budgets, and approval workflows in their existing settings pages."}
          {view === "approvals" && "Review expenses awaiting approval and take action from the expense list."}
        </p>
      </header>

      {view === "recurring" && (
        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 p-4 text-sm font-semibold text-ink-900 dark:border-ledger-700 dark:text-white">
            <Repeat2 className="h-4 w-4 text-ledger-500" /> Recurring expense schedules ({monthlyExpenses.length})
          </div>
          {monthlyExpenses.length === 0 ? <Empty>No recurring expenses are configured yet.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-300">
                  <tr><th className="px-4 py-3">Expense</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Vendor</th><th className="px-4 py-3">Frequency</th><th className="px-4 py-3">Next date</th><th className="px-4 py-3 text-right">Amount</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {monthlyExpenses.map((expense) => (
                    <tr key={expense.id}>
                      <td className="px-4 py-3 font-mono text-signal">{formatExpenseNumber(expense.expenseNumber)}</td>
                      <td className="px-4 py-3 text-ink-900 dark:text-white">{expense.category}</td>
                      <td className="px-4 py-3 text-ledger-500">{expense.vendor ?? "—"}</td>
                      <td className="px-4 py-3 capitalize text-ledger-500">{expense.recurringFrequency ?? "—"}</td>
                      <td className="px-4 py-3 text-ledger-500">{expense.nextRecurrenceDate ? new Date(expense.nextRecurrenceDate).toLocaleDateString() : "Not scheduled"}</td>
                      <td className="px-4 py-3 text-right font-medium text-ink-900 dark:text-white">{money(expense.amount, currency)}</td>
                      <td className="px-4 py-3"><Link className="font-semibold text-signal hover:underline" href={`/expenses/${expense.id}`}>Show</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "budgets" && (
        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 p-4 text-sm font-semibold text-ink-900 dark:border-ledger-700 dark:text-white">
            <Wallet className="h-4 w-4 text-ledger-500" /> Monthly category budgets
          </div>
          {budgets.length === 0 ? <Empty>No monthly expense budgets have been configured.</Empty> : (
            <div className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {budgets.map((budget) => {
                const percent = budget.monthlyLimit > 0 ? Math.round((budget.monthSpend / budget.monthlyLimit) * 100) : 0;
                return (
                  <div key={budget.category} className="grid gap-3 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-ink-900 dark:text-white">{budget.category}</p>
                        <p className="text-xs text-ledger-500">{money(budget.monthSpend, currency)} of {money(budget.monthlyLimit, currency)} · {budget.transactions} transactions</p>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-ledger-100 dark:bg-white/10">
                        <div className={`h-full rounded-full ${percent >= 100 ? "bg-red-500" : percent >= 80 ? "bg-amber-500" : "bg-signal"}`} style={{ width: `${Math.min(100, percent)}%` }} />
                      </div>
                    </div>
                    <span className={`text-sm font-bold tabular-nums ${percent >= 100 ? "text-red-600 dark:text-red-300" : "text-ink-700 dark:text-ledger-100"}`}>{percent}%</span>
                  </div>
                );
              })}
            </div>
          )}
          <div className="border-t border-ledger-100 p-4 dark:border-ledger-700">
            <Link href="/expenses/categories" className="text-sm font-semibold text-signal hover:underline">Manage category budgets</Link>
          </div>
        </div>
      )}

      {view === "reports" && (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              ["Total expenses", kpis.totalExpenses],
              ["This month", kpis.thisMonth],
              ["Pending approval", kpis.pendingApproval],
              ["Overdue", kpis.overdue],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
                <p className="text-xs text-ledger-500">{label}</p>
                <p className="mt-2 text-xl font-bold text-ink-900 dark:text-white">{money(Number(value), currency)}</p>
              </div>
            ))}
          </div>
          <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-2 border-b border-ledger-100 p-4 text-sm font-semibold text-ink-900 dark:border-ledger-700 dark:text-white">
              <BarChart3 className="h-4 w-4 text-ledger-500" /> Spending by category
            </div>
            {categoryBreakdown.length === 0 ? <Empty>No expense data is available for this report.</Empty> : (
              <div className="divide-y divide-ledger-100 dark:divide-ledger-700">
                {categoryBreakdown.map((row) => (
                  <div key={row.category} className="flex items-center justify-between gap-3 px-4 py-3">
                    <span className="text-sm text-ink-900 dark:text-white">{row.category}</span>
                    <span className="text-sm font-semibold tabular-nums text-ink-900 dark:text-white">{money(row.total, currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {view === "attachments" && (
        <div className="overflow-hidden rounded-2xl border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <div className="flex items-center gap-2 border-b border-ledger-100 p-4 text-sm font-semibold text-ink-900 dark:border-ledger-700 dark:text-white">
            <Paperclip className="h-4 w-4 text-ledger-500" /> Expense files ({attachments.length})
          </div>
          {attachments.length === 0 ? <Empty>No attachments are available for expenses you can view.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="bg-ledger-50 text-xs uppercase text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-300">
                  <tr><th className="px-4 py-3">File</th><th className="px-4 py-3">Expense</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Uploaded</th><th className="px-4 py-3">Size</th><th className="px-4 py-3">Action</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {attachments.map((attachment) => (
                    <tr key={attachment.id}>
                      <td className="max-w-[260px] truncate px-4 py-3 text-ink-900 dark:text-white">{attachment.fileName}</td>
                      <td className="px-4 py-3 font-mono text-signal">{formatExpenseNumber(attachment.expenseNumber)}</td>
                      <td className="px-4 py-3 text-ledger-500">{attachment.category}</td>
                      <td className="px-4 py-3 text-ledger-500">{new Date(attachment.createdAt).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-ledger-500">{Math.max(1, Math.round(attachment.fileSize / 1024))} KB</td>
                      <td className="px-4 py-3">
                        {attachment.url
                          ? <a className="font-semibold text-signal hover:underline" href={attachment.url} target="_blank" rel="noreferrer">Open</a>
                          : <span className="text-xs text-alert" title={attachment.linkError ?? "Could not create a secure file link."}>Link unavailable</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {view === "settings" && (
        <div className="grid gap-4 md:grid-cols-2">
          <SettingsCard href="/expenses/categories" icon={<FolderKanban className="h-5 w-5" />} title="Categories & budgets" description="Manage expense categories and their budget limits." />
          <SettingsCard href="/approvals" icon={<FileText className="h-5 w-5" />} title="Approval workflow" description="Review pending expense approvals and approval history." />
          <SettingsCard href="/settings/users" icon={<Settings2 className="h-5 w-5" />} title="Permissions" description="Manage which roles can view, create, edit, and approve expenses." />
          <SettingsCard href="/expenses?view=recurring" icon={<CalendarClock className="h-5 w-5" />} title="Recurring schedules" description="Review the recurring schedule details stored on expense records." />
        </div>
      )}

      {view === "approvals" && (
        <div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-sm text-ledger-600 dark:text-ledger-200">
            {expenses.filter((expense) => expense.status === "pending_approval").length} expense(s) are awaiting approval.
          </p>
          <Link href="/expenses?status=pending_approval" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-signal px-4 py-2 text-sm font-semibold text-white hover:brightness-105">
            <FileText className="h-4 w-4" /> Open pending expenses
          </Link>
        </div>
      )}
    </section>
  );
}

function SettingsCard({ href, icon, title, description }: { href: string; icon: React.ReactNode; title: string; description: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card transition hover:border-ledger-300 hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900 dark:hover:border-ledger-500">
      <div className="flex items-center gap-3 text-ink-900 dark:text-white">{icon}<span className="font-semibold">{title}</span></div>
      <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-300">{description}</p>
    </Link>
  );
}
