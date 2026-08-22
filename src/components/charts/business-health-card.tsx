"use client";

import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import type { FinancialSummary } from "@/lib/accounting/metrics";
import { cn } from "@/lib/utils";

interface HealthSignal {
  ok: boolean | "warn";
  text: string;
}

function computeHealth(summary: FinancialSummary): { score: number; label: string; signals: HealthSignal[] } {
  let score = 50;
  const signals: HealthSignal[] = [];

  const margin = summary.revenue30d > 0 ? summary.netProfit30d / summary.revenue30d : 0;
  if (margin > 0.1) {
    score += 20;
    signals.push({ ok: true, text: `Profit margin is healthy at ${(margin * 100).toFixed(0)}%` });
  } else if (margin > 0) {
    score += 8;
    signals.push({ ok: "warn", text: `Profit margin is thin at ${(margin * 100).toFixed(0)}%` });
  } else {
    score -= 15;
    signals.push({ ok: false, text: "Expenses exceeded revenue this period" });
  }

  if (summary.trends.revenue.direction === "up") {
    score += 15;
    signals.push({ ok: true, text: `Sales are up ${summary.trends.revenue.pct?.toFixed(1)}% vs. the prior period` });
  } else if (summary.trends.revenue.direction === "down") {
    score -= 10;
    signals.push({ ok: "warn", text: `Sales are down ${Math.abs(summary.trends.revenue.pct ?? 0).toFixed(1)}% vs. the prior period` });
  }

  if (summary.cashFlow30d >= 0) {
    score += 15;
    signals.push({ ok: true, text: "Cash flow is positive this period" });
  } else {
    score -= 15;
    signals.push({ ok: false, text: "Cash flow is negative this period" });
  }

  const stockRatio = summary.totalActiveProducts > 0 ? summary.lowStockCount / summary.totalActiveProducts : 0;
  if (summary.outOfStockCount > 0) {
    score -= 10;
    signals.push({ ok: false, text: `${summary.outOfStockCount} product${summary.outOfStockCount === 1 ? "" : "s"} out of stock` });
  } else if (stockRatio > 0.2) {
    score -= 5;
    signals.push({ ok: "warn", text: `${summary.lowStockCount} items running low on stock` });
  } else if (summary.lowStockCount > 0) {
    signals.push({ ok: "warn", text: `${summary.lowStockCount} item${summary.lowStockCount === 1 ? "" : "s"} running low on stock` });
  } else if (summary.totalActiveProducts > 0) {
    score += 5;
    signals.push({ ok: true, text: "Inventory is well stocked" });
  }

  if (summary.outstandingInvoicesCount > 0) {
    signals.push({
      ok: "warn",
      text: `${summary.outstandingInvoicesCount} unpaid invoice${summary.outstandingInvoicesCount === 1 ? "" : "s"} outstanding`
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const label = score >= 75 ? "Good" : score >= 50 ? "Fair" : "Needs attention";

  return { score, label, signals: signals.slice(0, 5) };
}

export function BusinessHealthCard({ summary }: { summary: FinancialSummary }) {
  const { score, label, signals } = computeHealth(summary);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - score / 100);
  const color = score >= 75 ? "#1d8f5e" : score >= 50 ? "#a8781f" : "#b8402f";

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative h-28 w-28">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="8" className="text-ledger-100 dark:text-ledger-700" />
          <circle
            cx="50"
            cy="50"
            r="40"
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 600ms ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="figure text-2xl font-semibold tracking-tight tabular-nums text-ink-900 dark:text-white">{score}</span>
          <span className="figure text-[10px] font-medium text-ledger-400">{label}</span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {signals.map((signal, i) => (
          <li key={i} className="flex items-start gap-2 text-xs font-medium">
            {signal.ok === true && <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal" />}
            {signal.ok === "warn" && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />}
            {signal.ok === false && <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-alert" />}
            <span
              className={cn(
                "leading-snug",
                signal.ok === true && "text-ledger-600 dark:text-ledger-300",
                signal.ok === "warn" && "text-ledger-600 dark:text-ledger-300",
                signal.ok === false && "text-ledger-600 dark:text-ledger-300"
              )}
            >
              {signal.text}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}