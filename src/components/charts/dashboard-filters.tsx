"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Select } from "@/components/ui/select";

export interface FilterOption {
  id: string;
  name: string;
}

export function DashboardFilters({
  branches,
  categories
}: {
  branches: FilterOption[];
  categories: FilterOption[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") {
      params.delete(key);
    } else {
      params.set(key, value);
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <>
      <Select
        aria-label="Filter by branch"
        className="w-auto min-w-[9rem]"
        value={searchParams.get("branch") ?? "all"}
        onChange={(e) => updateParam("branch", e.target.value)}
      >
        <option value="all">All branches</option>
        {branches.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
      </Select>

      <Select
        aria-label="Filter by product category"
        className="w-auto min-w-[10rem]"
        value={searchParams.get("category") ?? "all"}
        onChange={(e) => updateParam("category", e.target.value)}
      >
        <option value="all">All categories</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    </>
  );
}