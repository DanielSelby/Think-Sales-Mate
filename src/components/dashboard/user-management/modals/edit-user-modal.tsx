"use client";

import { useState, useEffect } from "react";
import { X, Pencil, Shield, Building2, Lock, UserCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPARTMENTS } from "../constants";
import type { ManagedUser, RoleDefinition, UserBranch, UserStatus } from "../types";

interface EditUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ManagedUser | null;
  roles: RoleDefinition[];
  branches: UserBranch[];
  onUpdateUser: (userId: string, updates: Partial<ManagedUser>) => void;
}

export function EditUserModal({
  isOpen,
  onClose,
  user,
  roles,
  branches,
  onUpdateUser
}: EditUserModalProps) {
  const [formData, setFormData] = useState({
    fullName: "",
    email: "",
    phone: "",
    employeeId: "",
    role: "sales_officer",
    status: "active" as UserStatus,
    department: "Sales & Marketing",
    locationId: "b-head",
    secondaryBranches: [] as string[],
    branchScope: "single" as "all" | "assigned" | "single",
    canViewOtherTransactions: true,
    canCheckCrossBranchStock: false,
    twoFactorEnabled: false,
    approvalStockTransfers: false,
    approvalPurchases: false,
    approvalExpenses: false,
    approvalPriceUpdates: false,
    approvalStockAdjustments: false,
    maxExpenseLimit: "10000",
    maxPurchaseLimit: "25000"
  });

  const [activeTab, setActiveTab] = useState<"details" | "branches" | "approvals">("details");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      setFormData({
        fullName: user.fullName || user.name || "",
        email: user.email || "",
        phone: user.phone || "",
        employeeId: user.employeeId || "",
        role: String(user.role),
        status: (user.status as UserStatus) || "active",
        department: user.department || "Sales & Marketing",
        locationId: user.locationId || branches[0]?.id || "b-head",
        secondaryBranches: user.secondaryBranches || [],
        branchScope: user.branchScope || (user.secondaryBranches?.length ? "assigned" : "single"),
        canViewOtherTransactions: user.canViewOtherTransactions !== false,
        canCheckCrossBranchStock: user.canCheckCrossBranchStock === true,
        twoFactorEnabled: Boolean(user.twoFactorEnabled),
        approvalStockTransfers: Boolean(user.approvalPermissions?.stockTransfers),
        approvalPurchases: Boolean(user.approvalPermissions?.purchases),
        approvalExpenses: Boolean(user.approvalPermissions?.expenses),
        approvalPriceUpdates: Boolean(user.approvalPermissions?.priceUpdates),
        approvalStockAdjustments: Boolean(user.approvalPermissions?.stockAdjustments),
        maxExpenseLimit: String(user.approvalPermissions?.maxExpenseAmount || 10000),
        maxPurchaseLimit: String(user.approvalPermissions?.maxPurchaseAmount || 25000)
      });
    }
  }, [user, branches]);

  if (!isOpen || !user) return null;

  const handleBranchToggle = (branchId: string) => {
    setFormData((prev) => {
      const exists = prev.secondaryBranches.includes(branchId);
      return {
        ...prev,
        secondaryBranches: exists
          ? prev.secondaryBranches.filter((id) => id !== branchId)
          : [...prev.secondaryBranches, branchId]
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    const selectedBranch = branches.find((b) => b.id === formData.locationId);
    const secondaryNames = branches
      .filter((b) => formData.secondaryBranches.includes(b.id))
      .map((b) => b.name);

    const selectedRole = roles.find((r) => r.key === formData.role || r.id === formData.role);

    const updates: Partial<ManagedUser> = {
      name: formData.fullName,
      fullName: formData.fullName,
      email: formData.email.trim().toLowerCase(),
      phone: formData.phone,
      employeeId: formData.employeeId,
      role: formData.role,
      roleLabel: selectedRole?.name ?? "Sales Associate",
      status: formData.status,
      department: formData.department,
      locationId: formData.locationId,
      locationName: selectedBranch?.name ?? "Head Office",
      secondaryBranches: formData.secondaryBranches,
      secondaryBranchNames: secondaryNames,
      branchScope: formData.branchScope,
      canViewOtherTransactions: formData.canViewOtherTransactions,
      canCheckCrossBranchStock: formData.canCheckCrossBranchStock,
      twoFactorEnabled: formData.twoFactorEnabled,
      approvalPermissions: {
        stockTransfers: formData.approvalStockTransfers,
        purchases: formData.approvalPurchases,
        expenses: formData.approvalExpenses,
        priceUpdates: formData.approvalPriceUpdates,
        stockAdjustments: formData.approvalStockAdjustments,
        maxExpenseAmount: Number(formData.maxExpenseLimit) || 0,
        maxPurchaseAmount: Number(formData.maxPurchaseLimit) || 0
      }
    };

    setTimeout(() => {
      onUpdateUser(user.id, updates);
      setIsSubmitting(false);
      onClose();
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Pencil className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">
                Edit User: {user.fullName || user.email}
              </h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Update account credentials, system role, and access scope</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Sub-tabs */}
        <div className="flex border-b border-ledger-100 bg-white px-6 dark:border-ledger-800 dark:bg-slate-900">
          {[
            { key: "details", label: "Profile & Role" },
            { key: "branches", label: "Branch Assignment" },
            { key: "approvals", label: "Approval Limits" }
          ].map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setActiveTab(t.key as typeof activeTab)}
              className={`border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                activeTab === t.key
                  ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                  : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className="max-h-[60vh] overflow-y-auto p-6 space-y-4">
            
            {activeTab === "details" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Full Name
                    </label>
                    <Input
                      required
                      value={formData.fullName}
                      onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Email Address
                    </label>
                    <Input
                      required
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Phone Number
                    </label>
                    <Input
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="h-9 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Employee ID
                    </label>
                    <Input
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      className="h-9 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Account Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value as UserStatus })}
                      className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                      <option value="suspended">Suspended</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      System Role
                    </label>
                    <select
                      value={formData.role}
                      onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                      className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                    >
                      {roles.map((r) => (
                        <option key={r.key || r.id} value={r.key || r.id}>
                          {r.name} ({r.permissionCount} permissions)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                      Department
                    </label>
                    <select
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                    >
                      {DEPARTMENTS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 border-t border-ledger-100 dark:border-ledger-800">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.twoFactorEnabled}
                      onChange={(e) => setFormData({ ...formData, twoFactorEnabled: e.target.checked })}
                      className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs text-ink-900 dark:text-white font-medium">
                      Require Two-Factor Authentication (2FA) for this account
                    </span>
                  </label>
                </div>
              </div>
            )}

            {activeTab === "branches" && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                    Primary Home Branch
                  </label>
                  <select
                    value={formData.locationId}
                    onChange={(e) => setFormData({ ...formData, locationId: e.target.value })}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs font-medium dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} {b.isMain ? "(Head Office)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1.5">
                    Branch Access Scope
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "all", title: "All Branches", desc: "Enterprise unrestricted" },
                      { id: "assigned", title: "Multi-Branch", desc: "Primary + assigned" },
                      { id: "single", title: "Single Branch", desc: "Primary only" }
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setFormData({ ...formData, branchScope: opt.id as any })}
                        className={`rounded-xl border p-2.5 text-left transition-all ${
                          formData.branchScope === opt.id
                            ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40"
                            : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
                        }`}
                      >
                        <p className="text-xs font-semibold text-ink-900 dark:text-white">{opt.title}</p>
                        <p className="text-[10px] text-ledger-400">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {formData.branchScope === "assigned" && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-2">
                      Secondary Assigned Branches
                    </label>
                    <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-2 rounded-lg border border-ledger-200 dark:border-ledger-700">
                      {branches
                        .filter((b) => b.id !== formData.locationId)
                        .map((b) => {
                          const isChecked = formData.secondaryBranches.includes(b.id);
                          return (
                            <label
                              key={b.id}
                              className={`flex items-center gap-2 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                                isChecked
                                  ? "border-blue-500 bg-blue-50/40 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300"
                                  : "border-ledger-100 hover:bg-slate-50 dark:border-ledger-800 dark:hover:bg-slate-800 text-ink-900 dark:text-white"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => handleBranchToggle(b.id)}
                                className="h-3.5 w-3.5 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                              />
                              <span className="truncate font-medium">{b.name}</span>
                            </label>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Transaction Visibility Scope */}
                <div className="pt-2 border-t border-ledger-100 dark:border-ledger-800 space-y-2">
                  <div>
                    <label className="block text-xs font-semibold text-ink-900 dark:text-white">
                      Transaction Visibility Scope
                    </label>
                    <p className="text-[11px] text-ledger-400 mb-2">
                      Choose whether this user can see all transactions or only transactions they personally processed.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, canViewOtherTransactions: true })}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        formData.canViewOtherTransactions
                          ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40"
                          : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-ink-900 dark:text-white">All Branch Transactions</span>
                        {formData.canViewOtherTransactions && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="text-[10px] text-ledger-400">
                        Can view and report on all sales, orders, and expenses in their assigned branch(es).
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, canViewOtherTransactions: false })}
                      className={`rounded-xl border p-3 text-left transition-all ${
                        !formData.canViewOtherTransactions
                          ? "border-blue-600 bg-blue-50/50 dark:border-blue-500 dark:bg-blue-950/40"
                          : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-semibold text-ink-900 dark:text-white">Own Transactions Only</span>
                        {!formData.canViewOtherTransactions && <span className="h-2 w-2 rounded-full bg-blue-600" />}
                      </div>
                      <p className="text-[10px] text-ledger-400">
                        Restricted to seeing only sales, POS records, and drafts created by themselves.
                      </p>
                    </button>
                  </div>
                </div>
                <label className="flex items-start gap-2.5 pt-2 border-t border-ledger-100 dark:border-ledger-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.canCheckCrossBranchStock}
                    onChange={(e) => setFormData({ ...formData, canCheckCrossBranchStock: e.target.checked })}
                    className="mt-0.5 h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block text-xs font-semibold text-ink-900 dark:text-white">Allow cross-branch stock checks</span>
                    <span className="block text-[11px] text-ledger-400">Lets this user check quantities for products unavailable in their assigned branch.</span>
                  </span>
                </label>
              </div>
            )}

            {activeTab === "approvals" && (
              <div className="space-y-4">
                <div className="space-y-2">
                  {[
                    { key: "approvalStockTransfers", label: "Approve Stock Transfers", desc: "Authorize inter-branch stock movements" },
                    { key: "approvalPurchases", label: "Approve Purchase Orders", desc: "Sign off vendor orders and purchase bills" },
                    { key: "approvalExpenses", label: "Approve Operating Expenses", desc: "Authorize petty cash and expense claims" },
                    { key: "approvalPriceUpdates", label: "Approve Price Updates", desc: "Allow modifying product retail and wholesale prices" },
                    { key: "approvalStockAdjustments", label: "Approve Stock Adjustments", desc: "Authorize inventory write-offs and variance entries" }
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-3 p-2.5 rounded-lg border border-ledger-100 hover:bg-slate-50 dark:border-ledger-800 dark:hover:bg-slate-800/60 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={(formData as any)[item.key]}
                        onChange={(e) => setFormData({ ...formData, [item.key]: e.target.checked })}
                        className="mt-0.5 h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div>
                        <p className="text-xs font-semibold text-ink-900 dark:text-white">{item.label}</p>
                        <p className="text-[11px] text-ledger-400">{item.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ledger-100 dark:border-ledger-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-ink-900 dark:text-white mb-1">
                      Max Expense Approval Limit (GHS)
                    </label>
                    <Input
                      type="number"
                      value={formData.maxExpenseLimit}
                      onChange={(e) => setFormData({ ...formData, maxExpenseLimit: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-ink-900 dark:text-white mb-1">
                      Max Purchase Approval Limit (GHS)
                    </label>
                    <Input
                      type="number"
                      value={formData.maxPurchaseLimit}
                      onChange={(e) => setFormData({ ...formData, maxPurchaseLimit: e.target.value })}
                      className="h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
            )}

          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
            <div className="text-xs text-ledger-400">
              User ID: <span className="font-mono">{user.id}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="bg-blue-600 hover:bg-blue-700 text-white">
                {isSubmitting ? "Saving Changes..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </form>

      </div>
    </div>
  );
}
