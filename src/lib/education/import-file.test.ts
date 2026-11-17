import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { readEducationImportRows } from "./import-file";

describe("Think Education import file parsing", () => {
  it("normalizes formatted Excel date cells to ISO dates", () => {
    const sheet = XLSX.utils.aoa_to_sheet([["Date of Birth"], [40183]]);
    sheet.A2.z = "m/d/yy";
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Import");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });

    expect(readEducationImportRows(buffer)).toEqual([
      ["Date of Birth"],
      ["2010-01-05"],
    ]);
  });
});
