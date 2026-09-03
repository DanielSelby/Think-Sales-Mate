"use client";

import React, { useState } from "react";
import {
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  Edit2,
  Power,
  GitMerge,
  ChevronDown,
  Check,
  X,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { AccountingAccount, AccountType } from "@/types/accounting";

export function ChartOfAccountsTab() {
  const {
    accounts,
    currentCurrency,
    currentBranch,
    addAccount,
    updateAccount,
    toggleAccountStatus,
    mergeAccounts,
  } = useAccountingStore();

  const [selectedType, setSelectedType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedBranch, setSelectedBranch] = useState<string>("all");

  // Modal States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<AccountingAccount | null>(null);

  // Form State for Add / Edit
  const [formData, setFormData] = useState<{
    code: string;
    name: string;
    type: AccountType;
    subType: string;
    parentId: string;
    branch: string;
    openingBalance: number;
    description: string;
  }>({
    code: "",
    name: "",
    type: "asset",
    subType: "Current Assets",
    parentId: "",
    branch: "Main Branch",
    openingBalance: 0,
    description: "",
  });

  // Merge modal state
  const [mergeSourceId, setMergeSourceId] = useState("");
  const [mergeTargetId, setMergeTargetId] = useState("");

  const filteredAccounts = accounts.filter((acc) => {
    const matchesType = selectedType === "all" || acc.type === selectedType;
    const matchesBranch = selectedBranch === "all" || acc.branch === selectedBranch;
    const matchesSearch =
      acc.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      acc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (acc.subType && acc.subType.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesType && matchesBranch && matchesSearch;
  });

  const handleOpenAdd = () => {
    setFormData({
      code: "",
      name: "",
      type: "asset",
      subType: "Current Assets",
      parentId: "",
      branch: currentBranch || "Main Branch",
      openingBalance: 0,
      description: "",
    });
    setIsAddModalOpen(true);
  };

  const handleOpenEdit = (acc: AccountingAccount) => {
    setSelectedAccount(acc);
    setFormData({
      code: acc.code,
      name: acc.name,
      type: acc.type,
      subType: acc.subType || "",
      parentId: acc.parentId || "",
      branch: acc.branch,
      openingBalance: 0,
      description: acc.description || "",
    });
    setIsEditModalOpen(true);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code || !formData.name) return;

    addAccount({
      code: formData.code,
      name: formData.name,
      type: formData.type,
      subType: formData.subType,
      parentId: formData.parentId || null,
      branch: formData.branch,
      currency: currentCurrency,
      status: "active",
      description: formData.description,
      openingBalance: Number(formData.openingBalance) || 0,
    });

    setIsAddModalOpen(false);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccount) return;

    updateAccount(selectedAccount.id, {
      code: formData.code,
      name: formData.name,
      type: formData.type,
      subType: formData.subType,
      parentId: formData.parentId || null,
      branch: formData.branch,
      description: formData.description,
    });

    setIsEditModalOpen(false);
  };

  const handlePerformMerge = () => {
    if (!mergeSourceId || !mergeTargetId || mergeSourceId === mergeTargetId) return;
    const success = mergeAccounts(mergeSourceId, mergeTargetId);
    if (success) {
      setIsMergeModalOpen(false);
      setMergeSourceId("");
      setMergeTargetId("");
    }
  };

  const handleExportExcel = () => {
    const data = filteredAccounts.map((a) => ({
      "Account Code": a.code,
      "Account Name": a.name,
      "Account Type": a.type.toUpperCase(),
      "Sub Type": a.subType || "",
      Branch: a.branch,
      Balance: a.balance,
      Currency: currentCurrency,
      Status: a.status.toUpperCase(),
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Chart of Accounts");
    XLSX.writeFile(workbook, `Chart_of_Accounts_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleExportCSV = () => {
    const headers = ["Account Code,Account Name,Account Type,Sub Type,Branch,Balance,Currency,Status"];
    const rows = filteredAccounts.map(
      (a) => `"${a.code}","${a.name}","${a.type}","${a.subType || ""}","${a.branch}",${a.balance},"${currentCurrency}","${a.status}"`
    );
    const csvContent = "data:text/csv;charset=utf-8," + [headers, ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Chart_of_Accounts_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = () => {
    window.print();
  };

  const TYPE_TABS = [
    { key: "all", label: "All Accounts" },
    { key: "asset", label: "Assets" },
    { key: "liability", label: "Liabilities" },
    { key: "equity", label: "Equity" },
    { key: "revenue", label: "Revenue" },
    { key: "cogs", label: "COGS" },
    { key: "expense", label: "Expenses" },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header Controls & Actions ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {TYPE_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedType(tab.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-all ${
                selectedType === tab.key
                  ? "bg-blue-600 text-white shadow-sm"
                  : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> CSV
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Printer className="h-3.5 w-3.5 text-slate-500" /> Print
          </button>
          <button
            onClick={() => setIsMergeModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-purple-200 bg-purple-50 px-3 py-1.5 text-xs font-semibold text-purple-700 hover:bg-purple-100 dark:border-purple-900/60 dark:bg-purple-950/40 dark:text-purple-300"
          >
            <GitMerge className="h-3.5 w-3.5" /> Merge Accounts
          </button>
          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Add Account
          </button>
        </div>
      </div>

      {/* ── Filters Bar ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search account code, name, or group..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60 dark:focus:bg-slate-800"
          />
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Building2 className="h-3.5 w-3.5" />
            <span>Branch:</span>
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="all">All Branches</option>
              <option value="Main Branch">Main Branch</option>
              <option value="Kumasi Branch">Kumasi Branch</option>
              <option value="Takoradi Branch">Takoradi Branch</option>
            </select>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Showing {filteredAccounts.length} of {accounts.length} accounts
          </span>
        </div>
      </div>

      {/* ── Chart of Accounts Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3">Account Code</th>
                <th className="px-4 py-3">Account Name</th>
                <th className="px-4 py-3">Account Type</th>
                <th className="px-4 py-3">Sub-Group / Parent</th>
                <th className="px-4 py-3">Branch</th>
                <th className="px-4 py-3 text-right">Balance ({currentCurrency})</th>
                <th className="px-4 py-3 text-center">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAccounts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No accounts found matching your search.
                  </td>
                </tr>
              ) : (
                filteredAccounts.map((acc) => {
                  let badgeBg = "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300";
                  if (acc.type === "liability") badgeBg = "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
                  if (acc.type === "equity") badgeBg = "bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300";
                  if (acc.type === "revenue") badgeBg = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
                  if (acc.type === "expense" || acc.type === "cogs") badgeBg = "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300";

                  return (
                    <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                        {acc.code}
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                        {acc.name}
                        {acc.description && (
                          <p className="text-[11px] font-normal text-slate-400">{acc.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-lg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${badgeBg}`}>
                          {acc.type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                        {acc.subType || "General"}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{acc.branch}</td>
                      <td className={`px-4 py-3 text-right font-display font-semibold ${acc.balance < 0 ? "text-rose-600" : "text-slate-900 dark:text-white"}`}>
                        {acc.balance < 0
                          ? `(${Math.abs(acc.balance).toLocaleString("en-US", { minimumFractionDigits: 2 })})`
                          : acc.balance.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            acc.status === "active"
                              ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {acc.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            title="Edit Account"
                            onClick={() => handleOpenEdit(acc)}
                            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            title={acc.status === "active" ? "Deactivate Account" : "Activate Account"}
                            onClick={() => toggleAccountStatus(acc.id)}
                            className={`rounded-lg p-1 ${
                              acc.status === "active"
                                ? "text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                : "text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <Power className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Account Modal ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Add Account</h3>
              <button onClick={() => setIsAddModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Account Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 1030"
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Account Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="asset">Asset (1000s)</option>
                    <option value="liability">Liability (2000s)</option>
                    <option value="equity">Equity (3000s)</option>
                    <option value="revenue">Revenue (4000s)</option>
                    <option value="cogs">Cost of Goods Sold (5000s)</option>
                    <option value="expense">Expense (6000s)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Account Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Petty Cash - Kumasi"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Sub-Group</label>
                  <input
                    type="text"
                    placeholder="e.g. Cash & Bank"
                    value={formData.subType}
                    onChange={(e) => setFormData({ ...formData, subType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Branch</label>
                  <select
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="Main Branch">Main Branch</option>
                    <option value="Kumasi Branch">Kumasi Branch</option>
                    <option value="Takoradi Branch">Takoradi Branch</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Opening Balance ({currentCurrency})</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={formData.openingBalance || ""}
                  onChange={(e) => setFormData({ ...formData, openingBalance: parseFloat(e.target.value) || 0 })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Description / Memo</label>
                <textarea
                  rows={2}
                  placeholder="Optional description..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Account Modal ── */}
      {isEditModalOpen && selectedAccount && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Edit Account ({selectedAccount.code})
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Account Code *</label>
                  <input
                    type="text"
                    required
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Account Type *</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData({ ...formData, type: e.target.value as AccountType })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="revenue">Revenue</option>
                    <option value="cogs">COGS</option>
                    <option value="expense">Expense</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Account Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Sub-Group</label>
                  <input
                    type="text"
                    value={formData.subType}
                    onChange={(e) => setFormData({ ...formData, subType: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Branch</label>
                  <select
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="Main Branch">Main Branch</option>
                    <option value="Kumasi Branch">Kumasi Branch</option>
                    <option value="Takoradi Branch">Takoradi Branch</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Merge Accounts Modal ── */}
      {isMergeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <GitMerge className="h-4 w-4 text-purple-600" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">Merge Accounts</h3>
              </div>
              <button onClick={() => setIsMergeModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500 leading-relaxed">
              Merging will reassign all historical journal lines and transfer the balance from the Source Account to the Target Account. The Source Account will then be removed.
            </p>

            <div className="mt-4 space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Source Account (To be merged & removed)</label>
                <select
                  value={mergeSourceId}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select source account...</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name} ({currentCurrency} {a.balance.toLocaleString()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Target Account (To retain balance & entries)</label>
                <select
                  value={mergeTargetId}
                  onChange={(e) => setMergeTargetId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-purple-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value="">Select target account...</option>
                  {accounts
                    .filter((a) => a.id !== mergeSourceId)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} - {a.name} ({currentCurrency} {a.balance.toLocaleString()})
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsMergeModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!mergeSourceId || !mergeTargetId}
                  onClick={handlePerformMerge}
                  className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 disabled:opacity-50 shadow-sm"
                >
                  Confirm & Merge
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
