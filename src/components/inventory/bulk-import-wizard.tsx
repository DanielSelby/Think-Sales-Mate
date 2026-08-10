"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  X,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  History,
  FileDown,
  Loader2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { parseImportFile, buildTemplateCsv, TEMPLATE_COLUMNS } from "@/lib/inventory/import-parser";
import {
  getImportReferenceData,
  commitProductImport,
  getImportHistory,
  type ImportReferenceData,
  type ImportRowInput,
  type ImportBatchRow
} from "@/app/(dashboard)/inventory/import/actions";

type RowStatus = "valid" | "warning" | "error";

interface PreviewRow extends ImportRowInput {
  status: RowStatus;
  issues: string[];
  previewSku: string;
}

function num(value: string): number {
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

function skuPreviewPrefix(category: string | null) {
  const source = (category ?? "").toUpperCase().replace(/[^A-Z]/g, "");
  return source.length >= 3 ? source.slice(0, 4) : "PRD";
}

export function BulkImportWizard() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [reference, setReference] = useState<ImportReferenceData | null>(null);
  const [importing, setImporting] = useState(false);
  const [importSummary, setImportSummary] = useState<{ imported: number; skipped: number; errorCount: number } | null>(
    null
  );
  const [history, setHistory] = useState<ImportBatchRow[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    getImportReferenceData().then(setReference);
  }, []);

  function downloadTemplate() {
    const csv = buildTemplateCsv();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "SalesMate_Products_Import_Template.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleFile(selected: File) {
    setFile(selected);
    setParseError(null);
    setParsing(true);
    setImportSummary(null);
    try {
      const raw = await parseImportFile(selected);
      if (raw.length === 0) {
        setParseError("No data rows found in that file. Make sure you filled in the template below the header row.");
        setParsing(false);
        return;
      }
      const ref = reference ?? (await getImportReferenceData());
      if (!reference) setReference(ref);

      const seenSkuCandidates = new Set<string>();
      const seenBarcodesInFile = new Set<string>();

      const built: PreviewRow[] = raw.map((r, i) => {
        const issues: string[] = [];
        const name = (r.name ?? "").trim();
        const barcode = (r.barcode ?? "").trim() || null;
        const category = (r.category ?? "").trim() || null;
        const brand = (r.brand ?? "").trim() || null;
        const description = (r.description ?? "").trim() || null;
        const costPrice = r.costPrice ? num(r.costPrice) : null;
        const sellingPrice = num(r.sellingPrice ?? "");
        const taxPercent = r.tax ? num(r.tax) : 0;
        const openingStock = r.openingStock ? num(r.openingStock) : 0;
        const minStock = r.minStock ? num(r.minStock) : 0;
        const supplier = (r.supplier ?? "").trim() || null;
        const locationNames = (r.locations ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
        const statusText = (r.status ?? "active").trim().toLowerCase();
        const isActive = statusText !== "inactive";

        if (!name) issues.push("Missing product name");
        if (Number.isNaN(sellingPrice) || sellingPrice < 0) issues.push("Invalid selling price");
        if (costPrice !== null && (Number.isNaN(costPrice) || costPrice < 0)) issues.push("Invalid cost price");
        if (Number.isNaN(openingStock) || openingStock < 0) issues.push("Invalid opening stock");
        if (Number.isNaN(minStock) || minStock < 0) issues.push("Invalid minimum stock level");

        if (barcode) {
          if (ref.existingBarcodes.includes(barcode)) issues.push("Barcode already exists in your catalog");
          if (seenBarcodesInFile.has(barcode)) issues.push("Duplicate barcode within this file");
          seenBarcodesInFile.add(barcode);
        }

        const knownLocationNames = new Set(ref.locations.map((l) => l.name.toLowerCase()));
        const unmatchedLocations = locationNames.filter((n) => !knownLocationNames.has(n.toLowerCase()));
        if (locationNames.length > 0 && unmatchedLocations.length > 0) {
          issues.push(`Unknown location(s): ${unmatchedLocations.join(", ")}`);
        }

        const warnings: string[] = [];
        if (openingStock > 0 && minStock > 0 && openingStock <= minStock) {
          warnings.push("Opening stock is at or below the minimum stock level");
        }
        if (locationNames.length === 0) warnings.push("No location specified — product won't be assigned a warehouse");

        const prefix = skuPreviewPrefix(category);
        const year = new Date().getFullYear();
        let seq = 1;
        let previewSku = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
        while (seenSkuCandidates.has(previewSku)) {
          seq++;
          previewSku = `${prefix}-${year}-${String(seq).padStart(4, "0")}`;
        }
        seenSkuCandidates.add(previewSku);

        const status: RowStatus = issues.length > 0 ? "error" : warnings.length > 0 ? "warning" : "valid";

        return {
          rowNumber: i + 1,
          name,
          barcode,
          category,
          brand,
          description,
          costPrice,
          sellingPrice,
          taxPercent,
          openingStock,
          minStock,
          supplier,
          locationNames,
          isActive,
          status,
          issues: [...issues, ...warnings],
          previewSku
        };
      });

      setRows(built);
      setStep(3);
      setPage(1);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Couldn't read that file.");
    } finally {
      setParsing(false);
    }
  }

  const validCount = rows.filter((r) => r.status === "valid").length;
  const warningCount = rows.filter((r) => r.status === "warning").length;
  const errorCount = rows.filter((r) => r.status === "error").length;
  const importableCount = validCount + warningCount;

  function downloadErrorReport() {
    const errorRows = rows.filter((r) => r.status === "error");
    const headers = ["Row", "Product Name", "Issues"];
    const body = errorRows.map((r) => [String(r.rowNumber), r.name || "(blank)", r.issues.join("; ")]);
    const csv = [headers, ...body]
      .map((line) => line.map((v) => (v.includes(",") ? `"${v.replace(/"/g, '""')}"` : v)).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "import-error-report.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImport() {
    const importable = rows.filter((r) => r.status !== "error");
    if (importable.length === 0) return;
    setImporting(true);
    try {
      const result = await commitProductImport(file?.name ?? "import.csv", importable);
      setImportSummary({ imported: result.imported, skipped: result.skipped, errorCount: result.errorCount });
      setStep(4);
    } finally {
      setImporting(false);
    }
  }

  function startOver() {
    setFile(null);
    setRows([]);
    setParseError(null);
    setImportSummary(null);
    setStep(1);
  }

  async function toggleHistory() {
    if (!showHistory && history === null) {
      const h = await getImportHistory();
      setHistory(h);
    }
    setShowHistory((s) => !s);
  }

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Products &gt; Bulk Import</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Bulk import products</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Import products in bulk using Excel or CSV file.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={toggleHistory}>
            <History className="h-3.5 w-3.5" />
            Import history
          </Button>
          <Link href="/inventory">
            <Button variant="outline">
              <X className="h-3.5 w-3.5" />
              Close
            </Button>
          </Link>
        </div>
      </div>

      {showHistory && (
        <div className="rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Recent imports</h3>
          {history === null ? (
            <p className="mt-2 text-sm text-ledger-400">Loading…</p>
          ) : history.length === 0 ? (
            <p className="mt-2 text-sm text-ledger-400">No imports yet.</p>
          ) : (
            <table className="mt-3 w-full text-xs">
              <thead className="text-left uppercase tracking-wide text-ledger-400">
                <tr>
                  <th className="pb-1.5">File</th>
                  <th className="pb-1.5">Date</th>
                  <th className="pb-1.5 text-right">Imported</th>
                  <th className="pb-1.5 text-right">Skipped</th>
                  <th className="pb-1.5 text-right">Errors</th>
                </tr>
              </thead>
              <tbody>
                {history.map((b) => (
                  <tr key={b.id} className="border-t border-ledger-100 dark:border-ledger-700/50">
                    <td className="py-1.5 text-ink-900 dark:text-white">{b.fileName}</td>
                    <td className="py-1.5 text-ledger-500 dark:text-ledger-400">{new Date(b.createdAt).toLocaleString()}</td>
                    <td className="py-1.5 text-right figure text-signal">{b.importedCount}</td>
                    <td className="py-1.5 text-right figure text-amber">{b.skippedCount}</td>
                    <td className="py-1.5 text-right figure text-alert">{b.errorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Stepper */}
      <div className="flex items-center gap-3 overflow-x-auto rounded-card border border-ledger-100 bg-white px-5 py-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        {[
          { n: 1, label: "Download Template", sub: "Download and fill the template" },
          { n: 2, label: "Upload File", sub: "Upload your filled template" },
          { n: 3, label: "Preview & Validate", sub: "Review and fix any issues" },
          { n: 4, label: "Import", sub: "Import valid products" }
        ].map((s, i, arr) => (
          <div key={s.n} className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                  step >= s.n ? "bg-signal text-white" : "bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]"
                )}
              >
                {s.n}
              </span>
              <div className="hidden sm:block">
                <p className={cn("text-sm font-medium", step >= s.n ? "text-ink-900 dark:text-white" : "text-ledger-400")}>
                  {s.label}
                </p>
                <p className="text-[11px] text-ledger-400">{s.sub}</p>
              </div>
            </div>
            {i < arr.length - 1 && <div className="h-px w-8 shrink-0 bg-ledger-100 dark:bg-ledger-700 sm:w-16" />}
          </div>
        ))}
      </div>

      {step < 3 && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {/* Download template */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">1. Download template</h2>
            <p className="text-xs text-ledger-400">Download the official template and fill it with your product data.</p>

            <div className="mt-4 flex items-center justify-between rounded-md border border-ledger-100 p-3 dark:border-ledger-700">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-6 w-6 text-signal" />
                <div>
                  <p className="text-sm font-medium text-ink-900 dark:text-white">SalesMate_Products_Import_Template.csv</p>
                  <p className="text-xs text-ledger-400">CSV file — opens directly in Excel</p>
                </div>
              </div>
              <Button size="sm" onClick={downloadTemplate}>
                <Download className="h-3.5 w-3.5" />
                Download
              </Button>
            </div>

            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-ledger-400">
              Template columns ({TEMPLATE_COLUMNS.length})
            </p>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-ledger-600 dark:text-ledger-300 sm:grid-cols-3">
              {TEMPLATE_COLUMNS.map((c, i) => (
                <p key={c}>
                  {i + 1}. {c}
                </p>
              ))}
            </div>

            <div className="mt-4 rounded-md bg-signal-soft p-3 text-xs text-ink-900 dark:text-white">
              <p className="font-semibold">Important notes</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-ledger-600 dark:text-ledger-300">
                <li>SKU is auto-generated by the system — do not add a SKU column.</li>
                <li>Product Name and Selling Price are required for every row.</li>
                <li>You can specify multiple locations separated by commas (e.g. "Main Branch, Kumasi Store").</li>
                <li>Status defaults to Active if left blank.</li>
              </ul>
            </div>
          </div>

          {/* Upload file */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">2. Upload file</h2>
            <p className="text-xs text-ledger-400">Upload the completed template file.</p>

            <label
              className="mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-ledger-200 py-10 text-center hover:border-signal dark:border-ledger-700"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) handleFile(dropped);
              }}
            >
              <Upload className="h-6 w-6 text-ledger-400" />
              <p className="text-sm text-ledger-500 dark:text-ledger-400">Drag &amp; drop your file here, or</p>
              <span className="inline-flex h-9 items-center rounded-md bg-signal px-4 text-sm font-medium text-white">
                Choose file
              </span>
              <p className="text-[11px] text-ledger-400">Supported: .xlsx, .xls, .csv — max 10MB</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const selected = e.target.files?.[0];
                  if (selected) handleFile(selected);
                  e.target.value = "";
                }}
              />
            </label>

            {parsing && (
              <p className="mt-3 flex items-center gap-2 text-sm text-ledger-500 dark:text-ledger-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Reading file…
              </p>
            )}
            {parseError && <p className="mt-3 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{parseError}</p>}
            {file && !parsing && !parseError && (
              <div className="mt-3 flex items-center justify-between rounded-md border border-ledger-100 p-2.5 dark:border-ledger-700">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="h-5 w-5 text-signal" />
                  <span className="text-sm text-ink-900 dark:text-white">{file.name}</span>
                </div>
                <CheckCircle2 className="h-4 w-4 text-signal" />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <>
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">3. Preview &amp; validate</h2>
              <Button variant="outline" size="sm" onClick={startOver}>
                Upload a different file
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Total rows" value={rows.length} tone="neutral" />
              <Stat label="Valid" value={validCount} tone="signal" icon={CheckCircle2} />
              <Stat label="Warnings" value={warningCount} tone="amber" icon={AlertTriangle} />
              <Stat label="Errors" value={errorCount} tone="alert" icon={XCircle} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
              <table className="w-full text-xs">
                <thead className="border-b border-ledger-100 bg-ledger-50 text-left uppercase tracking-wide text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                  <tr>
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">Product name</th>
                    <th className="px-2 py-2">Generated SKU</th>
                    <th className="px-2 py-2">Barcode</th>
                    <th className="px-2 py-2">Category</th>
                    <th className="px-2 py-2 text-right">Selling price</th>
                    <th className="px-2 py-2 text-right">Opening stock</th>
                    <th className="px-2 py-2">Location(s)</th>
                    <th className="px-2 py-2">Validation</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((r) => (
                    <tr
                      key={r.rowNumber}
                      className={cn(
                        "border-b border-ledger-50 last:border-0 dark:border-ledger-700/50",
                        r.status === "error" && "bg-alert-soft/40",
                        r.status === "warning" && "bg-amber-soft/40"
                      )}
                    >
                      <td className="px-2 py-2 text-ledger-400">{r.rowNumber}</td>
                      <td className="px-2 py-2 text-ink-900 dark:text-white">{r.name || <span className="text-ledger-400">—</span>}</td>
                      <td className="px-2 py-2 font-mono text-ledger-500 dark:text-ledger-400">
                        {r.status === "error" ? "—" : r.previewSku}
                      </td>
                      <td className="px-2 py-2 font-mono text-ledger-500 dark:text-ledger-400">{r.barcode ?? "—"}</td>
                      <td className="px-2 py-2 text-ledger-600 dark:text-ledger-300">{r.category ?? "—"}</td>
                      <td className="px-2 py-2 text-right figure text-ledger-600 dark:text-ledger-300">
                        {Number.isNaN(r.sellingPrice) ? "—" : r.sellingPrice.toFixed(2)}
                      </td>
                      <td className="px-2 py-2 text-right figure text-ledger-600 dark:text-ledger-300">
                        {Number.isNaN(r.openingStock) ? "—" : r.openingStock}
                      </td>
                      <td className="px-2 py-2 text-ledger-600 dark:text-ledger-300">
                        {r.locationNames.length > 0 ? r.locationNames.join(", ") : "—"}
                      </td>
                      <td className="px-2 py-2">
                        {r.status === "valid" && (
                          <span className="flex items-center gap-1 text-signal">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Valid
                          </span>
                        )}
                        {r.status === "warning" && (
                          <span className="flex items-center gap-1 text-amber" title={r.issues.join("; ")}>
                            <AlertTriangle className="h-3.5 w-3.5" /> {r.issues[0]}
                          </span>
                        )}
                        {r.status === "error" && (
                          <span className="flex items-center gap-1 text-alert" title={r.issues.join("; ")}>
                            <XCircle className="h-3.5 w-3.5" /> {r.issues[0]}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-center gap-2 text-sm">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="rounded-md border border-ledger-200 px-2.5 py-1 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
                >
                  Prev
                </button>
                <span className="text-ledger-500 dark:text-ledger-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="rounded-md border border-ledger-200 px-2.5 py-1 text-ledger-500 disabled:opacity-30 dark:border-ledger-700"
                >
                  Next
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div>
              <p className="text-sm text-ink-900 dark:text-white">
                {errorCount === 0 ? (
                  <span className="flex items-center gap-1.5 text-signal">
                    <CheckCircle2 className="h-4 w-4" /> You're ready to import {importableCount} products.
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-alert">
                    <XCircle className="h-4 w-4" /> {errorCount} row{errorCount === 1 ? "" : "s"} have errors and will be
                    skipped.
                  </span>
                )}
              </p>
              {warningCount > 0 && (
                <p className="mt-0.5 text-xs text-ledger-400">
                  {warningCount} row{warningCount === 1 ? "" : "s"} have warnings but can still be imported.
                </p>
              )}
            </div>
            <div className="flex gap-2">
              {errorCount > 0 && (
                <Button variant="outline" onClick={downloadErrorReport}>
                  <FileDown className="h-3.5 w-3.5" />
                  Download error report ({errorCount})
                </Button>
              )}
              <Button onClick={handleImport} disabled={importableCount === 0 || importing}>
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {importing ? "Importing…" : `Import ${importableCount} products`}
              </Button>
            </div>
          </div>
        </>
      )}

      {step === 4 && importSummary && (
        <div className="rounded-card border border-ledger-100 bg-white p-8 text-center shadow-card dark:border-ledger-700 dark:bg-ink-900">
          <CheckCircle2 className="mx-auto h-10 w-10 text-signal" />
          <h2 className="mt-3 font-display text-xl font-semibold text-ink-900 dark:text-white">Import complete</h2>
          <p className="mt-2 text-sm text-ledger-500 dark:text-ledger-400">
            <span className="font-semibold text-signal">{importSummary.imported} Imported</span>
            {" · "}
            <span className="font-semibold text-amber">{importSummary.skipped} Skipped</span>
            {" · "}
            <span className="font-semibold text-alert">{importSummary.errorCount} Errors</span>
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="outline" onClick={startOver}>
              Import more products
            </Button>
            <Button onClick={() => router.push("/inventory")}>Go to Products</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
  icon: Icon
}: {
  label: string;
  value: number;
  tone: "neutral" | "signal" | "amber" | "alert";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const toneClass = {
    neutral: "text-ledger-600 dark:text-ledger-300",
    signal: "text-signal",
    amber: "text-amber",
    alert: "text-alert"
  }[tone];
  return (
    <div className="rounded-md border border-ledger-100 p-3 dark:border-ledger-700">
      <p className={cn("flex items-center gap-1.5 figure text-lg font-semibold", toneClass)}>
        {Icon && <Icon className="h-4 w-4" />}
        {value}
      </p>
      <p className="text-xs text-ledger-400">{label}</p>
    </div>
  );
}