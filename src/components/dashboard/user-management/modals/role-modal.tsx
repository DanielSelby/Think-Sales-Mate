"use client";

import { useState, useEffect } from "react";
import { X, Shield, ShieldCheck, Check, Plus, AlertCircle, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MODULE_CONFIGS, PERMISSION_ACTIONS } from "../constants";
import type { RoleDefinition, ModuleCategory, PermissionAction } from "../types";

interface RoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  roleToEdit: RoleDefinition | null;
  mode: "create" | "edit" | "clone";
  onSaveRole: (role: RoleDefinition) => void;
}

export function RoleModal({
  isOpen,
  onClose,
  roleToEdit,
  mode,
  onSaveRole
}: RoleModalProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<"all_branches" | "branch_specific">("branch_specific");
  const [permissions, setPermissions] = useState<Record<ModuleCategory, PermissionAction[]>>({} as any);
  const [approvals, setApprovals] = useState({
    stockTransfers: false,
    purchases: false,
    expenses: false,
    priceUpdates: false,
    stockAdjustments: false
  });

  useEffect(() => {
    if (roleToEdit) {
      setName(mode === "clone" ? `${roleToEdit.name} (Copy)` : roleToEdit.name);
      setDescription(roleToEdit.description);
      setScope(roleToEdit.scope);
      setPermissions(JSON.parse(JSON.stringify(roleToEdit.permissions)));
      setApprovals({ ...roleToEdit.approvalCapabilities });
    } else {
      setName("");
      setDescription("");
      setScope("branch_specific");
      const initialPerms: Record<ModuleCategory, PermissionAction[]> = {} as any;
      MODULE_CONFIGS.forEach((m) => {
        initialPerms[m.key] = ["view"];
      });
      setPermissions(initialPerms);
      setApprovals({
        stockTransfers: false,
        purchases: false,
        expenses: false,
        priceUpdates: false,
        stockAdjustments: false
      });
    }
  }, [roleToEdit, mode, isOpen]);

  if (!isOpen) return null;

  const togglePermission = (moduleKey: ModuleCategory, action: PermissionAction) => {
    setPermissions((prev) => {
      const current = prev[moduleKey] || [];
      const exists = current.includes(action);
      const next = exists ? current.filter((a) => a !== action) : [...current, action];
      return {
        ...prev,
        [moduleKey]: next
      };
    });
  };

  const toggleAllInModule = (moduleKey: ModuleCategory) => {
    const config = MODULE_CONFIGS.find((m) => m.key === moduleKey);
    if (!config) return;

    setPermissions((prev) => {
      const current = prev[moduleKey] || [];
      const isAll = config.supportedActions.every((a) => current.includes(a));
      return {
        ...prev,
        [moduleKey]: isAll ? [] : [...config.supportedActions]
      };
    });
  };

  const calculateTotalPermissions = () => {
    return Object.values(permissions).reduce((acc, actions) => acc + actions.length, 0);
  };

  const handleGrantAll = () => {
    const all: Record<ModuleCategory, PermissionAction[]> = {} as any;
    MODULE_CONFIGS.forEach((m) => {
      all[m.key] = [...m.supportedActions];
    });
    setPermissions(all);
    setApprovals({
      stockTransfers: true,
      purchases: true,
      expenses: true,
      priceUpdates: true,
      stockAdjustments: true
    });
  };

  const handleRevokeAll = () => {
    const empty: Record<ModuleCategory, PermissionAction[]> = {} as any;
    MODULE_CONFIGS.forEach((m) => {
      empty[m.key] = [];
    });
    setPermissions(empty);
    setApprovals({
      stockTransfers: false,
      purchases: false,
      expenses: false,
      priceUpdates: false,
      stockAdjustments: false
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const totalCount = calculateTotalPermissions();
    const newRole: RoleDefinition = {
      id: mode === "edit" && roleToEdit ? roleToEdit.id : `role-${Date.now()}`,
      key: mode === "edit" && roleToEdit ? roleToEdit.key : name.toLowerCase().replace(/[^a-z0-9]/g, "_"),
      name: name.trim(),
      description: description.trim() || "Custom enterprise role with customized RBAC capabilities.",
      userCount: mode === "edit" && roleToEdit ? roleToEdit.userCount : 0,
      permissionCount: totalCount,
      isSystem: mode === "edit" && roleToEdit ? roleToEdit.isSystem : false,
      scope,
      badgeColor: "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/60 dark:text-purple-300 dark:border-purple-800",
      permissions,
      approvalCapabilities: approvals
    };

    onSaveRole(newRole);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
              {mode === "clone" ? <Copy className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">
                {mode === "create" ? "Create Custom Role" : mode === "clone" ? "Clone Role" : "Edit Role: " + roleToEdit?.name}
              </h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">
                Define module authorizations, granular action privileges, and approval authority
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Basic Details */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                Role Name <span className="text-red-500">*</span>
              </label>
              <Input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Regional Auditor"
                className="h-9 text-xs font-medium"
              />
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                Branch Access Scope
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as any)}
                className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="branch_specific">Branch-Specific (Scoped to assigned branches)</option>
                <option value="all_branches">Global (All branches & warehouses)</option>
              </select>
            </div>

            <div className="sm:col-span-1">
              <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                Description
              </label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Role responsibility summary"
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Approvals checklist */}
          <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/30">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Approval Capabilities</h3>
              <span className="text-[11px] text-ledger-400">Allows users in this role to authorize high-value transactions</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                { key: "stockTransfers", label: "Stock Transfers" },
                { key: "purchases", label: "Purchases" },
                { key: "expenses", label: "Expenses" },
                { key: "priceUpdates", label: "Price Updates" },
                { key: "stockAdjustments", label: "Stock Adjustments" }
              ].map((item) => (
                <label key={item.key} className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(approvals as any)[item.key]}
                    onChange={(e) => setApprovals({ ...approvals, [item.key]: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-ledger-300 text-purple-600 focus:ring-purple-500"
                  />
                  <span className="text-ink-900 dark:text-white">{item.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Granular Module Permissions Matrix Checklist */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">
                  Module Permissions Checklist ({calculateTotalPermissions()} selected)
                </h3>
                <p className="text-[11px] text-ledger-400">Toggle individual action rights for each registered enterprise module</p>
              </div>
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={handleGrantAll} className="h-7 text-xs">
                  Grant All
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={handleRevokeAll} className="h-7 text-xs">
                  Revoke All
                </Button>
              </div>
            </div>

            <div className="space-y-2 border border-ledger-100 rounded-xl overflow-hidden dark:border-ledger-800">
              {MODULE_CONFIGS.map((mod) => {
                const currentActions = permissions[mod.key] || [];
                const isAllSelected = mod.supportedActions.every((a) => currentActions.includes(a));

                return (
                  <div
                    key={mod.key}
                    className="flex flex-col sm:flex-row sm:items-center justify-between p-3 border-b border-ledger-50 last:border-0 hover:bg-slate-50/50 dark:border-ledger-800/50 dark:hover:bg-slate-800/30 gap-2"
                  >
                    <div className="min-w-0 sm:w-1/3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => toggleAllInModule(mod.key)}
                          className={`text-xs font-bold hover:underline ${isAllSelected ? "text-purple-600 dark:text-purple-400" : "text-ink-900 dark:text-white"}`}
                        >
                          {mod.name}
                        </button>
                        <span className="text-[10px] text-ledger-400">({currentActions.length}/{mod.supportedActions.length})</span>
                      </div>
                      <p className="text-[10px] text-ledger-400 truncate">{mod.description}</p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:w-2/3 sm:justify-end">
                      {mod.supportedActions.map((action) => {
                        const isChecked = currentActions.includes(action);
                        return (
                          <label
                            key={action}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer border transition-colors ${
                              isChecked
                                ? "bg-purple-50 border-purple-200 text-purple-700 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300"
                                : "bg-white border-ledger-100 text-ledger-500 hover:bg-slate-50 dark:bg-slate-900 dark:border-ledger-800 dark:text-ledger-400"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => togglePermission(mod.key, action)}
                              className="h-3 w-3 rounded border-ledger-300 text-purple-600 focus:ring-purple-500"
                            />
                            <span className="capitalize">{action}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-between pt-4 border-t border-ledger-100 dark:border-ledger-800">
            <span className="text-xs text-ledger-400 font-mono">
              Total Permissions: {calculateTotalPermissions()}
            </span>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                {mode === "create" ? "Save New Role" : mode === "clone" ? "Clone Role" : "Update Role"}
              </Button>
            </div>
          </div>

        </form>

      </div>
    </div>
  );
}
