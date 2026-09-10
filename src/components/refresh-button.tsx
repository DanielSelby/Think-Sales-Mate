"use client";

import { RefreshCw } from "lucide-react";

export function RefreshButton({ className = "" }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      aria-label="Refresh page"
      title="Refresh page"
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl transition-colors hover:bg-black/10 ${className}`}
    >
      <RefreshCw className="h-4 w-4" />
    </button>
  );
}
