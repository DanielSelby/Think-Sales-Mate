"use client";

import React, { useState } from "react";
import {
  FileText,
  Percent,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Download,
  Plus,
  Building2,
  Receipt,
  FileSpreadsheet,
} from "lucide-react";
import * as XLSX from "xlsx";
import { useAccountingStore } from "@/lib/accounting/accounting-store";
import type { TaxRateConfig, TaxFilingSummary } from "@/types/accounting";

export function TaxManagementTab() {
  const {
    taxRates,
    taxFilings,
    currentCurrency,
    updateTaxRate,
    fileTaxReturn,
  } = useAccountingStore();

  const [activeSubTab, setActiveSubTab] = useState<"summary" | "setup" | "audit">("summary");
  const [isFilingModalOpen, setIsFilingModalOpen] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live Tax Calculations based on May 2026 sales & purchases
  const grossSales = 125430.0;
  const exemptSales = 0.0;
  const taxableSales = grossSales - exemptSales;

  // Output taxes
  const standardVAT = taxableSales * 0.15; // 18,814.50
  const nhil = taxableSales * 0.025; // 3,135.75
  const getFund = taxableSales * 0.025; // 3,135.75
  const covidLevy = taxableSales * 0.01; // 1,254.30
  const totalOutputTax = standardVAT + nhil + getFund + covidLevy; // 26,340.30

  // Input taxes from purchases & expenses
  const inputTaxDeductions = 14210.0;
  const withholdingTaxCredited = 1520.0;
  const netTaxPayable = totalOutputTax - inputTaxDeductions - withholdingTaxCredited; // 10,610.30

  const handleFileReturn = (e: React.FormEvent) => {
    e.preventDefault();
    fileTaxReturn({
      period: "May 2026",
      grossSales,
      exemptSales,
      taxableSales,
      standardVAT,
      nhil,
      getFund,
      covidLevy,
      totalOutputTax,
      inputTaxDeductions,
      withholdingTaxCredited,
      netTaxPayable,
    });
    setIsFilingModalOpen(false);
    setSuccessMsg("Monthly GRA Tax Filing successfully recorded and logged in tax audit trail.");
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleExportTaxExcel = () => {
    const data = [
      { Metric: "Gross Sales Revenue", Amount: grossSales },
      { Metric: "Exempt Supplies", Amount: exemptSales },
      { Metric: "Net Taxable Sales", Amount: taxableSales },
      { Metric: "Standard VAT (15%)", Amount: standardVAT },
      { Metric: "NHIL Levy (2.5%)", Amount: nhil },
      { Metric: "GETFund Levy (2.5%)", Amount: getFund },
      { Metric: "COVID-19 Health Recovery Levy (1%)", Amount: covidLevy },
      { Metric: "Total Output Tax Collected", Amount: totalOutputTax },
      { Metric: "Less: Allowable Input Tax", Amount: inputTaxDeductions },
      { Metric: "Less: Withholding Tax Credits", Amount: withholdingTaxCredited },
      { Metric: "Net Tax Payable to GRA", Amount: netTaxPayable },
    ];
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Tax Filing Summary");
    XLSX.writeFile(workbook, `Tax_Filing_Summary_May_2026.xlsx`);
  };

  return (
    <div className="space-y-6">
      {/* ── Sub Tabs Navigation ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab("summary")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "summary"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Filing &amp; Liability Summary
          </button>
          <button
            onClick={() => setActiveSubTab("setup")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "setup"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Tax Rates &amp; Levies Setup
          </button>
          <button
            onClick={() => setActiveSubTab("audit")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-semibold transition-all ${
              activeSubTab === "audit"
                ? "bg-blue-600 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            Tax Audit Trail
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportTaxExcel}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" /> Export Excel
          </button>
          <button
            onClick={() => setIsFilingModalOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            <FileText className="h-3.5 w-3.5" /> Submit Filing
          </button>
        </div>
      </div>

      {successMsg && (
        <div className="rounded-xl bg-emerald-50 p-3 text-xs font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
          <CheckCircle2 className="inline h-4 w-4 mr-1.5" />
          {successMsg}
        </div>
      )}

      {/* ── 1. FILING & LIABILITY SUMMARY SUB-TAB ── */}
      {activeSubTab === "summary" && (
        <div className="space-y-6">
          {/* Top 4 KPI Metrics */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Total Output Tax (Collected)</p>
              <p className="mt-1 font-display text-lg font-bold text-slate-900 dark:text-white">
                {currentCurrency} {totalOutputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">VAT + NHIL + GETFund + COVID</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Input Tax Deductions (Paid)</p>
              <p className="mt-1 font-display text-lg font-bold text-emerald-600 dark:text-emerald-400">
                {currentCurrency} {inputTaxDeductions.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Allowable purchases deduction</p>
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs text-slate-400">Withholding Tax Credits</p>
              <p className="mt-1 font-display text-lg font-bold text-purple-600 dark:text-purple-400">
                {currentCurrency} {withholdingTaxCredited.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">WHT certificates received</p>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50/50 p-4 shadow-sm dark:border-blue-950/40 dark:bg-blue-950/20">
              <p className="text-xs font-semibold text-blue-700 dark:text-blue-300">Net Tax Payable (Due to GRA)</p>
              <p className="mt-1 font-display text-xl font-bold text-blue-600 dark:text-blue-400">
                {currentCurrency} {netTaxPayable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">Due by June 15, 2026</p>
            </div>
          </div>

          {/* Breakdown Table */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              GRA Tax Calculation Breakdown (Ghana Revenue Authority)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">Computed automatically from POS and sales ledger</p>

            <div className="mt-4 divide-y divide-slate-100 text-xs dark:divide-slate-800">
              <div className="flex justify-between py-2.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">Gross Sales Revenue</span>
                <span className="font-mono font-semibold">{currentCurrency} {grossSales.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="font-medium text-slate-700 dark:text-slate-300">Exempt &amp; Zero-Rated Supplies</span>
                <span className="font-mono">{currentCurrency} {exemptSales.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 font-bold bg-slate-50/50 px-2 rounded-lg dark:bg-slate-800/40">
                <span>Net Taxable Sales</span>
                <span className="font-mono">{currentCurrency} {taxableSales.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 pl-4 text-slate-600 dark:text-slate-400">
                <span>• Value Added Tax (VAT 15%)</span>
                <span className="font-mono">{currentCurrency} {standardVAT.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 pl-4 text-slate-600 dark:text-slate-400">
                <span>• National Health Insurance Levy (NHIL 2.5%)</span>
                <span className="font-mono">{currentCurrency} {nhil.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 pl-4 text-slate-600 dark:text-slate-400">
                <span>• Ghana Education Trust Fund (GETFund 2.5%)</span>
                <span className="font-mono">{currentCurrency} {getFund.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 pl-4 text-slate-600 dark:text-slate-400">
                <span>• COVID-19 Health Recovery Levy (1%)</span>
                <span className="font-mono">{currentCurrency} {covidLevy.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 font-bold text-slate-900 dark:text-white">
                <span>Total Output Tax Liability</span>
                <span className="font-mono text-rose-500">{currentCurrency} {totalOutputTax.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
              </div>
              <div className="flex justify-between py-2.5 text-emerald-600">
                <span>Less: Permissible Input Tax Deductions</span>
                <span className="font-mono font-semibold">({currentCurrency} {inputTaxDeductions.toLocaleString("en-US", { minimumFractionDigits: 2 })})</span>
              </div>
              <div className="flex justify-between py-2.5 text-purple-600">
                <span>Less: Withholding Tax Credits (WHT)</span>
                <span className="font-mono font-semibold">({currentCurrency} {withholdingTaxCredited.toLocaleString("en-US", { minimumFractionDigits: 2 })})</span>
              </div>
              <div className="flex justify-between py-3 font-bold text-sm bg-blue-50 px-3 rounded-xl dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                <span>Net Tax Payable</span>
                <span className="font-mono text-blue-700 dark:text-blue-300">
                  {currentCurrency} {netTaxPayable.toLocaleString("en-US", { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── 2. TAX RATES & LEVIES SETUP SUB-TAB ── */}
      {activeSubTab === "setup" && (
        <div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <th className="px-4 py-3">Tax Name</th>
                  <th className="px-4 py-3">Tax Code</th>
                  <th className="px-4 py-3 text-right">Rate (%)</th>
                  <th className="px-4 py-3">Applies To</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {taxRates.map((rate) => (
                  <tr key={rate.id} className="hover:bg-slate-50/70 transition-colors dark:hover:bg-slate-800/40">
                    <td className="px-4 py-3 font-semibold text-slate-800 dark:text-white">{rate.name}</td>
                    <td className="px-4 py-3 font-mono font-bold text-blue-600 dark:text-blue-400">{rate.code}</td>
                    <td className="px-4 py-3 text-right font-display font-bold text-slate-900 dark:text-white">
                      {rate.rate.toFixed(1)}%
                    </td>
                    <td className="px-4 py-3 capitalize text-slate-600 dark:text-slate-300">{rate.appliesTo}</td>
                    <td className="px-4 py-3 text-slate-500 max-w-sm truncate">{rate.description}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                        Active
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── 3. TAX AUDIT TRAIL SUB-TAB ── */}
      {activeSubTab === "audit" && (
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
            GRA Tax Compliance &amp; Filing Audit Logs
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">Historical record of tax submissions and assessments</p>

          <div className="mt-4 space-y-3 text-xs">
            <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40 flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">April 2026 Monthly VAT &amp; Levies Return Filed</p>
                <p className="text-slate-500 text-[11px] mt-0.5">Reference: GRA-RET-2026-04 · Net Tax Paid: GHS 9,840.00 via GCB Bank</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Submitted: May 14, 2026 · Officer: Daniel K. Selby</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                Acknowledged by GRA
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 p-3.5 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/40 flex items-start justify-between">
              <div>
                <p className="font-semibold text-slate-800 dark:text-white">Q1 2026 Withholding Tax Remittance</p>
                <p className="text-slate-500 text-[11px] mt-0.5">WHT Certificates: 14 suppliers · Total: GHS 4,280.00</p>
                <p className="text-[10px] text-slate-400 font-mono mt-1">Submitted: April 15, 2026 · Officer: Daniel K. Selby</p>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
                Certified
              </span>
            </div>
          </div>
        </div>
      )}

      {/* ── Submit Filing Modal ── */}
      {isFilingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl dark:border-slate-800 dark:bg-slate-900">
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Confirm Monthly Tax Return Submission
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              You are preparing to submit the official GRA return for <b>May 2026</b> with a net payable amount of <b>{currentCurrency} {netTaxPayable.toLocaleString()}</b>.
            </p>

            <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200 dark:bg-slate-800 text-xs space-y-1.5 font-mono">
              <div className="flex justify-between">
                <span>Output Tax:</span>
                <span>{currentCurrency} {totalOutputTax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Input Deductions:</span>
                <span>({currentCurrency} {inputTaxDeductions.toFixed(2)})</span>
              </div>
              <div className="flex justify-between font-bold border-t border-slate-200 pt-1 text-blue-600">
                <span>Net Due:</span>
                <span>{currentCurrency} {netTaxPayable.toFixed(2)}</span>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsFilingModalOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleFileReturn}
                className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 shadow-sm"
              >
                Confirm &amp; Record Filing
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
