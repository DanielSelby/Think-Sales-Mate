import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "flex h-10 w-full appearance-none rounded-md border border-ledger-200 bg-white px-3 pr-8 text-sm text-ink-900 transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal disabled:opacity-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-white",
          className
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ledger-400" />
    </div>
  )
);
Select.displayName = "Select";