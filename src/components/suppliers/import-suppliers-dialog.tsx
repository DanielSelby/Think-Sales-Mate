"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import { Loader2, UploadCloud, FileText } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { importSuppliers, type ImportSupplierRow } from "@/app/(dashboard)/purchases/suppliers/actions";

interface ImportSuppliersDialogProps {
  open: boolean;
  onClose: () => void;
  onImported: (count: number) => void;
}

const COLUMN_ALIASES: Record<keyof ImportSupplierRow, string[]> = {
  name: ["name", "supplier", "supplier name", "company"],
  contactPerson: ["contact person", "contact", "contact_person"],
  phone: ["phone", "phone number", "mobile"],
  email: ["email", "email address"],
  category: ["category", "type"],
  country: ["country"],
  paymentTerms: ["payment terms", "payment_terms", "terms"],
};

function mapRow(raw: Record<string, string>): ImportSupplierRow {
  const lowerKeys = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const get = (aliases: string[]) => {
    for (const alias of aliases) if (lowerKeys[alias]) return lowerKeys[alias].trim();
    return undefined;
  };
  return {
    name: get(COLUMN_ALIASES.name) ?? "",
    contactPerson: get(COLUMN_ALIASES.contactPerson),
    phone: get(COLUMN_ALIASES.phone),
    email: get(COLUMN_ALIASES.email),
    category: get(COLUMN_ALIASES.category),
    country: get(COLUMN_ALIASES.country),
    paymentTerms: get(COLUMN_ALIASES.paymentTerms),
  };
}

export function ImportSuppliersDialog({ open, onClose, onImported }: ImportSuppliersDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [preview, setPreview] = React.useState<ImportSupplierRow[] | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function handleFile(file: File) {
    setError(null);
    setFileName(file.name);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map(mapRow);
        if (rows.every((r) => !r.name)) {
          setError('No "name" / "supplier" column found — check your CSV headers.');
          setPreview(null);
          return;
        }
        setPreview(rows);
      },
      error: () => setError("Couldn't parse that file. Make sure it's a valid CSV."),
    });
  }

  function submit() {
    if (!preview) return;
    startTransition(async () => {
      const result = await importSuppliers(preview);
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onImported(result.imported ?? 0);
      reset();
      onClose();
      router.refresh();
    });
  }

  function reset() {
    setPreview(null);
    setFileName(null);
    setError(null);
  }

  return (
    <Dialog
      open={open}
      onClose={() => (isPending ? null : onClose())}
      title="Import Suppliers"
      description="Upload a CSV with columns like Name, Contact Person, Phone, Email, Category, Country, Payment Terms."
      className="max-w-lg"
    >
      <div className="space-y-4">
        {!preview && (
          <div
            onClick={() => inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-ledger-200 px-4 py-8 text-center hover:border-ledger-300 dark:border-ledger-700"
          >
            <UploadCloud className="h-5 w-5 text-ledger-400" />
            <p className="text-sm text-ledger-500">Click to choose a CSV file</p>
            <input
              ref={inputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            />
          </div>
        )}

        {preview && (
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-ledger-500">
              <FileText className="h-4 w-4" /> {fileName} — {preview.length} row(s) found
            </div>
            <div className="max-h-48 overflow-y-auto rounded-md border border-ledger-100 dark:border-ledger-700">
              <table className="w-full text-left text-xs">
                <thead className="bg-ledger-50 text-ledger-400 dark:bg-white/[0.03]">
                  <tr><th className="px-2 py-1.5">Name</th><th className="px-2 py-1.5">Contact</th><th className="px-2 py-1.5">Category</th></tr>
                </thead>
                <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                  {preview.slice(0, 8).map((r, i) => (
                    <tr key={i}>
                      <td className="px-2 py-1.5 text-ink-900 dark:text-white">{r.name || <span className="text-alert">missing</span>}</td>
                      <td className="px-2 py-1.5 text-ledger-500">{r.contactPerson ?? "—"}</td>
                      <td className="px-2 py-1.5 text-ledger-500">{r.category ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.length > 8 && <p className="mt-1 text-xs text-ledger-400">+{preview.length - 8} more row(s) not shown</p>}
          </div>
        )}

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="md" onClick={() => { reset(); onClose(); }} disabled={isPending}>Cancel</Button>
          {preview && (
            <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Import {preview.length} Supplier{preview.length === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}