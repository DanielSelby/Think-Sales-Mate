import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { formatEducationImportDate, readEducationImportRows } from "./import-file";

describe("Think Education import file parsing", () => {
  it("accepts DD-MM-YYYY dates and normalizes formatted Excel date cells for storage", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Date of Birth"], [40183]]);
    sheet.A2.z = "m/d/yy";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Import");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    expect(readEducationImportRows(buffer)).toEqual([
      ["Date of Birth"],
      ["2010-01-05"],
    ]);
    expect(formatEducationImportDate("2010-01-05")).toBe("05-01-2010");
  });

  it("normalizes DD-MM-YYYY date text from CSV-compatible worksheets", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["date_of_birth"], ["05-01-2010"]]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Import");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    expect(readEducationImportRows(buffer)?.[1]).toEqual(["2010-01-05"]);
  });
});
