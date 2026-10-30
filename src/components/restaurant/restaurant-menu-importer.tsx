"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { importRestaurantMenuItems, type RestaurantMenuImportRow } from "@/app/(dashboard)/restaurant/actions";
import { Button } from "@/components/ui/button";

type ImportCategory = { name: string; is_active: boolean };
type PreviewRow = { rowNumber: number; value: RestaurantMenuImportRow; issues: string[] };

const aliases: Record<keyof RestaurantMenuImportRow, string[]> = {
  name: ["name", "item name", "menu item", "menu item name"],
  sku: ["sku", "item sku", "code"],
  barcode: ["barcode", "bar code", "upc", "ean"],
  category: ["category", "menu category"],
  description: ["description", "details"],
  price: ["price", "selling price", "unit price"],
  prepStation: ["prep station", "station"],
  imageUrl: ["image url", "image_url", "image"],
};

function readCell(row: Record<string, unknown>, key: keyof RestaurantMenuImportRow): string {
  const cells = new Map(Object.entries(row).map(([header, value]) => [header.trim().toLowerCase(), value]));
  const value = aliases[key].map((alias) => cells.get(alias)).find((candidate) => candidate !== undefined && candidate !== null);
  return value === undefined ? "" : String(value).trim();
}

function mapRawRow(row: Record<string, unknown>): RestaurantMenuImportRow {
  const rawPrice = readCell(row, "price").replace(/[$,\s]/g, "");
  const prepStation = readCell(row, "prepStation").toLowerCase();
  return {
    name: readCell(row, "name"),
    sku: readCell(row, "sku"),
    barcode: readCell(row, "barcode"),
    category: readCell(row, "category"),
    description: readCell(row, "description"),
    price: rawPrice ? Number(rawPrice) : Number.NaN,
    prepStation: prepStation ? prepStation as RestaurantMenuImportRow["prepStation"] : "kitchen",
    imageUrl: readCell(row, "imageUrl"),
  };
}

function createTemplate() {
  const csv = "name,price,sku,barcode,category,description,prep station,image url\n" +
    "Margherita Pizza,12.5,PIZZA-001,0123456789012,Pizza,Tomato mozzarella basil,kitchen,\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "restaurant-menu-import-template.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function RestaurantMenuImporter({ categories, menuItems }: {
  categories: ImportCategory[];
  menuItems: { sku: string | null; barcode: string | null }[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<PreviewRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  async function handleFile(file: File) {
    setError("");
    setSuccess("");
    setFileName(file.name);
    setRows([]);
    if (file.size > 5 * 1024 * 1024) {
      setError("Choose a CSV or Excel file no larger than 5 MB.");
      return;
    }
    const extension = file.name.toLowerCase().split(".").pop();
    if (!["csv", "xlsx", "xls"].includes(extension ?? "")) {
      setError("Choose a CSV, XLSX, or XLS file.");
      return;
    }
    setLoading(true);
    try {
      let rawRows: Record<string, unknown>[];
      if (extension === "csv") {
        rawRows = await new Promise((resolve, reject) => {
          Papa.parse<Record<string, unknown>>(file, {
            header: true,
            skipEmptyLines: true,
            complete: (result) => {
              const firstError = result.errors[0];
              if (firstError) {
                reject(new Error(`Could not parse CSV row ${(firstError.row ?? 0) + 2}: ${firstError.message}`));
                return;
              }
              resolve(result.data);
            },
            error: reject,
          });
        });
      } else {
        const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        rawRows = firstSheet ? XLSX.utils.sheet_to_json<Record<string, unknown>>(firstSheet, { defval: "" }) : [];
      }
      if (rawRows.length === 0) {
        setError("No data rows found. Add menu items below the header row.");
        return;
      }
      if (rawRows.length > 500) {
        setError("A file can contain at most 500 menu items per import.");
        return;
      }
      const activeCategories = new Set(categories.filter((category) => category.is_active).map((category) => category.name.trim().toLowerCase()));
      const knownSkus = new Set(menuItems.flatMap((item) => item.sku ? [item.sku.trim().toLowerCase()] : []));
      const knownBarcodes = new Set(menuItems.flatMap((item) => item.barcode ? [item.barcode.trim().toLowerCase()] : []));
      const fileSkus = new Set<string>();
      const fileBarcodes = new Set<string>();
      const preview = rawRows.map((raw, index) => {
        const value = mapRawRow(raw);
        const issues: string[] = [];
        if (!value.name) issues.push("Name is required");
        else if (value.name.length > 120) issues.push("Name exceeds 120 characters");
        if (!Number.isFinite(value.price) || value.price < 0 || Math.abs(value.price * 100 - Math.round(value.price * 100)) > 0.000001) {
          issues.push("Price must be a non-negative amount with up to 2 decimals");
        }
        if (value.sku.length > 80) issues.push("SKU exceeds 80 characters");
        if (value.sku) {
          const normalizedSku = value.sku.toLowerCase();
          if (knownSkus.has(normalizedSku)) issues.push("SKU already exists in this menu");
          if (fileSkus.has(normalizedSku)) issues.push("Duplicate SKU in this file");
          fileSkus.add(normalizedSku);
        }
        if (value.barcode.length > 120) issues.push("Barcode exceeds 120 characters");
        if (value.barcode) {
          const normalizedBarcode = value.barcode.toLowerCase();
          if (knownBarcodes.has(normalizedBarcode)) issues.push("Barcode already exists in this menu");
          if (fileBarcodes.has(normalizedBarcode)) issues.push("Duplicate barcode in this file");
          fileBarcodes.add(normalizedBarcode);
        }
        if (value.category && !activeCategories.has(value.category.toLowerCase())) issues.push("Category must match an active menu category");
        if (!["kitchen", "bar", "dessert"].includes(value.prepStation)) issues.push("Prep station must be kitchen, bar, or dessert");
        if (value.description.length > 2000) issues.push("Description exceeds 2,000 characters");
        if (value.imageUrl) {
          try {
            const imageUrl = new URL(value.imageUrl);
            if (imageUrl.protocol !== "https:" || imageUrl.username || imageUrl.password) issues.push("Image URL must use HTTPS");
          } catch {
            issues.push("Image URL must be a valid HTTPS URL");
          }
        }
        return { rowNumber: index + 2, value, issues };
      });
      const headerNames = Object.keys(rawRows[0]).map((header) => header.trim().toLowerCase());
      if (!aliases.name.some((alias) => headerNames.includes(alias)) || !aliases.price.some((alias) => headerNames.includes(alias))) {
        setError("The file needs at least a Name and Price column. Download the template to see all supported columns.");
        return;
      }
      setRows(preview);
    } catch (parseError) {
      setError(parseError instanceof Error ? parseError.message : "Could not read the selected file.");
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!rows.length || rows.some((row) => row.issues.length)) return;
    setImporting(true);
    setError("");
    try {
      const result = await importRestaurantMenuItems(rows.map((row) => row.value));
      setSuccess(`${result.imported} menu item${result.imported === 1 ? "" : "s"} imported.`);
      setRows([]);
      setFileName("");
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import menu items.");
    } finally {
      setImporting(false);
    }
  }

  const invalidCount = rows.filter((row) => row.issues.length > 0).length;

  return (
    <section className="rounded-xl border bg-white p-4 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-slate-950 dark:text-white">Import menu items</h3>
          <p className="text-xs text-slate-500">CSV or Excel; imports Restaurant menu items only, not inventory products. Categories must already exist; leave Category blank for Uncategorized.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={createTemplate}>Download template</Button>
          <Button type="button" variant="primary" size="sm" onClick={() => inputRef.current?.click()} disabled={loading || importing}>
            {loading ? "Reading…" : "Choose file"}
          </Button>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void handleFile(file);
          }} />
        </div>
      </div>
      {fileName && <p className="mt-3 text-xs text-slate-500">{fileName} · {rows.length} row(s) {invalidCount ? `· ${invalidCount} invalid` : ""}</p>}
      {rows.length > 0 && <div className="mt-3 max-h-72 overflow-auto rounded-lg border dark:border-slate-700">
        <table className="w-full text-left text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr>{["Row", "Name", "Price", "SKU", "Barcode", "Category", "Prep station", "Validation"].map((heading) => <th key={heading} className="px-2 py-2 font-semibold">{heading}</th>)}</tr>
          </thead>
          <tbody className="divide-y dark:divide-slate-700">
            {rows.map((row) => <tr key={row.rowNumber}>
              <td className="px-2 py-2">{row.rowNumber}</td>
              <td className="px-2 py-2">{row.value.name || "—"}</td>
              <td className="px-2 py-2">{Number.isFinite(row.value.price) ? row.value.price : "—"}</td>
              <td className="px-2 py-2">{row.value.sku || "—"}</td>
              <td className="px-2 py-2">{row.value.barcode || "—"}</td>
              <td className="px-2 py-2">{row.value.category || "—"}</td>
              <td className="px-2 py-2">{row.value.prepStation}</td>
              <td className={`px-2 py-2 ${row.issues.length ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>{row.issues.join("; ") || "Ready"}</td>
            </tr>)}
          </tbody>
        </table>
      </div>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700 dark:text-red-400">{error}</p>}
      {success && <p role="status" className="mt-3 text-sm text-green-700 dark:text-green-400">{success}</p>}
      {rows.length > 0 && <div className="mt-3 flex justify-end">
        <Button type="button" variant="primary" size="sm" onClick={() => void handleImport()} disabled={importing || invalidCount > 0}>
          {importing ? "Importing…" : `Import ${rows.length} item${rows.length === 1 ? "" : "s"}`}
        </Button>
      </div>}
    </section>
  );
}
