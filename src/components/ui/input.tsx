import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ledger-400 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
