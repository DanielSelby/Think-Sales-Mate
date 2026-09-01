"use client";

import { useState } from "react";
import {
  FileSpreadsheet,
  Download,
  Save,
  Check,
  Shield,
  Layers,
  RotateCcw,
  Sparkles,
  Search,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODULE_CONFIGS, PERMISSION_ACTIONS } from "../constants";
import type { RoleDefinition, ModuleCategory, PermissionAction } from "../types";

interface AccessMatrixTabProps {
  roles: RoleDefinition[];
  canManage: boolean;
  onUpdateRolePermissions: (roleId: string, permissions: Record<ModuleCategory, PermissionAction[]>) => void;
}

export function AccessMatrixTab({
  roles,
  canManage,
  onUpdateRolePermissions
}: AccessMatrixTabProps) {
  const [activeRoleKey, setActiveRoleKey] = useState<string>(roles[0]?.key || "administrator");
  const [matrixData, setMatrixData] = useState<Record<string, Record<ModuleCategory, PermissionAction[]>>>(() => {
    const initial: Record<string, Record<ModuleCategory, PermissionAction[]>> = {};
    roles.forEach((r) => {
      initial[r.key] = JSON.parse(JSON.stringify(r.permissions));
    });
    return initial;
  });

  const [search, setSearch] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [saveToast, setSaveToast] = useState(false);

  const activeRole = roles.find((r) => r.key === activeRoleKey || r.id === activeRoleKey) || roles[0];
  const activePermissions = matrixData[activeRoleKey] || activeRole?.permissions || ({} as any);

  const handleToggle = (moduleKey: ModuleCategory, action: PermissionAction) => {
    if (!canManage) return;

    setMatrixData((prev) => {
      const rolePerms = prev[activeRoleKey] || {};
      const currentActions = rolePerms[moduleKey] || [];
      const exists = currentActions.includes(action);
      const nextActions = exists
        ? currentActions.filter((a) => a !== action)
        : [...currentActions, action];

      return {
        ...prev,
        [activeRoleKey]: {
          ...rolePerms,
          [moduleKey]: nextActions
        }
      };
    });
    setHasChanges(true);
  };

  const handleGrantRow = (moduleKey: ModuleCategory) => {
    if (!canManage) return;
    const config = MODULE_CONFIGS.find((m) => m.key === moduleKey);
    if (!config) return;

    setMatrixData((prev) => {
      const rolePerms = prev[activeRoleKey] || {};
      return {
        ...prev,
        [activeRoleKey]: {
          ...rolePerms,
          [moduleKey]: [...config.supportedActions]
        }
      };
    });
    setHasChanges(true);
  };

  const handleRevokeRow = (moduleKey: ModuleCategory) => {
    if (!canManage) return;
    setMatrixData((prev) => {
      const rolePerms = prev[activeRoleKey] || {};
      return {
        ...prev,
        [activeRoleKey]: {
          ...rolePerms,
          [moduleKey]: []
        }
      };
    });
    setHasChanges(true);
  };

  const handleSaveMatrix = () => {
    if (activeRole) {
      onUpdateRolePermissions(activeRole.id, matrixData[activeRoleKey]);
      setHasChanges(false);
      setSaveToast(true);
      setTimeout(() => setSaveToast(false), 2000);
    }
  };

  const handleExportCsv = () => {
    const headers = ["Module", ...PERMISSION_ACTIONS.map((a) => a.label)];
    const rows = MODULE_CONFIGS.map((m) => {
      const current = activePermissions[m.key] || [];
      const flags = PERMISSION_ACTIONS.map((a) => {
        if (!m.supportedActions.includes(a.key)) return "N/A";
        return current.includes(a.key) ? "YES" : "NO";
      });
      return [m.name, ...flags].join(",");
    });

    const csvContent = [`Role: ${activeRole.name}`, headers.join(","), ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `access_matrix_${activeRole.key}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredModules = MODULE_CONFIGS.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      
      {/* Matrix Controls Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-bold text-ink-900 dark:text-white">Excel-Style Access Matrix</h2>
          </div>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            High-density security grid to review and configure role permissions across all business modules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Role selector */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ledger-400">Role:</span>
            <select
              value={activeRoleKey}
              onChange={(e) => setActiveRoleKey(e.target.value)}
              className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-bold text-blue-600 dark:border-ledger-700 dark:bg-slate-800 dark:text-blue-400"
            >
              {roles.map((r) => (
                <option key={r.key || r.id} value={r.key || r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-40">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter module..."
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
              onClick={handleSaveMatrix}
              className={`h-8 text-xs font-bold ${
                hasChanges
                  ? "bg-blue-600 hover:bg-blue-700 text-white shadow-sm animate-pulse"
                  : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              <Save className="h-3.5 w-3.5 mr-1" /> {saveToast ? "Saved!" : "Save Matrix"}
            </Button>
          )}
        </div>
      </div>

      {/* Dense Excel Matrix Table */}
      <div className="relative rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto max-h-[68vh]">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 z-20 bg-slate-100 text-ink-900 dark:bg-slate-800 dark:text-white border-b border-ledger-200 dark:border-ledger-700 shadow-sm">
              <tr>
                <th className="p-3 font-bold border-r border-ledger-200 dark:border-ledger-700 min-w-[220px]">
                  Module / Domain
                </th>
                {PERMISSION_ACTIONS.map((action) => (
                  <th
                    key={action.key}
                    className="p-3 font-bold text-center border-r border-ledger-200 dark:border-ledger-700 min-w-[100px]"
                  >
                    <span className="capitalize">{action.label}</span>
                  </th>
                ))}
                {canManage && (
                  <th className="p-3 font-bold text-center min-w-[120px]">Quick Row Actions</th>
                )}
              </tr>
            </thead>

            <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
              {filteredModules.map((mod, rowIdx) => {
                const currentActions = activePermissions[mod.key] || [];

                return (
                  <tr
                    key={mod.key}
                    className={`transition-colors hover:bg-blue-50/30 dark:hover:bg-slate-800/40 ${
                      rowIdx % 2 === 0 ? "bg-white dark:bg-slate-900" : "bg-slate-50/40 dark:bg-slate-850"
                    }`}
                  >
                    {/* Module Title */}
                    <td className="p-3 font-bold text-ink-900 dark:text-white border-r border-ledger-100 dark:border-ledger-800">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{mod.name}</span>
                        <span className="text-[10px] text-ledger-400 font-normal truncate">
                          ({mod.description})
                        </span>
                      </div>
                    </td>

                    {/* 7 Checkboxes */}
                    {PERMISSION_ACTIONS.map((action) => {
                      const isSupported = mod.supportedActions.includes(action.key);
                      const isChecked = currentActions.includes(action.key);

                      if (!isSupported) {
                        return (
                          <td
                            key={action.key}
                            className="p-3 text-center border-r border-ledger-100 dark:border-ledger-800 bg-slate-50/30 dark:bg-slate-800/20 text-slate-300 dark:text-slate-600 select-none"
                          >
                            —
                          </td>
                        );
                      }

                      return (
                        <td
                          key={action.key}
                          onClick={() => handleToggle(mod.key, action.key)}
                          className={`p-3 text-center border-r border-ledger-100 dark:border-ledger-800 cursor-pointer select-none transition-colors ${
                            isChecked ? "bg-blue-50/30 dark:bg-blue-950/20" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => handleToggle(mod.key, action.key)}
                            disabled={!canManage}
                            className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                        </td>
                      );
                    })}

                    {/* Quick Row Grant/Revoke */}
                    {canManage && (
                      <td className="p-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleGrantRow(mod.key)}
                            className="text-[10px] font-bold text-blue-600 hover:underline px-1.5 py-0.5 rounded hover:bg-blue-50 dark:hover:bg-blue-950/40"
                          >
                            All
                          </button>
                          <span className="text-ledger-300">|</span>
                          <button
                            type="button"
                            onClick={() => handleRevokeRow(mod.key)}
                            className="text-[10px] font-bold text-red-500 hover:underline px-1.5 py-0.5 rounded hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            None
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
