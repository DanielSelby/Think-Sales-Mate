"use client";

import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";

export function CurrencyAmount({
  value,
  currency = "GHS",
  config,
  className,
}: {
  value: number | null | undefined;
  currency?: string;
  config?: Partial<CurrencyConfig>;
  className?: string;
}) {
  return (
    <span className={className}>
      {formatCurrencyAmount(Number(value ?? 0), { ...config, code: config?.code ?? currency })}
    </span>
  );
}
