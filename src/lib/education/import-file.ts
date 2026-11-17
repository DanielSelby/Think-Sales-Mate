import * as XLSX from "xlsx";

const normalizeHeader = (value: string) => value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");

function normalizeImportDate(value: unknown): string {
  const text = String(value ?? "").trim();
  const displayDate = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text);
  const isoDate = displayDate ? `${displayDate[3]}-${displayDate[2]}-${displayDate[1]}` : text;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return text;

  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === isoDate
    ? isoDate
    : text;
}

export function formatEducationImportDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : value;
}

export function readEducationImportRows(buffer: ArrayBuffer): unknown[][] | null {
  const workbook = XLSX.read(buffer, { type: "array", dateNF: "dd-mm-yyyy" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return null;

  const rows = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!rows.length) return rows;

  const dateOfBirthIndex = rows[0].findIndex((value) =>
    normalizeHeader(String(value ?? "")) === "dateofbirth"
  );
  if (dateOfBirthIndex < 0) return rows;

  return rows.map((row, index) => index === 0
    ? row
    : row.map((value, cellIndex) => cellIndex === dateOfBirthIndex ? normalizeImportDate(value) : value)
  );
}
