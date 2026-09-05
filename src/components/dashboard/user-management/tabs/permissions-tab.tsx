"use client";

import { useState } from "react";
import {
  KeyRound,
  Search,
  ChevronDown,
  ChevronUp,
  Shield,
  CheckCircle2,
  Lock,
  Layers,
  FileSpreadsheet,
  Printer,
  Sparkles
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { MODULE_CONFIGS, PERMISSION_ACTIONS } from "../constants";
import type { RoleDefinition, ModuleCategory, PermissionAction } from "../types";

interface PermissionsTabProps {
  roles: RoleDefinition[];
  canManage: boolean;
}

export function PermissionsTab({ roles, canManage }: PermissionsTabProps) {
  const [search, setSearch] = useState("");
  const [selectedRoleKey, setSelectedRoleKey] = useState<string>("owner");
  const [expandedCategories, setExpandedCategories] = useState<string[]>(
    MODULE_CONFIGS.map((m) => m.key)
  );

  const toggleCategory = (key: string) => {
    setExpandedCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const expandAll = () => setExpandedCategories(MODULE_CONFIGS.map((m) => m.key));
  const collapseAll = () => setExpandedCategories([]);

  const activeRole = roles.find((r) => r.key === selectedRoleKey || r.id === selectedRoleKey) || roles[0];

  const filteredModules = MODULE_CONFIGS.filter((m) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      m.name.toLowerCase().includes(q) ||
      m.description.toLowerCase().includes(q) ||
      m.supportedActions.some((a) => a.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-bold text-ink-900 dark:text-white">Permission Catalog & Governance</h2>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Granular action capabilities across all {MODULE_CONFIGS.length} registered business system modules
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Role selector to inspect effective permissions */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-ledger-400">Inspect Role:</span>
            <select
              value={selectedRoleKey}
              onChange={(e) => setSelectedRoleKey(e.target.value)}
              className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-bold text-blue-600 dark:border-ledger-700 dark:bg-slate-800 dark:text-blue-400"
            >
              {roles.map((r) => (
                <option key={r.key || r.id} value={r.key || r.id}>
                  {r.name} ({r.permissionCount} perms)
                </option>
              ))}
            </select>
          </div>

          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search permissions..."
              className="h-8 pl-8 text-xs"
            />
          </div>

          <button
            onClick={expandedCategories.length > 0 ? collapseAll : expandAll}
            className="text-xs text-blue-600 hover:underline font-semibold"
          >
            {expandedCategories.length > 0 ? "Collapse All" : "Expand All"}
          </button>
        </div>
      </div>

      {/* Permission Action Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {PERMISSION_ACTIONS.map((act) => (
          <div key={act.key} className="p-2.5 rounded-xl border border-ledger-100 bg-slate-50/50 dark:border-ledger-800 dark:bg-slate-800/40 text-xs">
            <p className="font-bold text-ink-900 dark:text-white capitalize">{act.label}</p>
            <p className="text-[10px] text-ledger-400 line-clamp-1">{act.description}</p>
          </div>
        ))}
      </div>

      {/* Registered module/page permission categories */}
      <div className="space-y-3">
        {filteredModules.map((mod) => {
          const isExpanded = expandedCategories.includes(mod.key);
          const grantedActions = activeRole?.permissions[mod.key] || [];

          return (
            <div
              key={mod.key}
              className="overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 transition-all"
            >
              {/* Category Header */}
              <div
                onClick={() => toggleCategory(mod.key)}
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 select-none"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 font-bold">
                    <KeyRound className="h-4 w-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-ink-900 dark:text-white">{mod.name}</h3>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {mod.supportedActions.length} Actions Available
                      </span>
                    </div>
                    <p className="text-xs text-ledger-400">{mod.description}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {grantedActions.length} / {mod.supportedActions.length} enabled for {activeRole?.name}
                  </span>
                  {isExpanded ? <ChevronUp className="h-4 w-4 text-ledger-400" /> : <ChevronDown className="h-4 w-4 text-ledger-400" />}
                </div>
              </div>

              {/* Expanded Action Capabilities Grid */}
              {isExpanded && (
                <div className="p-4 pt-0 border-t border-ledger-100 dark:border-ledger-800 bg-slate-50/30 dark:bg-slate-800/20">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 pt-3">
                    {mod.supportedActions.map((action) => {
                      const isGranted = grantedActions.includes(action);
                      const actInfo = PERMISSION_ACTIONS.find((a) => a.key === action);

                      return (
                        <div
                          key={action}
                          className={`flex items-start justify-between p-3 rounded-xl border text-xs transition-all ${
                            isGranted
                              ? "bg-white border-blue-200 shadow-sm dark:bg-slate-900 dark:border-blue-800/70"
                              : "bg-slate-100/60 border-ledger-100 opacity-60 dark:bg-slate-800/40 dark:border-ledger-800"
                          }`}
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-bold capitalize text-ink-900 dark:text-white">{action}</span>
                              {isGranted && (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                              )}
                            </div>
                            <p className="text-[10px] text-ledger-400">{actInfo?.description || `${action} action in ${mod.name}`}</p>
                          </div>

                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isGranted
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400"
                            }`}
                          >
                            {isGranted ? "Granted" : "Restricted"}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

    </div>
  );
}
