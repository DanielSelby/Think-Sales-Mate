// Parses the uploaded template file (.csv always supported with zero
// dependencies; .xlsx requires `npm install xlsx`).

export interface RawImportRow {
  [key: string]: string;
}

export const TEMPLATE_COLUMNS = [
  "Product Name",
  "Barcode",
  "Category",
  "Brand",
  "Description",
  "Cost Price",
  "Selling Price",
  "Tax (%)",
  "Opening Stock",
  "Minimum Stock Level",
  "Supplier",
  "Location / Warehouse",
  "Unit",
  "Status"
] as const;

function normalizeHeader(h: string) {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, string> = {
  productname: "name",
  barcode: "barcode",
  category: "category",
  brand: "brand",
  description: "description",
  costprice: "costPrice",
  sellingprice: "sellingPrice",
  tax: "tax",
  openingstock: "openingStock",
  minimumstocklevel: "minStock",
  supplier: "supplier",
  locationwarehouse: "locations",
  unit: "unit",
  status: "status"
};

function parseCsvText(text: string): RawImportRow[] {
  // Handles quoted fields (commas/newlines inside quotes) — a real CSV
  // parser, not a naive split(",").
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ""));
  if (nonEmpty.length < 2) return [];

  const headers = nonEmpty[0].map(normalizeHeader);
  return nonEmpty.slice(1).map((cells) => {
    const record: RawImportRow = {};
    headers.forEach((h, i) => {
      const key = HEADER_MAP[h] ?? h;
      record[key] = (cells[i] ?? "").trim();
    });
    return record;
  });
}

async function parseXlsxFile(file: File): Promise<RawImportRow[]> {
  let XLSX: typeof import("xlsx");
  try {
    XLSX = await import("xlsx");
  } catch {
    throw new Error(
      "Reading .xlsx files requires the 'xlsx' package. Run `npm install xlsx`, or re-save your file as .csv and upload that instead."
    );
  }

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const aoa: string[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, raw: false });

  if (aoa.length < 2) return [];
  const headers = aoa[0].map((h) => normalizeHeader(String(h ?? "")));
  return aoa.slice(1).map((cells) => {
    const record: RawImportRow = {};
    headers.forEach((h, i) => {
      const key = HEADER_MAP[h] ?? h;
      record[key] = String(cells[i] ?? "").trim();
    });
    return record;
  });
}

export async function parseImportFile(file: File): Promise<RawImportRow[]> {
  const isXlsx = /\.xlsx?$/i.test(file.name);
  if (isXlsx) return parseXlsxFile(file);
  const text = await file.text();
  return parseCsvText(text);
}

export function buildTemplateCsv(): string {
  const exampleRow = [
    "Wireless Mouse",
    "8901234567890",
    "Accessories",
    "Logitech",
    "2.4GHz wireless mouse",
    "50.00",
    "75.00",
    "15",
    "20",
    "5",
    "Global Brands Co",
    "Main Branch, Kumasi Store",
    "pcs",
    "Active"
  ];
  const escape = (v: string) => (v.includes(",") || v.includes('"') ? `"${v.replace(/"/g, '""')}"` : v);
  return [TEMPLATE_COLUMNS.map(escape).join(","), exampleRow.map(escape).join(",")].join("\n");
}