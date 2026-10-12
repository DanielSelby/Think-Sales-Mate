"use client";

import { useState } from "react";
import { Check, Copy, Download, Printer } from "lucide-react";

export type StatementDownloadRow = {
  date: string;
  description: string;
  counterparty: string;
  branch: string;
  type: string;
  amount: number;
  runningBalance: number;
};

function csvCell(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export function StatementActions({
  accountName,
  accountNumber,
  organizationName,
  currency,
  period,
  openingBalance,
  closingBalance,
  transactions,
}: {
  accountName: string;
  accountNumber: string | null;
  organizationName: string;
  currency: string;
  period: string;
  openingBalance: number;
  closingBalance: number;
  transactions: StatementDownloadRow[];
}) {
  const downloadStatement = () => {
    const rows: Array<Array<string | number>> = [
      [organizationName, "Account Statement"],
      ["Account", accountName],
      ["Account number", accountNumber ?? "Not provided"],
      ["Statement period", period],
      ["Opening balance", openingBalance],
      [],
      ["Date", "Description", "Counterparty", "Branch", "Type", "Deposit", "Withdrawal", "Running balance"],
      ...transactions.map((transaction) => [
        transaction.date,
        transaction.description,
        transaction.counterparty,
        transaction.branch,
        transaction.type,
        transaction.amount > 0 ? transaction.amount : "",
        transaction.amount < 0 ? Math.abs(transaction.amount) : "",
        transaction.runningBalance,
      ]),
      [],
      ["Closing balance", closingBalance],
      ["Currency", currency],
    ];
    const csv = rows.map((row) => row.map((cell) => csvCell(cell ?? "")).join(",")).join("\r\n");
    const blobUrl = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `${accountName.trim().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "account"}-statement.csv`;
    link.click();
    URL.revokeObjectURL(blobUrl);
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          @page { size: A4 landscape; margin: 12mm; }
          html, body { width: 100%; min-height: 0; background: #fff !important; }
          body * { visibility: hidden !important; }
          .account-statement-print, .account-statement-print * { visibility: visible !important; }
          .account-statement-print {
            position: absolute !important;
            inset: 0 auto auto 0 !important;
            width: 100% !important;
            color: #102a43 !important;
            background: #fff !important;
          }
          .account-statement-print .account-statement-no-print { display: none !important; }
          .account-statement-print .account-statement-print-only { display: block !important; }
          .account-statement-print .account-statement-table-wrap { overflow: visible !important; }
          .account-statement-print table { min-width: 0 !important; width: 100% !important; }
          .account-statement-print tr { break-inside: avoid; }
          .account-statement-print .account-statement-card { box-shadow: none !important; }
        }
      `}</style>
      <div className="account-statement-no-print flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[#d5e2ef] bg-white px-4 text-sm font-semibold text-[#17385d] shadow-sm transition hover:bg-blue-50 dark:border-slate-500 dark:bg-ink-900 dark:text-white"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> Print
        </button>
        <button
          type="button"
          onClick={downloadStatement}
          title="Downloads all transactions in the selected statement period."
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700"
        >
          <Download className="h-4 w-4" aria-hidden="true" /> Download Statement
        </button>
      </div>
    </>
  );
}

export function CopyAccountNumberButton({ accountNumber }: { accountNumber: string }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const copy = async () => {
    setError("");
    try {
      await navigator.clipboard.writeText(accountNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (copyError) {
      setError(copyError instanceof Error ? copyError.message : "Could not copy the account number.");
    }
  };
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? "Account number copied" : "Copy account number"}
        title={copied ? "Copied" : "Copy account number"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-blue-700 hover:bg-blue-100 dark:text-blue-300 dark:hover:bg-blue-500/10"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      {error && <span role="alert" className="text-[10px] text-red-700">{error}</span>}
    </span>
  );
}
