import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
  {
    variants: {
      tone: {
        neutral: "bg-ledger-100 text-ledger-600 dark:bg-white/[0.06] dark:text-ledger-300",
        signal: "bg-signal-soft text-signal dark:bg-signal/15 dark:text-signal",
        alert: "bg-alert-soft text-alert dark:bg-alert/15 dark:text-alert",
        amber: "bg-amber-soft text-amber dark:bg-amber/15 dark:text-amber",
      },
    },
    defaultVariants: { tone: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}