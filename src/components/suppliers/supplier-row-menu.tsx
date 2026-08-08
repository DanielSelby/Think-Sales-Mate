"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, History, MoreVertical, Ban, CheckCircle2, ShieldAlert, Loader2 } from "lucide-react";
import { updateSupplierStatus } from "@/app/(dashboard)/purchases/suppliers/actions";
import type { SupplierStatus } from "@/types/database";

interface SupplierRowMenuProps {
  supplierId: string;
  supplierName: string;
  status: SupplierStatus;
  onNotice: (message: string, tone?: "success" | "error") => void;
}

export function SupplierRowMenu({ supplierId, supplierName, status, onNotice }: SupplierRowMenuProps) {
  const router = useRouter();
  const menuRef = React.useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [isPending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  function changeStatus(next: SupplierStatus, label: string) {
    setMenuOpen(false);
    startTransition(async () => {
      const result = await updateSupplierStatus(supplierId, next);
      if (!result.ok) {
        onNotice(result.error ?? "Something went wrong.", "error");
        return;
      }
      onNotice(`${supplierName} ${label}`);
      router.refresh();
    });
  }

  return (
    <div className="flex items-center justify-end gap-1 text-ledger-400">
      <Link href={`/purchases/suppliers/${supplierId}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="View">
        <Eye className="h-4 w-4" />
      </Link>
      <Link href={`/purchases/suppliers/${supplierId}/edit`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Edit">
        <Pencil className="h-4 w-4" />
      </Link>
      <Link href={`/purchases?supplier=${encodeURIComponent(supplierName)}`} className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white" title="Purchase History">
        <History className="h-4 w-4" />
      </Link>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="rounded-md p-1.5 hover:bg-ledger-100 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
          title="More"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreVertical className="h-4 w-4" />}
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 top-8 z-40 w-44 overflow-hidden rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900"
          >
            {status !== "active" && (
              <button onClick={() => changeStatus("active", "activated")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                <CheckCircle2 className="h-4 w-4 text-signal" /> Activate
              </button>
            )}
            {status !== "inactive" && (
              <button onClick={() => changeStatus("inactive", "deactivated")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink-900 hover:bg-ledger-50 dark:text-white dark:hover:bg-white/[0.06]">
                <Ban className="h-4 w-4 text-ledger-400" /> Deactivate
              </button>
            )}
            {status !== "blacklisted" && (
              <button onClick={() => changeStatus("blacklisted", "blacklisted")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-alert hover:bg-alert-soft">
                <ShieldAlert className="h-4 w-4" /> Blacklist
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}