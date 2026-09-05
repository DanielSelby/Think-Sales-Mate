"use client";

import {
  Shield,
  ShieldCheck,
  Users,
  Lock,
  Plus,
  Pencil,
  Copy,
  Trash2,
  CheckCircle2,
  Building2,
  KeyRound,
  Eye,
  Sparkles,
  Zap,
  Crown,
  ShoppingCart,
  Receipt,
  Layers,
  Wallet
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { PERMISSION_TEMPLATES } from "../constants";
import type { RoleDefinition, ManagedUser } from "../types";
import { THEMES, type ThemeKey } from "@/store/useAppStore";

interface RolesTabProps {
  roles: RoleDefinition[];
  users: ManagedUser[];
  canManage: boolean;
  onCreateRole: () => void;
  onApplyTemplate: (templateKey: string) => void;
  onEditRole: (role: RoleDefinition) => void;
  onCloneRole: (role: RoleDefinition) => void;
  onDeleteRole: (role: RoleDefinition) => void;
  onFilterByRole: (roleKey: string) => void;
  roleThemes: Record<string, string>;
  canManageThemes: boolean;
  onSaveRoleTheme: (roleKey: string, themeKey: ThemeKey) => void;
}

export function RolesTab({
  roles,
  users,
  canManage,
  onCreateRole,
  onApplyTemplate,
  onEditRole,
  onCloneRole,
  onDeleteRole,
  onFilterByRole, roleThemes, canManageThemes, onSaveRoleTheme
}: RolesTabProps) {
  return (
    <div className="space-y-6">
      
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl border border-ledger-200 bg-white shadow-sm dark:border-ledger-800 dark:bg-slate-900">
        <div>
          <h2 className="text-base font-bold text-ink-900 dark:text-white">Role-Based Access Control (RBAC) & Governance</h2>
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Configure system roles, access policies, approval authorities, and 1-click permission templates
          </p>
        </div>

        {canManage && (
          <Button onClick={onCreateRole} className="bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold">
            <Plus className="h-4 w-4 mr-1.5" /> Create Custom Role
          </Button>
        )}
      </div>

      {/* 1-Click Permission Templates Banner */}
      <div className="rounded-2xl border border-purple-200 bg-gradient-to-r from-purple-50/70 via-indigo-50/40 to-blue-50/50 p-4 dark:border-purple-900/60 dark:bg-slate-900 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-purple-900 dark:text-purple-300">
              1-Click Enterprise Permission Templates
            </h3>
          </div>
          <span className="text-[11px] text-ledger-500 dark:text-ledger-400">
            Apply pre-configured best-practice authorizations instantly
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2">
          {PERMISSION_TEMPLATES.map((tmpl) => (
            <button
              key={tmpl.key}
              type="button"
              onClick={() => onApplyTemplate(tmpl.key)}
              className="flex flex-col items-center justify-center p-2.5 rounded-xl border border-purple-100 bg-white hover:border-purple-300 hover:shadow-sm dark:border-ledger-800 dark:bg-slate-850 dark:hover:border-purple-800 transition-all text-center group"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-purple-50 text-purple-600 group-hover:bg-purple-600 group-hover:text-white transition-colors dark:bg-purple-950 dark:text-purple-300 mb-1">
                <Shield className="h-3.5 w-3.5" />
              </div>
              <span className="text-[11px] font-bold text-ink-900 dark:text-white truncate max-w-full">
                {tmpl.name}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Role Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {roles.map((role) => {
          const roleUsers = users.filter(
            (u) => u.role === role.key || u.role === role.id || u.roleLabel === role.name
          );

          const initialsStack = roleUsers.slice(0, 4);

          return (
            <div
              key={role.id}
              className="flex flex-col justify-between rounded-2xl border border-ledger-200 bg-white p-5 shadow-sm transition-all hover:border-purple-300 hover:shadow-md dark:border-ledger-800 dark:bg-slate-900 dark:hover:border-purple-900"
            >
              <div className="space-y-4">
                
                {/* Top Badge & Scope */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600 dark:bg-purple-950/60 dark:text-purple-400 border border-purple-100 dark:border-purple-900">
                      <Shield className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-ink-900 dark:text-white">{role.name}</h3>
                      <span className="text-[10px] font-semibold text-ledger-400">
                        {role.isSystem ? "System Default Role" : "Custom Role"}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      role.scope === "all_branches"
                        ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                        : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                    }`}
                  >
                    {role.scope === "all_branches" ? "Global Scope" : "Branch Scoped"}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-ledger-500 dark:text-ledger-400 line-clamp-2 leading-relaxed">
                  {role.description}
                </p>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Theme for this role</label>
                  <select
                    disabled={!canManageThemes}
                    value={roleThemes[role.key] || "fintech"}
                    onChange={(event) => onSaveRoleTheme(role.key, event.target.value as ThemeKey)}
                    className="mt-1 h-8 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {(Object.keys(THEMES) as ThemeKey[]).map((key) => <option key={key} value={key}>{THEMES[key].name}</option>)}
                  </select>
                  {!canManageThemes && <p className="mt-1 text-[10px] text-slate-400">Only administrators can change role themes.</p>}
                </div>

                {/* Stats Bar */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-ledger-100 dark:border-ledger-800">
                  <button
                    type="button"
                    onClick={() => onFilterByRole(role.key)}
                    className="flex flex-col p-2 rounded-xl bg-slate-50 hover:bg-purple-50 dark:bg-slate-800/40 dark:hover:bg-purple-950/30 text-left transition-colors"
                  >
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Assigned Users</span>
                    <span className="text-sm font-bold text-ink-900 dark:text-white mt-0.5">{roleUsers.length} users</span>
                  </button>

                  <div className="flex flex-col p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Permissions</span>
                    <span className="text-sm font-bold text-purple-600 dark:text-purple-400 mt-0.5">
                      {Object.values(role.permissions).reduce((count, actions) => count + actions.length, 0)} permissions
                    </span>
                  </div>
                </div>

                {/* Users Stack */}
                {roleUsers.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <div className="flex -space-x-2 overflow-hidden">
                      {initialsStack.map((u) => {
                        const init = (u.fullName || u.name)
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase();
                        return (
                          <div
                            key={u.id}
                            title={u.fullName || u.name}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-700 ring-2 ring-white dark:bg-slate-700 dark:text-slate-200 dark:ring-slate-900"
                          >
                            {init}
                          </div>
                        );
                      })}
                    </div>
                    <span className="text-[11px] text-ledger-400">
                      {roleUsers.length > 4 ? `+${roleUsers.length - 4} more users` : `${roleUsers.length} active`}
                    </span>
                  </div>
                )}

              </div>

              {/* Action Buttons */}
              <div className="mt-5 flex items-center justify-between pt-3 border-t border-ledger-100 dark:border-ledger-800">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onFilterByRole(role.key)}
                  className="h-8 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 px-2"
                >
                  <Eye className="h-3.5 w-3.5 mr-1" /> View Users
                </Button>

                {canManage && (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => onCloneRole(role)}
                      title="Clone this role"
                      className="h-8 w-8 p-0 text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onEditRole(role)}
                      className="h-8 text-xs px-2.5"
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                    </Button>

                    {!role.isSystem && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => onDeleteRole(role)}
                        title="Delete custom role"
                        className="h-8 w-8 p-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </div>

            </div>
          );
        })}
      </div>

    </div>
  );
}
