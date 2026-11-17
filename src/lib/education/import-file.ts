import * as XLSX from "xlsx";

export function readEducationImportRows(buffer: ArrayBuffer): unknown[][] | null {
  const workbook = XLSX.read(buffer, { type: "array", dateNF: "yyyy-mm-dd" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return null;

  return XLSX.utils.sheet_to_json<unknown[]>(firstSheet, {
    header: 1,
    defval: "",
    raw: false,
  });
}
