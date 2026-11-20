"use client";

import { useEffect, useState } from "react";
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

  useEffect(() => {
    const url = new URL(window.location.href);
    ["created", "updated", "deleted", "reviewed", "paid", "error", "notice_id"].forEach((key) => url.searchParams.delete(key));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  if (!visible) return null;
  return <TransactionFeedback
    kind={kind}
    message={message}
    onClose={() => setVisible(false)}
    actionLabel={actionLabel}
    onAction={actionHref ? () => window.location.assign(actionHref) : undefined}
  />;
}
