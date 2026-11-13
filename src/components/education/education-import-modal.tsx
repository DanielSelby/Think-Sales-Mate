"use client";

import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { CheckCircle2, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { importEducationRecords, type EducationImportEntity } from "@/app/(dashboard)/education/actions";

export interface EducationImportColumn {
  key: string;
  label: string;
  required?: boolean;
}

interface ImportResult {
  created: number;
  skipped: Array<{ row: number; reason: string }>;
}

interface EducationImportModalProps {
  entity: EducationImportEntity;
  label: string;
  columns: EducationImportColumn[];
}

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export function EducationImportModal({ entity, label, columns }: EducationImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const reset = () => {
    setFileName("");
    setRows([]);
    setError(null);
    setResult(null);
    setIsOpen(false);
  };

  const downloadTemplate = (format: "csv" | "xlsx") => {
    const data = [columns.map((column) => column.label)];
    if (format === "csv") {
      const csv = data[0].map((cell) => `"${cell.replace(/"/g, '""')}"`).join(",");
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `think-education-${entity}-template.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      return;
    }
    const sheet = XLSX.utils.aoa_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Import");
    XLSX.writeFile(workbook, `think-education-${entity}-template.xlsx`);
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setRows([]);
    setError(null);
    setResult(null);
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a file smaller than 5 MB.");
      return;
    }
    if (!/\.(csv|xlsx|xls)$/i.test(file.name)) {
      setError("Choose a CSV or Excel file (.csv, .xlsx, or .xls).");
      return;
    }
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!firstSheet) {
        setError("The selected file does not contain a worksheet.");
        return;
      }
      const data = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: "", raw: false });
      if (data.length < 2) {
        setError("The file must contain a header row and at least one record.");
        return;
      }
      const headers = data[0].map((value) => normalizeHeader(String(value ?? "")));
      const indexes = new Map<string, number>();
      columns.forEach((column) => {
        const index = headers.findIndex((header) =>
          header === normalizeHeader(column.key) || header === normalizeHeader(column.label)
        );
        if (index >= 0) indexes.set(column.key, index);
      });
      const missingHeaders = columns.filter((column) => column.required && !indexes.has(column.key));
      if (missingHeaders.length) {
        setError(`Missing required columns: ${missingHeaders.map((column) => column.label).join(", ")}.`);
        return;
      }
      const parsedRows = data.slice(1).map((parts) => Object.fromEntries(columns.map((column) => [
        column.key,
        String(parts[indexes.get(column.key) ?? -1] ?? "").trim(),
      ]))).filter((row) => Object.values(row).some(Boolean));
      if (!parsedRows.length) {
        setError("The file does not contain any non-empty records.");
        return;
      }
      if (parsedRows.length > 500) {
        setError("Import up to 500 records at a time.");
        return;
      }
      const missingValues = parsedRows.findIndex((row) =>
        columns.some((column) => column.required && !row[column.key])
      );
      if (missingValues >= 0) {
        setError(`Row ${missingValues + 2} is missing a required value.`);
        return;
      }
      setRows(parsedRows);
    } catch (parseError) {
      setError(parseError instanceof Error ? `Could not read the file: ${parseError.message}` : "Could not read the selected file.");
    }
  };

  const importRows = async () => {
    setError(null);
    setIsImporting(true);
    try {
      const outcome = await importEducationRecords(entity, rows);
      setResult(outcome);
      if (outcome.skipped.length === 0) setRows([]);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "The records could not be imported.");
    } finally {
      setIsImporting(false);
    }
  };

  return <>
    <button type="button" onClick={() => setIsOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
      <Upload className="h-4 w-4" /> Import {label}
    </button>
    {isOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <section role="dialog" aria-modal="true" aria-labelledby="education-import-title" className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><FileSpreadsheet className="h-5 w-5" /></span>
            <div>
              <h2 id="education-import-title" className="font-semibold text-slate-950">Import {label}</h2>
              <p className="mt-0.5 text-xs text-slate-500">Upload CSV or Excel, review the rows, then import up to 500 records.</p>
            </div>
          </div>
          <button type="button" onClick={reset} aria-label="Close import dialog" className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 space-y-4 overflow-y-auto p-5">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
          {result && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
            <p className="flex items-center gap-2 font-semibold"><CheckCircle2 className="h-4 w-4" /> Created {result.created} record(s); {result.skipped.length} row(s) skipped.</p>
            {result.skipped.length > 0 && <ul className="mt-2 list-inside list-disc">
              {result.skipped.map((item) => <li key={`${item.row}-${item.reason}`}>Row {item.row}: {item.reason}</li>)}
            </ul>}
          </div>}
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => downloadTemplate("csv")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Download className="h-4 w-4" /> CSV template</button>
            <button type="button" onClick={() => downloadTemplate("xlsx")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-50"><Download className="h-4 w-4" /> Excel template</button>
            <button type="button" onClick={() => fileInputRef.current?.click()} className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-800"><Upload className="h-4 w-4" /> Choose file</button>
            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }} />
            {fileName && <span className="self-center text-sm text-slate-500">{fileName}</span>}
          </div>

          {rows.length > 0 && <div className="overflow-x-auto rounded-lg border border-slate-200">
            <p className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">Preview: {rows.length} row(s)</p>
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="bg-white text-slate-500"><tr>{columns.map((column) => <th key={column.key} className="px-3 py-2 font-semibold">{column.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-slate-100">{rows.slice(0, 5).map((row, index) => <tr key={index}>
                {columns.map((column) => <td key={column.key} className="max-w-56 truncate px-3 py-2 text-slate-700">{row[column.key] || "—"}</td>)}
              </tr>)}</tbody>
            </table>
            {rows.length > 5 && <p className="border-t border-slate-100 px-3 py-2 text-xs text-slate-500">Showing the first five rows.</p>}
          </div>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-slate-100 p-4">
          <button type="button" onClick={reset} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">Close</button>
          <button type="button" onClick={() => void importRows()} disabled={!rows.length || isImporting} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
            {isImporting ? "Importing…" : `Import ${rows.length || ""} records`}
          </button>
        </footer>
      </section>
    </div>}
  </>;
}
