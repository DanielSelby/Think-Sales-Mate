"use client";

import { useState, useRef } from "react";
import { X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManagedUser, RoleDefinition, UserBranch } from "../types";

interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: UserBranch[];
  roles: RoleDefinition[];
  onImportUsers: (newUsers: Partial<ManagedUser>[]) => void;
}

interface ParsedUserRow {
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  role: string;
  department: string;
  branch: string;
  isValid: boolean;
  errors: string[];
}

export function ImportUsersModal({
  isOpen,
  onClose,
  branches,
  roles,
  onImportUsers
}: ImportUsersModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedUserRow[]>([]);
  const [step, setStep] = useState<"upload" | "preview">("upload");
  const [isProcessing, setIsProcessing] = useState(false);

  if (!isOpen) return null;

  const downloadSampleCsv = () => {
    const headers = ["Full Name", "Email Address", "Phone Number", "Employee ID", "Role", "Department", "Branch"];
    const rows = [
      ["Kwame Mensah", "kwame.m@thinksales.com", "+233 24 123 4567", "TS-EMP-020", "Sales Associate", "Sales & Marketing", "Accra Main Branch"],
      ["Ama Serwaa", "ama.s@thinksales.com", "+233 50 234 5678", "TS-EMP-021", "Cashier", "Sales & Marketing", "Kumasi Branch"],
      ["Kofi Antwi", "kofi.a@thinksales.com", "+233 27 345 6789", "TS-EMP-022", "Inventory Clerk", "Inventory & Warehouse", "Tema Branch"]
    ];

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "thinksales_users_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const processCsvText = (text: string) => {
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    if (lines.length < 2) return;

    const dataRows = lines.slice(1);
    const results: ParsedUserRow[] = dataRows.map((line, idx) => {
      const parts = line.split(",").map((p) => p.trim().replace(/^"|"$/g, ""));
      const [fullName = "", email = "", phone = "", employeeId = "", role = "Sales Associate", department = "Sales & Marketing", branch = "Head Office"] = parts;

      const errors: string[] = [];
      if (!fullName) errors.push("Missing full name");
      if (!email || !email.includes("@")) errors.push("Invalid email address");

      return {
        fullName: fullName || `User ${idx + 1}`,
        email: email || "",
        phone: phone || "+233 24 000 0000",
        employeeId: employeeId || `TS-EMP-0${50 + idx}`,
        role,
        department,
        branch,
        isValid: errors.length === 0,
        errors
      };
    });

    setParsedRows(results);
    setStep("preview");
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      processCsvText(String(e.target?.result || ""));
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleImportSubmit = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setIsProcessing(true);
    const newUsers: Partial<ManagedUser>[] = validRows.map((row) => {
      const matchedBranch = branches.find(
        (b) => b.name.toLowerCase() === row.branch.toLowerCase()
      ) || branches[0];

      const matchedRole = roles.find(
        (r) => r.name.toLowerCase() === row.role.toLowerCase() || r.key === row.role.toLowerCase()
      ) || roles[2]; // Default to Sales Associate

      return {
        name: row.fullName,
        fullName: row.fullName,
        email: row.email.toLowerCase(),
        phone: row.phone,
        employeeId: row.employeeId,
        role: matchedRole.key,
        roleLabel: matchedRole.name,
        status: "pending",
        department: row.department,
        locationId: matchedBranch.id,
        locationName: matchedBranch.name,
        secondaryBranches: [],
        secondaryBranchNames: [],
        branchScope: "single",
        twoFactorEnabled: false,
        joinedAt: new Date().toISOString(),
        lastSignInAt: null,
        isSelf: false,
        approvalPermissions: {
          stockTransfers: false,
          purchases: false,
          expenses: false,
          priceUpdates: false,
          stockAdjustments: false
        }
      };
    });

    setTimeout(() => {
      onImportUsers(newUsers);
      setIsProcessing(false);
      onClose();
    }, 500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400">
              <Upload className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Import Users (CSV / Excel)</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Bulk upload employees, roles, branches and system accounts</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) handleFile(e.target.files[0]);
          }}
        />

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === "upload" ? (
            <div className="space-y-4">
              
              {/* Dropzone */}
              <div
                onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-all ${
                  dragActive
                    ? "border-emerald-500 bg-emerald-50/50 dark:border-emerald-400 dark:bg-emerald-950/40"
                    : "border-ledger-200 hover:border-emerald-500 hover:bg-slate-50 dark:border-ledger-700 dark:hover:border-emerald-400 dark:hover:bg-slate-800/40"
                }`}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300 mb-3">
                  <FileSpreadsheet className="h-7 w-7" />
                </div>
                <p className="text-sm font-bold text-ink-900 dark:text-white">
                  Click to choose CSV file or drag and drop here
                </p>
                <p className="text-xs text-ledger-400 mt-1">
                  Supports UTF-8 CSV files with header column names
                </p>
              </div>

              {/* Download Template Bar */}
              <div className="flex items-center justify-between p-4 rounded-xl border border-ledger-100 bg-slate-50/50 dark:border-ledger-800 dark:bg-slate-800/40">
                <div className="flex items-center gap-3">
                  <Download className="h-4 w-4 text-emerald-600" />
                  <div>
                    <p className="text-xs font-semibold text-ink-900 dark:text-white">Need the template format?</p>
                    <p className="text-[11px] text-ledger-400">Download our sample CSV template with prefilled column definitions</p>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={downloadSampleCsv} className="h-8 text-xs">
                  Download CSV Template
                </Button>
              </div>

            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">
                    File: <span className="text-ink-900 dark:text-white font-mono">{fileName}</span> ({parsedRows.length} rows detected)
                  </h3>
                  <p className="text-[11px] text-ledger-400">
                    {parsedRows.filter((r) => r.isValid).length} valid rows ready to import, {parsedRows.filter((r) => !r.isValid).length} invalid rows
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setStep("upload"); setParsedRows([]); }} className="text-xs h-7">
                  Change File
                </Button>
              </div>

              {/* Preview Table */}
              <div className="rounded-xl border border-ledger-100 dark:border-ledger-800 overflow-x-auto max-h-64">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-left font-bold text-ledger-400 border-b border-ledger-100 dark:bg-slate-800/60 dark:border-ledger-800">
                    <tr>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Full Name</th>
                      <th className="p-2.5">Email</th>
                      <th className="p-2.5">Employee ID</th>
                      <th className="p-2.5">Role</th>
                      <th className="p-2.5">Branch</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? "" : "bg-red-50/50 dark:bg-red-950/20"}>
                        <td className="p-2.5">
                          {row.isValid ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[10px]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-red-600 font-semibold text-[10px]" title={row.errors.join(", ")}>
                              <AlertCircle className="h-3.5 w-3.5" /> Error
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-semibold text-ink-900 dark:text-white">{row.fullName}</td>
                        <td className="p-2.5 font-mono text-ledger-500">{row.email}</td>
                        <td className="p-2.5 font-mono text-ledger-500">{row.employeeId}</td>
                        <td className="p-2.5">{row.role}</td>
                        <td className="p-2.5">{row.branch}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {step === "preview" && (
            <Button
              size="sm"
              onClick={handleImportSubmit}
              disabled={isProcessing || parsedRows.filter((r) => r.isValid).length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isProcessing ? "Importing Accounts..." : `Import ${parsedRows.filter((r) => r.isValid).length} Users`}
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
