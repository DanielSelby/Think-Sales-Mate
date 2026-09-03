import { cn } from "@/lib/utils";

export function AppLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "fixed inset-0 z-[100] flex items-center justify-center bg-black/25 backdrop-blur-[1px]",
        className
      )}
    >
      <div className="relative flex h-24 w-24 items-center justify-center">
        <span className="absolute inset-0 rounded-full border-4 border-current/10" />
        <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-current border-r-current text-signal" />
        <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-signal text-xl font-extrabold tracking-tight text-white shadow-lg">
          TS
        </div>
      </div>
      <span className="sr-only">Loading ThinkSales</span>
    </div>
  );
}
