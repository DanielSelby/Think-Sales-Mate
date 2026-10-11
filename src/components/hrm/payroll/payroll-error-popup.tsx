"use client";

import { TransactionFeedback } from "@/components/transactions/transaction-feedback";
import { useRouter } from "next/navigation";

export function PayrollErrorPopup({ message }: { message: string }) {
  const router = useRouter();
  const needsChartOfAccounts = /account|journal/i.test(message);
  function close() {
    router.replace("/hrm/payroll", { scroll: false });
  }

  return (
    <TransactionFeedback
      kind="error"
      message={message}
      onClose={close}
      actionLabel={needsChartOfAccounts ? "Open Chart of Accounts" : undefined}
      onAction={needsChartOfAccounts ? () => router.push("/accounting?tab=coa") : undefined}
    />
  );
}
