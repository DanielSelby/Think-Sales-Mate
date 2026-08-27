"use client";

import { useAppStore, THEMES } from "@/store/useAppStore";

function SkeletonBox({ className }: { className?: string }) {
  return <div className={`rounded-xl animate-pulse ${className ?? ""}`} style={{ background: "rgba(0,0,0,0.06)" }} />;
}

export default function Loading() {
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];

  return (
   <div className="space-y-7 p-6">

      {/* Header skeleton */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <SkeletonBox className="h-3 w-32" />
          <SkeletonBox className="h-7 w-48" />
          <SkeletonBox className="h-3 w-40" />
        </div>
        <div className="flex gap-2">
          <SkeletonBox className="h-9 w-28" />
          <SkeletonBox className="h-9 w-32" />
        </div>
      </div>

      {/* KPI cards skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="relative overflow-hidden rounded-2xl p-5 border border-slate-100"
            style={{ background: "#fff", height: 152, boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            {/* Colored top border pulse */}
            <div className="absolute top-0 left-0 right-0 h-[3px] animate-pulse rounded-t-2xl"
              style={{ background: theme.colors.primary + "40" }} />
            <div className="flex items-start justify-between mb-3 mt-1">
              <SkeletonBox className="h-2.5 w-20" />
              <SkeletonBox className="h-7 w-7 rounded-lg" />
            </div>
            <SkeletonBox className="h-7 w-32 mt-2" />
            <SkeletonBox className="h-2.5 w-24 mt-3" />
            <SkeletonBox className="h-2 w-16 mt-2" />
          </div>
        ))}
      </div>

      {/* Charts row skeleton */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 p-5"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center justify-between mb-4">
            <div className="space-y-2">
              <SkeletonBox className="h-2.5 w-32" />
              <SkeletonBox className="h-4 w-48" />
            </div>
            <SkeletonBox className="h-4 w-20" />
          </div>
          {/* Toggle buttons skeleton */}
          <div className="flex gap-2 mb-4">
            <SkeletonBox className="h-7 w-20 rounded-xl" />
            <SkeletonBox className="h-7 w-20 rounded-xl" />
            <SkeletonBox className="h-7 w-20 rounded-xl" />
          </div>
          {/* Chart area */}
          <div className="relative h-48 rounded-xl overflow-hidden" style={{ background: "#f8fafc" }}>
            {/* Fake chart bars */}
            <div className="absolute bottom-0 left-0 right-0 flex items-end gap-1.5 px-4 pb-4">
              {[40, 65, 45, 80, 55, 70, 35, 90, 60, 75, 50, 85, 45, 70, 55, 60, 40, 75].map((h, i) => (
                <div key={i} className="flex-1 rounded-t animate-pulse"
                  style={{ height: `${h}%`, background: theme.colors.primary + "20", animationDelay: `${i * 50}ms` }} />
              ))}
            </div>
          </div>
        </div>

        {/* AI Insights skeleton */}
        <div className="bg-white rounded-2xl border border-slate-100 p-5"
          style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
          <div className="flex items-center gap-3 mb-4">
            <SkeletonBox className="h-9 w-9 rounded-xl" />
            <div className="space-y-1.5">
              <SkeletonBox className="h-2.5 w-20" />
              <SkeletonBox className="h-4 w-32" />
            </div>
          </div>
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#f8fafc" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBox key={i} className={`h-2.5 ${i === 4 ? "w-1/2" : "w-full"}`} />
            ))}
          </div>
          <SkeletonBox className="h-3 w-28 mt-3" />
        </div>
      </div>

      {/* Bottom row skeleton */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, col) => (
          <div key={col} className="bg-white rounded-2xl border border-slate-100 p-5"
            style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}>
            <div className="flex items-center gap-3 mb-4">
              <SkeletonBox className="h-9 w-9 rounded-xl" />
              <div className="space-y-1.5">
                <SkeletonBox className="h-2.5 w-16" />
                <SkeletonBox className="h-4 w-28" />
              </div>
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl" style={{ background: "#f8fafc" }}>
                  <div className="flex items-center gap-3">
                    <SkeletonBox className="h-8 w-8 rounded-xl" />
                    <div className="space-y-1">
                      <SkeletonBox className="h-2.5 w-24" />
                      <SkeletonBox className="h-2 w-16" />
                    </div>
                  </div>
                  <SkeletonBox className="h-3 w-14" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}