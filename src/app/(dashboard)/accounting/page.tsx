import { Suspense } from "react";
import { AccountingDashboard } from "@/components/accounting/accounting-dashboard";

export const metadata = {
  title: "Accounting & Financial Management | ThinkSales Pro",
  description: "Enterprise double-entry accounting, General Ledger, Chart of Accounts, and Financial Reports.",
};

export default function AccountingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-96 items-center justify-center">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
            <span>Loading ThinkSales Pro Accounting System...</span>
          </div>
        </div>
      }
    >
      <AccountingDashboard />
    </Suspense>
  );
}