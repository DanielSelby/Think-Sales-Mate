"use client";

import { useState } from "react";
import { TransactionFeedback } from "@/components/transactions/transaction-feedback";

export function EducationExpenseFeedback({
  kind,
  message,
  actionHref,
  actionLabel,
}: {
  kind: "success" | "error" | "warning";
  message: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;
  return <TransactionFeedback
    kind={kind}
    message={message}
    onClose={() => setVisible(false)}
    actionLabel={actionLabel}
    onAction={actionHref ? () => window.location.assign(actionHref) : undefined}
  />;
}
