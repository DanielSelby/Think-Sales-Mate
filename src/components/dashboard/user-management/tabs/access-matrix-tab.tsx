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
import { MODULE_CONFIGS, PERMISSION_ACTIONS, PERMISSION_PAGE_CONFIGS } from "../constants";
import type { RoleDefinition, ModuleCategory, PermissionAction } from "../types";

interface AccessMatrixTabProps {
  roles: RoleDefinition[];
  canManage: boolean;
  onUpdateRolePermissions: (roleId: string, permissions: Record<ModuleCategory, PermissionAction[]>) => void;
  mode?: "all" | "tabs" | "actions";
}

export function AccessMatrixTab({
  roles,
  canManage,
  onUpdateRolePermissions,
  mode = "all"
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
  const [activeTabModule, setActiveTabModule] = useState(Object.keys(PERMISSION_PAGE_CONFIGS)[0] ?? "sales");
  const [moduleSearch, setModuleSearch] = useState("");
  const [showExcelMatrix, setShowExcelMatrix] = useState(false);
  const [activeActionTab, setActiveActionTab] = useState("");

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

  const tabKey = (module: string, page: string, tab: string) => `${module}.${page}.${tab}`;
  const handleToggleTab = (module: string, page: string, tab: string, action: PermissionAction) => {
    if (!canManage) return;
    const key = tabKey(module, page, tab);
    setMatrixData((prev) => {
      const rolePerms = prev[activeRoleKey] || {};
      const current = rolePerms[key] || [];
      const next = current.includes(action)
        ? current.filter((item) => item !== action)
        : [...current, action];
      return { ...prev, [activeRoleKey]: { ...rolePerms, [key]: next } };
    });
    setHasChanges(true);
  };

  const getModulePages = (moduleKey: string) => {
    const configured = PERMISSION_PAGE_CONFIGS[moduleKey];
    if (configured?.length) return configured;
    const module = MODULE_CONFIGS.find((item) => item.key === moduleKey);
    return [{
      key: moduleKey,
      name: module?.name ?? moduleKey,
      tabs: [{ key: "overview", name: "Overview", supportedActions: module?.supportedActions ?? PERMISSION_ACTIONS.map((item) => item.key) }]
    }];
  };

  const handleResetModule = () => {
    if (!canManage) return;
    const modulePages = getModulePages(activeTabModule);
    setMatrixData((prev) => {
      const rolePerms = { ...(prev[activeRoleKey] || {}) };
      Object.keys(rolePerms)
        .filter((key) => key.startsWith(`${activeTabModule}.`))
        .forEach((key) => delete rolePerms[key]);
      modulePages.forEach((page) => page.tabs.forEach((tab) => {
        rolePerms[tabKey(activeTabModule, page.key, tab.key)] = [...(tab.supportedActions ?? [])];
      }));
      return { ...prev, [activeRoleKey]: rolePerms };
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
  const registeredModuleKeys = new Set(Object.keys(PERMISSION_PAGE_CONFIGS));
  const actionModules = MODULE_CONFIGS.filter((module) => {
    const query = moduleSearch.trim().toLowerCase();
    return !query || module.name.toLowerCase().includes(query) || module.description.toLowerCase().includes(query);
  });
  const activeActionPages = getModulePages(activeTabModule);
  const actionTabs = activeActionPages.flatMap((page) => page.tabs.map((tab) => ({ ...tab, pageKey: page.key })));
  const selectedActionTab = activeActionTab || (actionTabs[0] ? `${actionTabs[0].pageKey}.${actionTabs[0].key}` : "");
  const moduleActionCount = (moduleKey: string) => {
    const pages = getModulePages(moduleKey);
    const tabs = pages.flatMap((page) => page.tabs);
    const enabled = tabs.filter((tab) => {
      const key = tabKey(moduleKey, pages.find((page) => page.tabs.includes(tab))?.key ?? moduleKey, tab.key);
      return (activePermissions[key] ?? activePermissions[moduleKey] ?? []).includes("view");
    }).length;
    return `${enabled}/${tabs.length}`;
  };

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
      {mode !== "tabs" && (mode !== "actions" || showExcelMatrix) && <div className="relative rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900 overflow-hidden">
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
      }

      {/* Action Permissions matrix matching the role-management reference layout. */}
      {mode === "actions" ? (
      <div className="grid items-start gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="max-h-[calc(100vh-14rem)] overflow-y-auto rounded-2xl border border-ledger-200 bg-white p-3 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
          <h3 className="px-2 pb-2 text-sm font-bold text-ink-900 dark:text-white">Modules</h3>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
            <Input value={moduleSearch} onChange={(event) => setModuleSearch(event.target.value)} placeholder="Search modules..." className="h-8 pl-8 text-xs" />
          </div>
          <div className="space-y-1">
            {actionModules.map((module) => {
              const active = module.key === activeTabModule;
              return (
                <button
                  key={module.key}
                  type="button"
                  onClick={() => {
                    setActiveTabModule(module.key);
                    setActiveActionTab("");
                  }}
                  className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors ${active ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300" : "text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.04]"}`}
                >
                  <span className="truncate">{module.name}</span>
                  <span className="ml-2 shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-ledger-500 dark:bg-slate-800 dark:text-ledger-300">{moduleActionCount(module.key)}</span>
                </button>
              );
            })}
          </div>
        </aside>
        <section className="sticky top-4 min-w-0 rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-ink-900 dark:text-white">
                  {MODULE_CONFIGS.find((module) => module.key === activeTabModule)?.name ?? activeTabModule} Module - Action Permissions
                </h2>
                <p className="text-xs text-ledger-500 dark:text-ledger-400">Control what actions this role can perform in each tab.</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setShowExcelMatrix((visible) => !visible)}>
                {showExcelMatrix ? "Hide Excel Matrix" : "Show Excel Matrix"}
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={handleResetModule} disabled={!canManage}>
                <RotateCcw className="h-3.5 w-3.5" /> Reset to Default
              </Button>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto border-b border-ledger-200 dark:border-ledger-700">
            <div className="flex min-w-max gap-1">
              {actionTabs.map((tab) => {
                const tabId = `${tab.pageKey}.${tab.key}`;
                const selected = tabId === selectedActionTab;
                return (
                <button
                  key={tabId}
                  type="button"
                  onClick={() => setActiveActionTab(tabId)}
                  className={`border-b-2 px-3 py-2.5 text-xs font-semibold transition-colors ${selected ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-300" : "border-transparent text-ledger-500 hover:border-ledger-300 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"}`}
                  aria-pressed={selected}
                >
                  {tab.name}
                </button>
                );
              })}
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-ledger-200 dark:border-ledger-700">
            <table className="w-full min-w-[760px] text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="w-[220px] p-3 font-bold text-ink-900 dark:text-white">Action</th>
                  {actionTabs.map((tab) => <th key={`${tab.pageKey}.${tab.key}`} className="min-w-[105px] border-l border-ledger-200 p-3 text-center font-bold text-ink-900 dark:border-ledger-700 dark:text-white">{tab.name}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {PERMISSION_ACTIONS.filter((action) => action.key !== "print").map((action) => (
                  <tr key={action.key}>
                    <td className="p-3">
                      <div className="font-semibold text-ink-900 dark:text-white">{action.label}</div>
                      <div className="text-[10px] text-ledger-400">{action.description}</div>
                    </td>
                    {actionTabs.map((tab) => {
                      const supported = (tab.supportedActions ?? []).includes(action.key);
                      const key = tabKey(activeTabModule, tab.pageKey, tab.key);
                      const explicit = Object.prototype.hasOwnProperty.call(activePermissions, key);
                      const checked = (explicit ? activePermissions[key] : activePermissions[activeTabModule] ?? []).includes(action.key);
                      return (
                        <td key={`${action.key}.${tab.pageKey}.${tab.key}`} className="border-l border-ledger-100 p-3 text-center dark:border-ledger-800">
                          {supported ? <input type="checkbox" checked={checked} disabled={!canManage} onChange={() => handleToggleTab(activeTabModule, tab.pageKey, tab.key, action.key)} className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500" aria-label={`${action.label} ${tab.name}`} /> : <span className="text-ledger-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-3 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
            <Shield className="mt-0.5 h-4 w-4 shrink-0" />
            <p>This role has access to the {MODULE_CONFIGS.find((module) => module.key === activeTabModule)?.name ?? activeTabModule} module with selective tab and action permissions. Only enabled tabs and actions will be visible to users assigned to this role.</p>
          </div>
        </section>
      </div>
      ) : (
      <div className="space-y-4 rounded-2xl border border-ledger-200 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              <h2 className="text-base font-bold text-ink-900 dark:text-white">
                Tab Access
              </h2>
            </div>
            <p className="text-xs text-ledger-500 dark:text-ledger-400">
              Control which tabs are visible and which actions are available inside each page.
            </p>
          </div>
          <select
            value={activeTabModule}
            onChange={(event) => setActiveTabModule(event.target.value)}
            className="h-8 rounded-lg border border-ledger-200 bg-white px-2.5 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-800 dark:text-white"
          >
            {Object.keys(PERMISSION_PAGE_CONFIGS).map((moduleKey) => (
              <option key={moduleKey} value={moduleKey}>
                {MODULE_CONFIGS.find((module) => module.key === moduleKey)?.name ?? moduleKey}
              </option>
            ))}
          </select>
        </div>

        {(PERMISSION_PAGE_CONFIGS[activeTabModule] ?? []).map((page) => (
          <div key={page.key} className="overflow-x-auto rounded-xl border border-ledger-200 dark:border-ledger-700">
            <div className="border-b border-ledger-200 bg-slate-50 px-3 py-2 text-xs font-bold text-ink-900 dark:border-ledger-700 dark:bg-slate-800 dark:text-white">
              {page.name}
            </div>
            <table className="w-full min-w-[720px] text-left text-xs">
              <thead className="bg-slate-100 dark:bg-slate-800">
                <tr>
                  <th className="p-2.5 font-bold text-ink-900 dark:text-white">Action</th>
                  {page.tabs.map((tab) => (
                    <th key={tab.key} className="min-w-[110px] p-2.5 text-center font-bold text-ink-900 dark:text-white">
                      {tab.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                {PERMISSION_ACTIONS.filter((action) => action.key !== "print").map((action) => (
                  <tr key={action.key}>
                    <td className="p-2.5 font-semibold text-ink-900 dark:text-white">
                      <span className="capitalize">{action.label}</span>
                      <span className="ml-2 text-[10px] font-normal text-ledger-400">{action.description}</span>
                    </td>
                    {page.tabs.map((tab) => {
                      const supported = (tab.supportedActions ?? PERMISSION_ACTIONS.map((item) => item.key)).includes(action.key);
                      const permissionKey = tabKey(activeTabModule, page.key, tab.key);
                      const hasExplicitGrant = Object.prototype.hasOwnProperty.call(activePermissions, permissionKey);
                      const current = activePermissions[permissionKey] ?? [];
                      const checked = hasExplicitGrant
                        ? current.includes(action.key)
                        : (activePermissions[activeTabModule] ?? []).includes(action.key);
                      return (
                        <td key={tab.key} className="p-2.5 text-center">
                          {supported ? (
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleTab(activeTabModule, page.key, tab.key, action.key)}
                              disabled={!canManage}
                              aria-label={`${action.label} ${tab.name}`}
                              className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                            />
                          ) : <span className="text-ledger-300">—</span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
      )}

    </div>
  );
}
