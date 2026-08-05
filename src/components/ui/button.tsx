import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2",
  {
    variants: {
      variant: {
        primary: "bg-ink-900 text-white shadow-sm hover:bg-ink-950 dark:bg-white dark:text-ink-900 dark:hover:bg-ledger-100",
        secondary: "bg-ledger-100 text-ink-900 hover:bg-ledger-200 dark:bg-white/[0.06] dark:text-ledger-100 dark:hover:bg-white/[0.1]",
        outline: "border border-ledger-200 bg-transparent hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]",
        ghost: "hover:bg-ledger-100 dark:hover:bg-white/[0.06]",
        destructive: "bg-alert text-white hover:bg-alert/90"
      },
      size: {
        sm: "h-8 px-3",
        md: "h-9 px-4",
        lg: "h-11 px-6 text-base"
      }
    },
    defaultVariants: { variant: "primary", size: "md" }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />
  )
);
Button.displayName = "Button";
