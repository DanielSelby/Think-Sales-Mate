"use client";

import { useState } from "react";
import {
  Building2,
  CheckCircle2,
  Lock,
  Globe,
  Truck,
  Inbox,
  Save,
  Search,
  Plus,
  Shield,
  Download,
  Printer
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_BRANCH_ACCESS_RULES } from "../constants";
import type { BranchAccessRule, UserBranch } from "../types";

interface BranchAccessTabProps {
  branches: UserBranch[];
  canManage: boolean;
}

export function BranchAccessTab({ branches, canManage }: BranchAccessTabProps) {
  const [accessRules, setAccessRules] = useState<BranchAccessRule[]>(INITIAL_BRANCH_ACCESS_RULES);
  const [search, setSearch] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleToggleViewAll = (userId: string) => {
    if (!canManage) return;
    setAccessRules((prev) =>
      prev.map((r) => (r.userId === userId ? { ...r, viewAllBranches: !r.viewAllBranches } : r))
    );
    setHasChanges(true);
  };

  const handleToggleTransfer = (userId: string) => {
    if (!canManage) return;
    setAccessRules((prev) =>
      prev.map((r) =>
        r.userId === userId
          ? { ...r, canTransferBetweenBranches: !r.canTransferBetweenBranches }
          : r
      )
    );
    setHasChanges(true);
  };

  const handleToggleOrderApproval = (userId: string) => {
    if (!canManage) return;
    setAccessRules((prev) =>
      prev.map((r) =>
        r.userId === userId ? { ...r, canApproveBranchOrders: !r.canApproveBranchOrders } : r
      )
    );
    setHasChanges(true);
  };

  const handleSave = () => {
    setHasChanges(false);
    setSavedToast(true);
    setTimeout(() => setSavedToast(false), 2000);
  };

  const handleExportCsv = () => {
    const headers = ["User", "Email", "Role", "Primary Branch", "Secondary Branches", "View All Branches", "Can Transfer", "Can Approve Orders"];
    const rows = accessRules.map((r) => [
      `"${r.userName}"`,
      `"${r.userEmail}"`,
      `"${r.role}"`,
      `"${r.primaryBranchName}"`,
      `"${r.additionalBranchNames.join("; ")}"`,
      r.viewAllBranches ? "YES" : "NO",
      r.canTransferBetweenBranches ? "YES" : "NO",
      r.canApproveBranchOrders ? "YES" : "NO"
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_branch_access_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredRules = accessRules.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.userName.toLowerCase().includes(q) ||
      r.userEmail.toLowerCase().includes(q) ||
      r.role.toLowerCase().includes(q) ||
      r.primaryBranchName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-ink-900 dark:text-white">Branch Access Control & Security Matrix</h2>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Control which physical stores, warehouses, and regional branches each user is permitted to view, transfer stock to, and approve orders for
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-52">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search user or branch..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>

          {canManage && (
            <Button
              size="sm"
              disabled={!hasChanges}
              onClick={handleSave}
              className={`h-8 text-xs font-bold ${
                hasChanges
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm animate-pulse"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              <Save className="h-3.5 w-3.5 mr-1" /> {savedToast ? "Saved!" : "Save Branch Access"}
            </Button>
          )}
        </div>
      </div>

      {/* Branch Access Table */}
      <div className="rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ledger-400 dark:border-ledger-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">User</th>
                <th className="px-3 py-3">Role</th>
                <th className="px-4 py-3">Primary Branch</th>
                <th className="px-4 py-3">Additional Branch Access</th>
                <th className="px-3 py-3 text-center">View All Branches</th>
                <th className="px-3 py-3 text-center">Transfer Stock</th>
                <th className="px-3 py-3 text-center">Approve Branch Orders</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {filteredRules.map((rule) => (
                <tr key={rule.userId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  
                  {/* User */}
                  <td className="px-4 py-3">
                    <div>
                      <p className="font-bold text-ink-900 dark:text-white">{rule.userName}</p>
                      <p className="text-[11px] text-ledger-400">{rule.userEmail}</p>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="px-3 py-3 whitespace-nowrap font-medium text-slate-700 dark:text-slate-300">
                    {rule.role}
                  </td>

                  {/* Primary Branch */}
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 font-semibold text-blue-600 dark:text-blue-400">
                      <Building2 className="h-3.5 w-3.5" />
                      {rule.primaryBranchName}
                    </span>
                  </td>

                  {/* Additional Branch Access */}
                  <td className="px-4 py-3">
                    {rule.viewAllBranches ? (
                      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-950 dark:text-purple-300">
                        Global Access (All {branches.length} Branches)
                      </span>
                    ) : rule.additionalBranchNames.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {rule.additionalBranchNames.map((b) => (
                          <span key={b} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {b}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-ledger-400">Primary branch only</span>
                    )}
                  </td>

                  {/* View All Branches Toggle */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={rule.viewAllBranches}
                      onChange={() => handleToggleViewAll(rule.userId)}
                      className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  {/* Transfer Between Branches Toggle */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={rule.canTransferBetweenBranches}
                      onChange={() => handleToggleTransfer(rule.userId)}
                      className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                  {/* Approve Branch Orders Toggle */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManage}
                      checked={rule.canApproveBranchOrders}
                      onChange={() => handleToggleOrderApproval(rule.userId)}
                      className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                    />
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
