"use client";

import { useState } from "react";
import {
  ShieldCheck,
  Download,
  Printer,
  Save,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Building2,
  DollarSign,
  Truck,
  ShoppingBag,
  Layers,
  Inbox,
  Lock,
  Plus
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { INITIAL_APPROVAL_RULES } from "../constants";
import type { ApprovalRule, RoleDefinition } from "../types";

interface ApprovalMatrixTabProps {
  roles: RoleDefinition[];
  canManage: boolean;
}

export function ApprovalMatrixTab({ roles, canManage }: ApprovalMatrixTabProps) {
  const [rules, setRules] = useState<ApprovalRule[]>(INITIAL_APPROVAL_RULES);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>("all");
  const [selectedModuleFilter, setSelectedModuleFilter] = useState<string>("all");
  const [hasChanges, setHasChanges] = useState(false);
  const [savedToast, setSavedToast] = useState(false);

  const handleToggleCanApprove = (ruleId: string) => {
    if (!canManage) return;
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, canApprove: !r.canApprove } : r))
    );
    setHasChanges(true);
  };

  const handleLimitChange = (ruleId: string, value: string) => {
    if (!canManage) return;
    const num = value === "" ? 0 : Number(value);
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, approvalLimitGHS: isNaN(num) ? "unlimited" : num } : r
      )
    );
    setHasChanges(true);
  };

  const handleToggleHigherApproval = (ruleId: string) => {
    if (!canManage) return;
    setRules((prev) =>
      prev.map((r) =>
        r.id === ruleId ? { ...r, requiresHigherApproval: !r.requiresHigherApproval } : r
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
    const headers = ["Role", "Module", "Can Approve", "Approval Limit (GHS)", "Requires Higher Approval", "Higher Approver", "Notes"];
    const rows = filteredRules.map((r) => [
      `"${r.roleName}"`,
      `"${r.moduleName}"`,
      r.canApprove ? "YES" : "NO",
      r.approvalLimitGHS === "unlimited" ? "Unlimited" : `GHS ${r.approvalLimitGHS}`,
      r.requiresHigherApproval ? "YES" : "NO",
      `"${r.higherApproverRole || "N/A"}"`,
      `"${r.notes || ""}"`
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `thinksales_approval_matrix_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  const filteredRules = rules.filter((r) => {
    if (selectedRoleFilter !== "all" && r.roleKey !== selectedRoleFilter) return false;
    if (selectedModuleFilter !== "all" && r.moduleKey !== selectedModuleFilter) return false;
    return true;
  });

  const getModuleIcon = (key: string) => {
    switch (key) {
      case "purchases":
        return <ShoppingBag className="h-4 w-4 text-blue-600" />;
      case "expenses":
        return <DollarSign className="h-4 w-4 text-emerald-600" />;
      case "stock_transfers":
        return <Truck className="h-4 w-4 text-indigo-600" />;
      case "stock_adjustments":
        return <Layers className="h-4 w-4 text-cyan-600" />;
      case "price_changes":
        return <Lock className="h-4 w-4 text-purple-600" />;
      case "customer_orders":
        return <Inbox className="h-4 w-4 text-amber-600" />;
      default:
        return <ShieldCheck className="h-4 w-4 text-slate-500" />;
    }
  };

  return (
    <div className="space-y-4">
      
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-ink-900 dark:text-white">Approval Authority Matrix</h2>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Define transaction approval thresholds, spending limits (GHS), and hierarchy sign-off requirements by role
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role Filter */}
          <select
            value={selectedRoleFilter}
            onChange={(e) => setSelectedRoleFilter(e.target.value)}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All System Roles</option>
            {roles.map((r) => (
              <option key={r.key} value={r.key}>{r.name}</option>
            ))}
          </select>

          {/* Module Filter */}
          <select
            value={selectedModuleFilter}
            onChange={(e) => setSelectedModuleFilter(e.target.value)}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Approval Modules</option>
            <option value="purchases">Purchases</option>
            <option value="expenses">Operating Expenses</option>
            <option value="stock_transfers">Stock Transfers</option>
            <option value="stock_adjustments">Stock Adjustments</option>
            <option value="price_changes">Price Changes</option>
            <option value="customer_orders">Customer Orders</option>
          </select>

          <Button size="sm" variant="outline" onClick={handleExportCsv} className="h-8 text-xs">
            <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
          </Button>

          <Button size="sm" variant="outline" onClick={handlePrint} className="h-8 text-xs">
            <Printer className="h-3.5 w-3.5 mr-1" /> Print
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
              <Save className="h-3.5 w-3.5 mr-1" /> {savedToast ? "Saved!" : "Save Approvals"}
            </Button>
          )}
        </div>
      </div>

      {/* Approval Matrix Data Table */}
      <div className="rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-ledger-100 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-ledger-400 dark:border-ledger-800 dark:bg-slate-800/60">
              <tr>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Module</th>
                <th className="px-3 py-3 text-center">Can Approve</th>
                <th className="px-4 py-3">Approval Limit (GHS)</th>
                <th className="px-3 py-3 text-center">Requires Higher Sign-Off</th>
                <th className="px-4 py-3">Policy Notes</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {filteredRules.map((rule) => (
                <tr key={rule.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                  
                  {/* Role */}
                  <td className="px-4 py-3 font-bold text-ink-900 dark:text-white whitespace-nowrap">
                    {rule.roleName}
                  </td>

                  {/* Module with Icon */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {getModuleIcon(rule.moduleKey)}
                      <span className="font-semibold text-ink-900 dark:text-white">{rule.moduleName}</span>
                    </div>
                  </td>

                  {/* Can Approve Toggle */}
                  <td className="px-3 py-3 text-center">
                    <button
                      type="button"
                      disabled={!canManage}
                      onClick={() => handleToggleCanApprove(rule.id)}
                      className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold transition-all ${
                        rule.canApprove
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}
                    >
                      {rule.canApprove ? "Authorized" : "Disabled"}
                    </button>
                  </td>

                  {/* Approval Limit */}
                  <td className="px-4 py-3">
                    {rule.canApprove ? (
                      rule.approvalLimitGHS === "unlimited" ? (
                        <span className="font-bold text-purple-600 dark:text-purple-400 font-mono">
                          Unlimited (No Ceiling)
                        </span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <span className="text-ledger-400 font-mono">GHS</span>
                          <Input
                            type="number"
                            disabled={!canManage}
                            value={rule.approvalLimitGHS}
                            onChange={(e) => handleLimitChange(rule.id, e.target.value)}
                            className="h-8 w-32 text-xs font-mono font-bold"
                          />
                        </div>
                      )
                    ) : (
                      <span className="text-ledger-400">—</span>
                    )}
                  </td>

                  {/* Requires Higher Approval */}
                  <td className="px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      disabled={!canManage || !rule.canApprove || rule.approvalLimitGHS === "unlimited"}
                      checked={rule.requiresHigherApproval}
                      onChange={() => handleToggleHigherApproval(rule.id)}
                      className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500 cursor-pointer disabled:opacity-30"
                    />
                  </td>

                  {/* Policy Notes */}
                  <td className="px-4 py-3 text-ledger-500 dark:text-ledger-400 text-xs">
                    {rule.notes || "Standard policy"}
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
