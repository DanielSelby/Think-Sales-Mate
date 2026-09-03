"use client";

import React, { useState } from "react";
import {
  Package,
  Plus,
  Search,
  Download,
  Printer,
  Calculator,
  CheckCircle2,
  Trash2,
  X,
  Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { FixedAsset, DepreciationMethod } from "@/types/accounting";

export function FixedAssetsTab() {
  const {
    fixedAssets,
    currentCurrency,
    currentBranch,
    addFixedAsset,
    runDepreciationPosting,
  } = useAccountingStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isDeprModalOpen, setIsDeprModalOpen] = useState(false);
  const [deprMonths, setDeprMonths] = useState<number>(1);
  const [deprResult, setDeprResult] = useState<{ totalDepreciation: number; entriesCreated: number } | null>(null);

  // Form State
  const [assetName, setAssetName] = useState("");
  const [category, setCategory] = useState("Motor Vehicles");
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState<number>(0);
  const [method, setMethod] = useState<DepreciationMethod>("straight_line");
  const [usefulLife, setUsefulLife] = useState<number>(5);
  const [salvageValue, setSalvageValue] = useState<number>(0);
  const [branch, setBranch] = useState(currentBranch || "Main Branch");

  const filteredAssets = fixedAssets.filter((a) => {
    const matchesCategory = categoryFilter === "all" || a.category === categoryFilter;
    const matchesSearch =
      a.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.assetCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      a.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const totalCost = fixedAssets.reduce((sum, a) => sum + a.cost, 0);
  const totalAccumulated = fixedAssets.reduce((sum, a) => sum + a.accumulatedDepreciation, 0);
  const totalCurrentValue = fixedAssets.reduce((sum, a) => sum + a.currentValue, 0);

  const handleAddAsset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!assetName || cost <= 0) return;

    addFixedAsset({
      assetCode: "",
      assetName,
      category,
      purchaseDate,
      cost,
      depreciationMethod: method,
      usefulLifeYears: usefulLife,
      salvageValue,
      branch,
      status: "in_use",
    });

    setIsAddModalOpen(false);
    setAssetName("");
    setCost(0);
    setSalvageValue(0);
  };

  const handleRunDepreciation = () => {
    const res = runDepreciationPosting(deprMonths);
    setDeprResult(res);
    setTimeout(() => {
      setDeprResult(null);
      setIsDeprModalOpen(false);
    }, 3000);
  };

  const handleExportExcel = () => {
    const data = filteredAssets.map((a) => ({
      "Asset Code": a.assetCode,
      "Asset Name": a.assetName,
      Category: a.category,
      "Purchase Date": a.purchaseDate,
      "Original Cost": a.cost,
      "Depreciation Method": a.depreciationMethod === "straight_line" ? "Straight-Line" : "Reducing Balance",
      "Useful Life (Years)": a.usefulLifeYears,
      "Salvage Value": a.salvageValue,
      "Accumulated Depreciation": a.accumulatedDepreciation,
      "Net Book Value": a.currentValue,
      Branch: a.branch,
      Status: a.status.toUpperCase(),
      Currency: currentCurrency,
    }));
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fixed Assets Register");
    XLSX.writeFile(workbook, `Fixed_Assets_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* ── Top Metric Cards ── */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-400">Total Asset Cost (Acquisition)</p>
          <p className="mt-1 font-display text-xl font-bold text-slate-900 dark:text-white">
            {currentCurrency} {totalCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">{fixedAssets.length} registered assets</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-400">Accumulated Depreciation</p>
          <p className="mt-1 font-display text-xl font-bold text-rose-500">
            {currentCurrency} {totalAccumulated.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Total amortization to date</p>
        </div>

        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs text-slate-400">Net Book Value (Current)</p>
          <p className="mt-1 font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {currentCurrency} {totalCurrentValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">Carrying balance in Balance Sheet</p>
        </div>
      </div>

      {/* ── Filters & Action Controls ── */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between dark:border-slate-800 dark:bg-slate-900">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            placeholder="Search asset name, code, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-9 pr-3 py-1.5 text-xs outline-none focus:border-blue-500 focus:bg-white dark:border-slate-700 dark:bg-slate-800/60"
          />
        </div>

        <div className="flex items-center gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 outline-none hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <option value="all">All Categories</option>
            <option value="Motor Vehicles">Motor Vehicles</option>
            <option value="Machinery">Machinery</option>
            <option value="IT Equipment">IT Equipment</option>
            <option value="Fixtures & Fittings">Fixtures & Fittings</option>
          </select>

          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>

          <button
            onClick={() => setIsDeprModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-950/60 dark:bg-emerald-950/40 dark:text-emerald-300"
          >
            <Calculator className="h-3.5 w-3.5" /> Run Depreciation
          </button>

          <button
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add Asset
          </button>
        </div>
      </div>

      {/* ── Asset Register Table ── */}
      <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                <th className="px-4 py-3">Asset Code</th>
                <th className="px-4 py-3">Asset Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Purchase Date</th>
                <th className="px-4 py-3 text-right">Cost ({currentCurrency})</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3 text-center">Life</th>
                <th className="px-4 py-3 text-right">Accum. Depr.</th>
                <th className="px-4 py-3 text-right">Current Value</th>
                <th className="px-4 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredAssets.map((asset) => (
                <tr key={asset.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                  <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">
                    {asset.assetCode}
                  </td>
                  <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">
                    {asset.assetName}
                  </td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{asset.category}</td>
                  <td className="px-4 py-3 text-slate-500">{asset.purchaseDate}</td>
                  <td className="px-4 py-3 text-right font-display text-slate-900 dark:text-white font-medium">
                    {asset.cost.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-400">
                    {asset.depreciationMethod.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-center font-mono">{asset.usefulLifeYears}y</td>
                  <td className="px-4 py-3 text-right font-display text-rose-500">
                    {asset.accumulatedDepreciation.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-right font-display font-bold text-emerald-600 dark:text-emerald-400">
                    {asset.currentValue.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                      {asset.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Add Asset Modal ── */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Add Fixed Asset
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddAsset} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="font-medium text-slate-700 dark:text-slate-300">Asset Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Generator 50kVA Perkins"
                  value={assetName}
                  onChange={(e) => setAssetName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="Motor Vehicles">Motor Vehicles</option>
                    <option value="Machinery">Machinery</option>
                    <option value="IT Equipment">IT Equipment</option>
                    <option value="Fixtures & Fittings">Fixtures & Fittings</option>
                    <option value="Buildings">Buildings</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Purchase Date *</label>
                  <input
                    type="date"
                    required
                    value={purchaseDate}
                    onChange={(e) => setPurchaseDate(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Acquisition Cost ({currentCurrency}) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={cost || ""}
                    onChange={(e) => setCost(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Salvage Value ({currentCurrency})</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={salvageValue || ""}
                    onChange={(e) => setSalvageValue(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Depreciation Method</label>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as DepreciationMethod)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <option value="straight_line">Straight-Line Method</option>
                    <option value="reducing_balance">Reducing Balance Method</option>
                    <option value="none">No Depreciation</option>
                  </select>
                </div>
                <div>
                  <label className="font-medium text-slate-700 dark:text-slate-300">Useful Life (Years)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={usefulLife}
                    onChange={(e) => setUsefulLife(parseInt(e.target.value) || 5)}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-blue-600 dark:border-slate-700 dark:bg-slate-800"
                  />
                </div>
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
                  Add Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Run Depreciation Modal ── */}
      {isDeprModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Calculator className="h-4 w-4 text-emerald-600" />
                <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Post Automated Depreciation
                </h3>
              </div>
              <button onClick={() => setIsDeprModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-xs">
              <p className="text-slate-500 leading-relaxed">
                This will calculate the scheduled depreciation across all active fixed assets and automatically create a posted General Ledger journal entry:
                <br />
                <span className="font-mono text-[11px] text-blue-600 dark:text-blue-400 font-semibold">
                  Dr Depreciation Expense / Cr Accumulated Depreciation
                </span>
              </p>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300">Period Duration</label>
                <select
                  value={deprMonths}
                  onChange={(e) => setDeprMonths(parseInt(e.target.value) || 1)}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs outline-none focus:border-emerald-600 dark:border-slate-700 dark:bg-slate-800"
                >
                  <option value={1}>1 Month (Monthly Accrual)</option>
                  <option value={3}>3 Months (Quarterly Accrual)</option>
                  <option value={6}>6 Months (Half-Year Accrual)</option>
                  <option value={12}>12 Months (Annual Depreciation)</option>
                </select>
              </div>

              {deprResult && (
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-700 font-medium text-xs dark:bg-emerald-950/60 dark:text-emerald-300">
                  <CheckCircle2 className="inline h-4 w-4 mr-1.5" />
                  Successfully posted depreciation: <b>{currentCurrency} {deprResult.totalDepreciation.toLocaleString()}</b>.
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsDeprModalOpen(false)}
                  className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleRunDepreciation}
                  className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 shadow-sm"
                >
                  Calculate & Post
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
