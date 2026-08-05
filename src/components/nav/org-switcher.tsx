"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface OrgOption {
  orgId: string;
  orgName: string;
  role: string;
}

export function OrgSwitcher({ activeOrgId, options }: { activeOrgId: string; options: OrgOption[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const active = options.find((o) => o.orgId === activeOrgId) ?? options[0];

  function selectOrg(orgId: string) {
    document.cookie = `active_org_id=${orgId}; path=/; max-age=${60 * 60 * 24 * 365}`;
    setOpen(false);
    router.refresh();
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-md border border-ledger-200 bg-white px-3 py-1.5 text-sm font-medium text-ledger-800 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ink-900 dark:text-ledger-100 dark:hover:bg-white/[0.06]"
      >
        <span className="max-w-[160px] truncate">{active?.orgName ?? "Select workspace"}</span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-ledger-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-56 rounded-md border border-ledger-100 bg-white py-1 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          {options.map((option) => (
            <button
              key={option.orgId}
              onClick={() => selectOrg(option.orgId)}
              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-ledger-50 dark:hover:bg-ledger-700"
            >
              <span>
                <span className="block text-ledger-900 dark:text-white">{option.orgName}</span>
                <span className="block text-xs capitalize text-ledger-400">{option.role}</span>
              </span>
              {option.orgId === active?.orgId && <Check className="h-4 w-4 text-signal" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
