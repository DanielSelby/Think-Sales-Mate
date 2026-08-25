"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/sales/format";
import { DISPLAY_STATUS_LABEL, DISPLAY_STATUS_TONE, deriveDisplayStatus, formatExpenseNumber } from "@/lib/expenses/format";
import { ExpenseRowMenu } from "@/components/expenses/expense-row-menu";
import type { ExpenseStatus, ExpensePaymentStatus } from "@/types/database";

export interface ExpenseDetailItem {
  id: string;
  description: string;
  category: string | null;
  quantity: number;
  unitCost: number;
  taxAmount: number;
  lineTotal: number;
}

export interface ExpenseDetail {
  id: string;
  expenseNumber: number;
  status: ExpenseStatus;
  paymentStatus: ExpensePaymentStatus;
  category: string;
  vendor: string | null;
  description: string | null;
  amount: number;
  currency: string;
  expenseDate: string;
  dueDate: string | null;
  paidOn: string | null;
  paymentMethod: string | null;
  transactionReference: string | null;
  referenceNumber: string | null;
  department: string | null;
  locationName: string | null;
  purchaseOrderLabel: string | null;
  expenseType: string | null;
  tags: string[];
  approvalRequired: boolean;
  approverName: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  discountAmount: number;
  isRecurring: boolean;
  recurringFrequency: string | null;
  nextRecurrenceDate: string | null;
  createdByName: string;
  createdAt: string;
  items: ExpenseDetailItem[];
}

export function ExpenseDetailView({ expense }: { expense: ExpenseDetail }) {
  const displayStatus = deriveDisplayStatus(expense.status, expense.paymentStatus, expense.dueDate);
  const subtotal = expense.items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const taxTotal = expense.items.reduce((sum, i) => sum + i.taxAmount, 0);

  const [notice, setNotice] = React.useState<{ message: string; tone: "success" | "error" } | null>(null);
  function showNotice(message: string, tone: "success" | "error" = "success") {
    setNotice({ message, tone });
    setTimeout(() => setNotice(null), 4000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/expenses"
            className="mb-1 inline-flex items-center gap-1 text-sm text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Expenses
          </Link>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
              {formatExpenseNumber(expense.expenseNumber)}
            </h1>
            <Badge tone={DISPLAY_STATUS_TONE[displayStatus]}>{DISPLAY_STATUS_LABEL[displayStatus]}</Badge>
          </div>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">
            {expense.category} {expense.vendor ? `· ${expense.vendor}` : ""}
          </p>
        </div>
        <ExpenseRowMenu
          expenseId={expense.id}
          expenseNumber={expense.expenseNumber}
          status={expense.status}
          paymentStatus={expense.paymentStatus}
          onNotice={showNotice}
          category={expense.category}
          vendor={expense.vendor}
          date={expense.expenseDate}
          amount={expense.amount}
          currency={expense.currency}
        />
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center justify-between gap-2 rounded-md border px-4 py-2.5 text-sm",
            notice.tone === "success"
              ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white"
              : "border-alert/30 bg-alert-soft text-alert"
          )}
        >
          {notice.message}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card accent="neutral" className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Expense Details
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-x-5 gap-y-3 pt-0 text-sm sm:grid-cols-2">
            <DetailRow label="Expense Date" value={new Date(expense.expenseDate).toLocaleDateString()} />
            <DetailRow label="Due Date" value={expense.dueDate ? new Date(expense.dueDate).toLocaleDateString() : "—"} />
            <DetailRow label="Reference / Description" value={expense.referenceNumber ?? expense.description ?? "—"} />
            <DetailRow label="Department" value={expense.department ?? "—"} />
            <DetailRow label="Location" value={expense.locationName ?? "—"} />
            <DetailRow label="Expense Type" value={expense.expenseType ?? "—"} />
            <DetailRow label="Purchase Order" value={expense.purchaseOrderLabel ?? "—"} />
            <DetailRow label="Tags" value={expense.tags.length > 0 ? expense.tags.join(", ") : "—"} />
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Approval
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <DetailRow label="Approval Required" value={expense.approvalRequired ? "Yes" : "No"} />
            <DetailRow label="Approver" value={expense.approverName ?? "—"} />
            <DetailRow label="Decided By" value={expense.approvedByName ?? "—"} />
            <DetailRow label="Decided At" value={expense.approvedAt ? new Date(expense.approvedAt).toLocaleString() : "—"} />
          </CardContent>
        </Card>
      </div>

      <Card accent="neutral" className="overflow-hidden">
        <CardHeader className="pb-2">
          <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
            Items
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ledger-100 text-xs font-semibold text-ink-900 dark:border-ledger-700 dark:text-white">
                <th className="px-4 py-2">Description</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Cost</th>
                <th className="px-3 py-2 text-right">Tax</th>
                <th className="px-3 py-2 pr-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
              {expense.items.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-ledger-400">No items on this expense.</td>
                </tr>
              )}
              {expense.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-2.5 text-ink-900 dark:text-white">{item.description}</td>
                  <td className="px-3 py-2.5 text-ledger-500 dark:text-ledger-400">{item.category ?? "—"}</td>
                  <td className="px-3 py-2.5 text-right text-ledger-600 dark:text-ledger-300">{item.quantity}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(item.unitCost, expense.currency)}</td>
                  <td className="px-3 py-2.5 text-right font-mono text-ledger-600 dark:text-ledger-300">{formatCurrency(item.taxAmount, expense.currency)}</td>
                  <td className="px-3 py-2.5 pr-4 text-right font-mono font-medium text-ink-900 dark:text-white">{formatCurrency(item.lineTotal, expense.currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card accent="signal">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Totals
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <TotalsRow label="Subtotal" value={formatCurrency(subtotal, expense.currency)} />
            <TotalsRow label="Tax" value={formatCurrency(taxTotal, expense.currency)} />
            {expense.discountAmount > 0 && <TotalsRow label="Discount" value={`- ${formatCurrency(expense.discountAmount, expense.currency)}`} />}
            <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
              <span className="font-medium text-ink-900 dark:text-white">Total</span>
              <span className="font-display text-lg font-semibold text-signal">{formatCurrency(expense.amount, expense.currency)}</span>
            </div>
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Payment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <DetailRow label="Method" value={expense.paymentMethod ?? "—"} />
            <DetailRow label="Transaction Ref." value={expense.transactionReference ?? "—"} />
            <DetailRow label="Paid On" value={expense.paidOn ? new Date(expense.paidOn).toLocaleDateString() : "—"} />
          </CardContent>
        </Card>

        <Card accent="neutral">
          <CardHeader className="pb-2">
            <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
              Other
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 pt-0 text-sm">
            <DetailRow label="Recurring" value={expense.isRecurring ? `${expense.recurringFrequency ?? "—"} · next ${expense.nextRecurrenceDate ? new Date(expense.nextRecurrenceDate).toLocaleDateString() : "—"}` : "No"} />
            <DetailRow label="Created By" value={expense.createdByName} />
            <DetailRow label="Created At" value={new Date(expense.createdAt).toLocaleString()} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-ledger-400">{label}</p>
      <p className="text-ink-900 dark:text-white">{value}</p>
    </div>
  );
}

function TotalsRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ledger-500">{label}</span>
      <span className="font-mono text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}