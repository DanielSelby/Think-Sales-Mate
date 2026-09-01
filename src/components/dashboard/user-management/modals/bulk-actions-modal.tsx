"use client";

import { useState } from "react";
import { X, Shield, Building2, Trash2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { RoleDefinition, UserBranch } from "../types";

interface BulkRoleModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  roles: RoleDefinition[];
  onConfirm: (roleKey: string) => void;
}

export function BulkRoleModal({
  isOpen,
  onClose,
  selectedCount,
  roles,
  onConfirm
}: BulkRoleModalProps) {
  const [selectedRole, setSelectedRole] = useState(roles[0]?.key || "sales_officer");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <Shield className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">
              Assign Role ({selectedCount} Users)
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Select the new system role to assign to the {selectedCount} selected user accounts:
          </p>
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
          >
            {roles.map((r) => (
              <option key={r.key || r.id} value={r.key || r.id}>
                {r.name} ({r.permissionCount} permissions)
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { onConfirm(selectedRole); onClose(); }} className="bg-blue-600 hover:bg-blue-700 text-white">
            Apply Role Change
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BulkBranchModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  branches: UserBranch[];
  onConfirm: (branchId: string) => void;
}

export function BulkBranchModal({
  isOpen,
  onClose,
  selectedCount,
  branches,
  onConfirm
}: BulkBranchModalProps) {
  const [selectedBranch, setSelectedBranch] = useState(branches[0]?.id || "b-head");

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-2.5">
            <Building2 className="h-5 w-5 text-blue-600" />
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">
              Assign Primary Branch ({selectedCount} Users)
            </h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-xs text-ledger-500 dark:text-ledger-400">
            Set the primary home branch for {selectedCount} selected users:
          </p>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
          >
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} {b.isMain ? "(Head Office)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { onConfirm(selectedBranch); onClose(); }} className="bg-blue-600 hover:bg-blue-700 text-white">
            Assign Branch
          </Button>
        </div>
      </div>
    </div>
  );
}

interface BulkDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedCount: number;
  onConfirm: () => void;
}

export function BulkDeleteModal({
  isOpen,
  onClose,
  selectedCount,
  onConfirm
}: BulkDeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl dark:border-red-900 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-red-100 bg-red-50/50 px-6 py-4 dark:border-red-950 dark:bg-red-950/30">
          <div className="flex items-center gap-2.5 text-red-600">
            <AlertTriangle className="h-5 w-5" />
            <h2 className="text-base font-semibold">Delete {selectedCount} Users?</h2>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-3">
          <p className="text-xs text-ledger-600 dark:text-ledger-300">
            Are you sure you want to remove the <strong className="text-ink-900 dark:text-white">{selectedCount} selected user accounts</strong> from ThinkSales Pro?
          </p>
          <p className="text-[11px] text-ledger-400">
            This will revoke their login access, terminate active sessions, and remove branch assignments. Historical transactions and audit logs will remain intact.
          </p>
        </div>

        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={() => { onConfirm(); onClose(); }} className="bg-red-600 hover:bg-red-700 text-white">
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Selected Users
          </Button>
        </div>
      </div>
    </div>
  );
}
