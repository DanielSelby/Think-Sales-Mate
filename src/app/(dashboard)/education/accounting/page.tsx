import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowLeft,
  Banknote,
  BookOpen,
  Building2,
  ChartNoAxesCombined,
  ClipboardList,
  FileText,
  Landmark,
  Receipt,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getAccessibleEducationCampuses } from "@/lib/education/access";
import { getCurrentOrgContext } from "@/lib/organizations/current";
import { canTabPermission } from "@/lib/rbac/permissions";
import { createClient } from "@/lib/supabase/server";
import { getProductAppPath } from "@/lib/product-app-routes";

type AccountingLink = {
  label: string;
  href: string;
};

type AccountingGroup = {
  title: string;
  description: string;
  icon: LucideIcon;
  links: AccountingLink[];
};

function getGroups(access: {
  canViewFees: boolean;
  canViewPayments: boolean;
  canViewExpenses: boolean;
  canViewAudit: boolean;
  canViewAccounts: boolean;
  canViewPeriods: boolean;
  canViewJournals: boolean;
  canViewLedger: boolean;
  canViewSettings: boolean;
  canViewReports: boolean;
  canViewReconciliation: boolean;
  canViewStudents: boolean;
  canViewAcademicYears: boolean;
}): AccountingGroup[] {
  return [
    {
      title: "Financial Overview",
      description: "Start with the accounting dashboard and review your balances.",
      icon: ChartNoAxesCombined,
      links: [
        { label: "Dashboard", href: "/accounting" },
        ...(access.canViewReports ? [{ label: "Trial Balance", href: "/accounting/reports?type=trial-balance" }] : []),
      ],
    },
    {
      title: "Ledger & Journals",
      description: "Maintain accounts, record journal entries, and inspect posted balances.",
      icon: BookOpen,
      links: [
        ...(access.canViewAccounts ? [{ label: "Chart of Accounts", href: "/accounting/chart-of-accounts" }] : []),
        ...(access.canViewLedger ? [{ label: "General Ledger", href: "/accounting/general-ledger" }] : []),
        ...(access.canViewJournals ? [{ label: "Journal Entries", href: "/accounting/journal-entries" }] : []),
        ...(access.canViewPeriods ? [{ label: "Fiscal Years & Periods", href: "/accounting/periods" }] : []),
      ],
    },
    {
      title: "Student Revenue",
      description: "Manage student fee charges, collections, and outstanding balances.",
      icon: Receipt,
      links: [
        ...(access.canViewFees ? [{ label: "Student Fees", href: "/finance" }] : []),
        ...(access.canViewPayments && access.canViewStudents && access.canViewAcademicYears ? [
          { label: "Receipts & Collections", href: "/finance/collections" },
        ] : []),
        ...(access.canViewFees && access.canViewPayments && access.canViewStudents && access.canViewAcademicYears
          ? [{ label: "Aging Report", href: "/finance/aging" }]
          : []),
      ],
    },
    {
      title: "Expenses",
      description: "Submit, review, and track school operating expenses.",
      icon: Wallet,
      links: [
        ...(access.canViewExpenses ? [{ label: "Expense Management", href: "/expenses" }] : []),
      ],
    },
    {
      title: "Cash & Banking",
      description: "Manage cash and bank accounts, review posted cash activity, and reconcile statements.",
      icon: Landmark,
      links: [
        ...(access.canViewAccounts ? [{ label: "Bank Accounts", href: "/accounting/bank-accounts" }] : []),
        ...(access.canViewLedger ? [{ label: "Cashbook", href: "/accounting/cashbook" }] : []),
        ...(access.canViewReconciliation ? [{ label: "Bank Reconciliation", href: "/accounting/bank-reconciliation" }] : []),
      ],
    },
    {
      title: "Petty Cash",
      description: "Submit, approve, and account for petty-cash vouchers against a mapped cash fund.",
      icon: Wallet,
      links: [
        ...(access.canViewExpenses ? [{ label: "Manage Petty Cash", href: "/accounting/petty-cash" }] : []),
      ],
    },
    {
      title: "Financial Reports",
      description: "Generate statements from posted journals for your authorized campus scope.",
      icon: FileText,
      links: [
        ...(access.canViewReports ? [
          { label: "Income Statement", href: "/accounting/reports?type=income-statement" },
          { label: "Balance Sheet", href: "/accounting/reports?type=balance-sheet" },
          { label: "Cash Flow Summary", href: "/accounting/reports?type=cash-flow" },
        ] : []),
      ],
    },
    {
      title: "Controls & Settings",
      description: "Review audit activity and manage automated accounting posting rules.",
      icon: ShieldCheck,
      links: [
        ...(access.canViewAudit ? [{ label: "Education Audit Trail", href: "/activity" }] : []),
        ...(access.canViewSettings ? [{ label: "Automated Posting Settings", href: "/accounting/settings" }] : []),
      ],
    },
  ].filter((group) => group.links.length > 0);
}

export default async function EducationAccountingPage() {
  const context = await getCurrentOrgContext();
  if (!context) redirect("/login");

  const canViewDashboard = await canTabPermission("education_finance", "finance", "accounting_dashboard", "view");
  if (!canViewDashboard) redirect("/dashboard?accessDenied=think-education.accounting");

  const [canViewFees, canViewPayments, canViewExpenses, canViewAudit, canViewAccounts, canViewPeriods, canViewJournals, canViewLedger, canViewSettings, canViewReports, canViewReconciliation, canViewStudents, canViewAcademicYears, campusAccess] = await Promise.all([
      canTabPermission("education_finance", "finance", "charges", "view"),
      canTabPermission("education_finance", "finance", "payments", "view"),
      canTabPermission("education_expenses", "expenses", "records", "view"),
      canTabPermission("education_audit", "activity", "records", "view_audit"),
      canTabPermission("education_finance", "finance", "chart_of_accounts", "view"),
      canTabPermission("education_finance", "finance", "fiscal_periods", "view"),
      canTabPermission("education_finance", "finance", "journal_entries", "view"),
      canTabPermission("education_finance", "finance", "general_ledger", "view"),
      canTabPermission("education_finance", "finance", "accounting_settings", "view"),
      canTabPermission("education_finance", "finance", "financial_reports", "view"),
      canTabPermission("education_finance", "finance", "bank_reconciliation", "view"),
      canTabPermission("education_students", "students", "list", "view"),
      canTabPermission("education_academics", "academics", "calendar", "view"),
      getAccessibleEducationCampuses(context.orgId, context.userId),
  ]);

  const branchIds = campusAccess.campuses.map((campus) => campus.id);
  let feeChargeCount = 0;
  let paymentCount = 0;
  let expenseCount = 0;
  let pendingExpenseCount = 0;

  if (branchIds.length > 0) {
    const supabase = await createClient();
    const [
      feeChargesResult,
      paymentsResult,
      expensesResult,
      pendingExpensesResult,
    ] = await Promise.all([
      canViewFees
        ? supabase.from("education_fee_charges")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
        : Promise.resolve({ count: 0, error: null }),
      canViewPayments
        ? supabase.from("education_fee_payments")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId)
        : Promise.resolve({ count: 0, error: null }),
      canViewExpenses
        ? supabase.from("education_expenses")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
        : Promise.resolve({ count: 0, error: null }),
      canViewExpenses
        ? supabase.from("education_expenses")
          .select("id", { count: "exact", head: true })
          .eq("org_id", context.orgId)
          .in("branch_id", branchIds)
          .eq("status", "pending_approval")
        : Promise.resolve({ count: 0, error: null }),
    ]);
    const queryError = feeChargesResult.error ?? paymentsResult.error
      ?? expensesResult.error ?? pendingExpensesResult.error;
    if (queryError) throw new Error(`Could not load the Education Accounting overview: ${queryError.message}`);
    feeChargeCount = feeChargesResult.count ?? 0;
    paymentCount = paymentsResult.count ?? 0;
    expenseCount = expensesResult.count ?? 0;
    pendingExpenseCount = pendingExpensesResult.count ?? 0;
  }

  const groups = getGroups({
    canViewFees, canViewPayments, canViewExpenses, canViewAudit,
    canViewAccounts, canViewPeriods, canViewJournals, canViewLedger,
    canViewSettings, canViewReports, canViewReconciliation, canViewStudents, canViewAcademicYears,
  });
  const metrics = [
    { label: "Fee charge records", value: canViewFees ? feeChargeCount : null, icon: Receipt },
    { label: "Payment receipts", value: canViewPayments ? paymentCount : null, icon: Banknote },
    { label: "Expense records", value: canViewExpenses ? expenseCount : null, icon: Wallet },
    { label: "Pending expense reviews", value: canViewExpenses ? pendingExpenseCount : null, icon: ClipboardList },
  ].filter((metric) => metric.value !== null);

  return (
    <main className="mx-auto max-w-[1500px] space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link
            href={getProductAppPath("think-education", "/dashboard")}
            className="inline-flex items-center gap-1 text-sm font-medium hover:underline"
            style={{ color: "var(--theme-primary, #2563eb)" }}
          >
            <ArrowLeft className="h-4 w-4" /> Think Education
          </Link>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--theme-primary, #2563eb)" }}>
            Think Education
          </p>
          <h1 className="mt-1 text-2xl font-bold" style={{ color: "var(--theme-text, #111827)" }}>
            Accounting
          </h1>
          <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
            School finance workspace for {context.orgName}
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm" style={{
          borderColor: "var(--theme-header-border-light, #e2e8f0)",
          color: "var(--theme-text-muted, #4b5563)",
          backgroundColor: "var(--theme-surface, #fff)",
        }}>
          <Building2 className="h-4 w-4" style={{ color: "var(--theme-primary, #2563eb)" }} />
          {branchIds.length} accessible {branchIds.length === 1 ? "campus" : "campuses"}
        </div>
      </header>

      {branchIds.length === 0 ? (
        <section className="rounded-2xl border p-5" style={{
          borderColor: "var(--theme-header-border-light, #e2e8f0)",
          backgroundColor: "var(--theme-surface, #fff)",
          color: "var(--theme-text, #111827)",
        }}>
          <h2 className="font-semibold">Campus access is not configured</h2>
          <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>
            Assign an organization-wide or campus-specific Think Education scope to view accounting records.
          </p>
        </section>
      ) : (
        <>
          <section aria-label="Existing Education finance record counts" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => (
              <article key={label} className="flex items-center justify-between rounded-2xl border p-4 shadow-sm" style={{
                borderColor: "var(--theme-header-border-light, #e2e8f0)",
                backgroundColor: "var(--theme-surface, #fff)",
              }}>
                <div>
                  <p className="text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums" style={{ color: "var(--theme-text, #111827)" }}>
                    {value?.toLocaleString() ?? "—"}
                  </p>
                </div>
                <span className="grid h-10 w-10 place-items-center rounded-xl" style={{
                  backgroundColor: "var(--theme-primary-pale, #eff6ff)",
                  color: "var(--theme-primary, #2563eb)",
                }}>
                  <Icon className="h-5 w-5" />
                </span>
              </article>
            ))}
          </section>

          <p className="rounded-xl border px-4 py-3 text-sm" style={{
            borderColor: "var(--theme-header-border-light, #e2e8f0)",
            backgroundColor: "var(--theme-primary-pale, #eff6ff)",
            color: "var(--theme-text-muted, #374151)",
          }}>
            These are counts from operational records, not ledger balances. Finalized fees, receipts, and expenses are posted automatically after their campus account mappings are configured; existing records must be backfilled. Academic years and fiscal periods remain separate.
          </p>
        </>
      )}

      <section aria-label="Accounting navigation" className="grid gap-4 lg:grid-cols-2">
        {groups.map(({ title, description, icon: Icon, links }) => (
          <article key={title} className="rounded-2xl border p-4 shadow-sm md:p-5" style={{
            borderColor: "var(--theme-header-border-light, #e2e8f0)",
            backgroundColor: "var(--theme-surface, #fff)",
          }}>
            <h2 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--theme-text, #111827)" }}>
              <Icon className="h-5 w-5" style={{ color: "var(--theme-primary, #2563eb)" }} />
              {title}
            </h2>
            <p className="mt-1 text-sm" style={{ color: "var(--theme-text-muted, #4b5563)" }}>{description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {links.map(({ label, href }) => (
                <Link
                  key={label}
                  href={getProductAppPath("think-education", href)}
                  aria-current={label === "Dashboard" ? "page" : undefined}
                  className="inline-flex min-h-10 items-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:shadow-sm"
                  style={{
                    borderColor: "var(--theme-header-border-light, #cbd5e1)",
                    color: "var(--theme-text, #1f2937)",
                    backgroundColor: "var(--theme-surface, #fff)",
                  }}
                >
                  {label}
                </Link>
              ))}
            </div>
          </article>
        ))}
      </section>

    </main>
  );
}
