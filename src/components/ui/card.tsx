import * as React from "react";
import { cn } from "@/lib/utils";

const ACCENT_CLASSES = {
  neutral: "border-l-ledger-300 dark:border-l-ledger-600",
  signal: "border-l-signal",
  alert: "border-l-alert",
  amber: "border-l-amber"
} as const;

export type CardAccent = keyof typeof ACCENT_CLASSES;

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * The signature "ledger line" — a colored left rule that reads the
   * card's financial meaning at a glance before you even read the number.
   * Use "neutral" for anything that isn't a positive/negative signal.
   */
  accent?: CardAccent;
}

export function Card({ className, accent = "neutral", ...props }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-card border border-l-4 border-ledger-100 bg-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900",
        ACCENT_CLASSES[accent],
        className
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-5 pb-3", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3
      className={cn(
        "font-body text-xs font-semibold uppercase tracking-wide text-ledger-400 dark:text-ledger-400",
        className
      )}
      {...props}
    />
  );
}

export function CardValue({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn("font-display text-[1.75rem] font-semibold leading-tight text-ink-900 dark:text-white", className)}
      {...props}
    />
  );
}

export function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-0", className)} {...props} />;
}
