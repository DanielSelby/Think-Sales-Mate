"use client";

import { useState, useRef } from "react";
import { X, Upload, Download, FileSpreadsheet, CheckCircle2, AlertCircle } from "lucide-react";
import Papa from "papaparse";
import { Button } from "@/components/ui/button";
import type { ManagedUser, RoleDefinition, UserBranch } from "../types";

interface ImportOutcome {
  invited: number;
  skipped: { row: number; reason: string }[];
}

interface ImportUsersModalProps {
  isOpen: boolean;
  onClose: () => void;
  branches: UserBranch[];
  roles: RoleDefinition[];
  onImportUsers: (newUsers: (Partial<ManagedUser> & { sourceRow: number })[]) => Promise<ImportOutcome>;
}

interface ParsedUserRow {
  rowNumber: number;
  fullName: string;
  email: string;
  phone: string;
  employeeId: string;
  role: string;
  department: string;
  branch: string;
  roleKey: string;
  branchId: string | null;
  isValid: boolean;
  isImported: boolean;
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
  const [parseError, setParseError] = useState<string | null>(null);
  const [importOutcome, setImportOutcome] = useState<ImportOutcome | null>(null);
  const [successfulCount, setSuccessfulCount] = useState(0);

  if (!isOpen) return null;

  const downloadSampleCsv = () => {
    const headers = ["Full Name", "Email Address", "Phone Number", "Employee ID", "Role", "Department", "Branch"];
    const csvContent = `${headers.join(",")}\n`;
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "users_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  const processCsvText = (text: string) => {
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true });
    if (parsed.errors.length) {
      setParseError(`Could not parse CSV: ${parsed.errors[0].message}`);
      return;
    }
    if (parsed.data.length < 2) {
      setParseError("The CSV must contain a header row and at least one user row.");
      return;
    }

    const seenEmails = new Set<string>();
    const results: ParsedUserRow[] = parsed.data.slice(1).map((parts, idx) => {
      const [fullName = "", email = "", phone = "", employeeId = "", role = "", department = "", branch = ""] =
        parts.map((part) => String(part ?? "").trim());

      const errors: string[] = [];
      if (!fullName) errors.push("Missing full name");
      const normalizedEmail = email.toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) errors.push("Invalid email address");
      if (normalizedEmail && seenEmails.has(normalizedEmail)) errors.push("Duplicate email in CSV");
      if (normalizedEmail) seenEmails.add(normalizedEmail);
      const matchedRole = roles.find((candidate) =>
        candidate.name.toLowerCase() === role.toLowerCase() || candidate.key.toLowerCase() === role.toLowerCase()
      );
      if (!matchedRole) errors.push("Role does not match a configured role");
      const matchedBranch = branch
        ? branches.find((candidate) => candidate.name.toLowerCase() === branch.toLowerCase())
        : undefined;
      if (branch && !matchedBranch) errors.push("Branch does not match an active organization branch");

      return {
        rowNumber: idx + 2,
        fullName,
        email: normalizedEmail,
        phone,
        employeeId,
        role,
        department,
        branch,
        roleKey: matchedRole?.key ?? "",
        branchId: matchedBranch?.id ?? null,
        isValid: errors.length === 0,
        isImported: false,
        errors
      };
    });

    if (!results.length) {
      setParseError("The CSV contains no user rows.");
      return;
    }
    setParseError(null);
    setImportOutcome(null);
    setSuccessfulCount(0);
    setParsedRows(results);
    setStep("preview");
  };

  const handleFile = (file: File) => {
    setFileName(file.name);
    setParsedRows([]);
    setParseError(null);
    setImportOutcome(null);
    setStep("upload");
    const reader = new FileReader();
    reader.onload = (e) => {
      processCsvText(String(e.target?.result || ""));
    };
    reader.onerror = () => setParseError("The selected CSV file could not be read.");
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleImportSubmit = async () => {
    const validRows = parsedRows.filter((r) => r.isValid && !r.isImported);
    if (validRows.length === 0) return;

    setIsProcessing(true);
    try {
      const newUsers = validRows.map((row) => ({
        name: row.fullName,
        fullName: row.fullName,
        email: row.email,
        phone: row.phone,
        employeeId: row.employeeId,
        role: row.roleKey,
        roleLabel: row.role,
        status: "pending" as const,
        department: row.department,
        locationId: row.branchId,
        locationName: branches.find((branch) => branch.id === row.branchId)?.name ?? null,
        secondaryBranches: [],
        secondaryBranchNames: [],
        branchScope: row.branchId ? "single" as const : "assigned" as const,
        twoFactorEnabled: null,
        joinedAt: new Date().toISOString(),
        lastSignInAt: null,
        isSelf: false,
        sourceRow: row.rowNumber
      }));
      const result = await onImportUsers(newUsers);
      const failureByRow = new Map(result.skipped.map((item) => [item.row, item.reason]));
      const importedRows = new Set(validRows.filter((row) => !failureByRow.has(row.rowNumber)).map((row) => row.rowNumber));
      setParsedRows((previous) => previous.map((row) => {
        const failure = failureByRow.get(row.rowNumber);
        if (failure) return { ...row, isValid: false, errors: [...row.errors, failure] };
        return importedRows.has(row.rowNumber) ? { ...row, isImported: true } : row;
      }));
      setSuccessfulCount((previous) => previous + result.invited);
      setImportOutcome(result);
      if (result.skipped.length === 0 && parsedRows.every((row) => row.isValid)) onClose();
    } catch (error) {
      setParseError(error instanceof Error ? error.message : "User import failed.");
    } finally {
      setIsProcessing(false);
    }
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
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Import Users (CSV)</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Bulk invite members to this organization</p>
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
          {parseError && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
              {parseError}
            </p>
          )}
          {importOutcome && (
            <div role="status" className="rounded-lg border border-ledger-200 bg-slate-50 px-3 py-2 text-xs text-ledger-700 dark:border-ledger-700 dark:bg-slate-800 dark:text-ledger-200">
              Invited {successfulCount} user(s). {importOutcome.skipped.length} row(s) failed.
              {importOutcome.skipped.length > 0 && (
                <ul className="mt-2 list-inside list-disc">
                  {importOutcome.skipped.map((item) => (
                    <li key={`${item.row}-${item.reason}`}>Row {item.row}: {item.reason}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
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
                  {parsedRows.filter((r) => r.isValid && !r.isImported).length} valid rows ready to invite, {parsedRows.filter((r) => !r.isValid).length} invalid rows
                  </p>
                </div>
                <Button size="sm" variant="ghost" onClick={() => { setStep("upload"); setParsedRows([]); setFileName(null); setParseError(null); setImportOutcome(null); }} className="text-xs h-7">
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
                      <tr key={row.rowNumber} className={row.isValid || row.isImported ? "" : "bg-red-50/50 dark:bg-red-950/20"}>
                        <td className="p-2.5">
                          {row.isImported ? (
                            <span className="flex items-center gap-1 text-emerald-600 font-semibold text-[10px]">
                              <CheckCircle2 className="h-3.5 w-3.5" /> Invited
                            </span>
                          ) : row.isValid ? (
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
              disabled={isProcessing || parsedRows.filter((r) => r.isValid && !r.isImported).length === 0}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isProcessing ? "Sending invitations..." : `Invite ${parsedRows.filter((r) => r.isValid && !r.isImported).length} Users`}
            </Button>
          )}
        </div>

      </div>
    </div>
  );
}
