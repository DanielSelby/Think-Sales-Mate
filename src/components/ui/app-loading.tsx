import { cn } from "@/lib/utils";

export function AppLoading({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading"
      className={cn(
        "pointer-events-none fixed inset-0 z-[9999] flex items-center justify-center bg-[#f8f6f0]/80 backdrop-blur-[2px]",
        className
      )}
    >
      <div className="flex w-64 flex-col items-center text-center">
        <div className="relative flex h-28 w-28 items-center justify-center">
          <span className="absolute inset-0 rounded-full border-2 border-[#153b63]/10" />
          <span className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-[#153b63] border-r-[#77b82a]" />
          <div className="flex h-16 w-16 items-center justify-center rounded-full border border-[#153b63]/20 bg-white p-2 shadow-md">
            <img src="/thinksales-logo.svg" alt="" className="h-full w-full object-contain" />
          </div>
        </div>
        <p className="mt-3 text-2xl font-extrabold tracking-tight text-[#153b63]">Think<span className="text-[#77b82a]">Sales</span> <span className="text-[#153b63]">Pro</span></p>
        <p className="mt-1 text-xs tracking-wide text-[#6b7280]">Preparing your workspace</p>
        <div className="mt-6 h-1.5 w-64 overflow-hidden rounded-full bg-[#153b63]/10">
          <div className="h-full w-2/5 animate-pulse rounded-full bg-gradient-to-r from-[#153b63] to-[#77b82a]" />
        </div>
        <div className="mt-2 flex w-64 items-center justify-between text-[11px] text-[#6b7280]">
          <span>Loading...</span>
          <span className="font-semibold text-[#77b82a]">Please wait</span>
        </div>
        <div className="mt-5 flex gap-1.5">
          {[0, 1, 2].map((dot) => <span key={dot} className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#77b82a]" style={{ animationDelay: `${dot * 140}ms` }} />)}
        </div>
      </div>
      <span className="sr-only">Loading ThinkSales</span>
    </div>
  );
}
