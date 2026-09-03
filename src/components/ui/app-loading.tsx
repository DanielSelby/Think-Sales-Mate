import { cn } from "@/lib/utils";
import Image from "next/image";

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
        <Image src="/thinksales-logo.svg" alt="ThinkSales" width={60} height={60} className="relative h-14 w-14 rounded-2xl object-cover shadow-lg" priority />
      </div>
      <span className="sr-only">Loading ThinkSales</span>
    </div>
  );
}
