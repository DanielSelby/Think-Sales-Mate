"use client";

type AttendanceReportRow = {
  date: string;
  employee: string;
  branch: string;
  status: string;
  hours: string;
  overtime: string;
};

function escapeCsv(value: string) {
  const safeValue = /^[\t\r=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safeValue.replace(/"/g, '""')}"`;
}

export function ManagementReportExport({ rows }: { rows: AttendanceReportRow[] }) {
  function downloadCsv() {
    const columns = ["Date", "Employee", "Branch", "Status", "Hours", "Overtime"];
    const content = [
      columns,
      ...rows.map((row) => [row.date, row.employee, row.branch, row.status, row.hours, row.overtime]),
    ].map((line) => line.map(escapeCsv).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "attendance-report.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadExcel() {
    const XLSX = await import("xlsx");
    const worksheet = XLSX.utils.json_to_sheet(rows.map((row) => ({
      Date: row.date,
      Employee: row.employee,
      Branch: row.branch,
      Status: row.status,
      Hours: Number(row.hours),
      Overtime: Number(row.overtime),
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");
    XLSX.writeFile(workbook, `attendance-report-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  function downloadPdf() {
    const columns = [
      { title: "Date", width: 52, value: (row: AttendanceReportRow) => row.date },
      { title: "Employee", width: 120, value: (row: AttendanceReportRow) => row.employee },
      { title: "Branch", width: 110, value: (row: AttendanceReportRow) => row.branch },
      { title: "Status", width: 82, value: (row: AttendanceReportRow) => row.status },
      { title: "Hours", width: 56, value: (row: AttendanceReportRow) => row.hours },
      { title: "Overtime", width: 62, value: (row: AttendanceReportRow) => row.overtime },
    ];
    const pageRows = 34;
    const chunks: AttendanceReportRow[][] = [];
    for (let index = 0; index < rows.length; index += pageRows) chunks.push(rows.slice(index, index + pageRows));
    if (!chunks.length) chunks.push([]);

    const ascii = (value: string) => value.normalize("NFKD").replace(/[^\x20-\x7E]/g, "?");
    const text = (value: string, x: number, y: number, size: number, bold = false) =>
      `BT /${bold ? "F2" : "F1"} ${size} Tf ${x} ${y} Td (${ascii(value).replace(/[\\()]/g, "\\$&")}) Tj ET`;
    const streams = chunks.map((chunk, pageIndex) => {
      const commands = [
        text("Attendance Report", 36, 755, 16, true),
        text(`Generated ${new Date().toLocaleDateString()}`, 36, 738, 9),
        text(`Page ${pageIndex + 1} of ${chunks.length}`, 510, 755, 9),
        "0.91 0.94 0.96 rg 36 710 523 18 re f",
      ];
      let x = 40;
      for (const column of columns) {
        commands.push(text(column.title, x, 716, 8, true));
        x += column.width;
      }
      chunk.forEach((row, rowIndex) => {
        const y = 695 - rowIndex * 17;
        commands.push("0.88 0.9 0.92 RG 36 " + (y - 5) + " m 559 " + (y - 5) + " l S");
        let columnX = 40;
        columns.forEach((column) => {
          const maxChars = Math.floor((column.width - 8) / 4.2);
          commands.push(text(column.value(row).slice(0, maxChars), columnX, y, 7));
          columnX += column.width;
        });
      });
      commands.push(text(`${rows.length} attendance records`, 36, 85, 8));
      return commands.join("\n");
    });

    const pageIds = streams.map((_, index) => 4 + index * 2);
    const objects: string[] = [];
    objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
    objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
    objects[4 + streams.length * 2] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
    streams.forEach((stream, index) => {
      const pageId = pageIds[index];
      const contentId = pageId + 1;
      const boldFontId = 4 + streams.length * 2;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 ${boldFontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
    });

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xrefOffset = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < offsets.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
    const url = URL.createObjectURL(new Blob([pdf], { type: "application/pdf" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `attendance-report-${new Date().toISOString().slice(0, 10)}.pdf`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const buttonClass = "inline-flex items-center justify-center rounded-lg border border-ledger-200 bg-white px-3 py-2 text-sm font-semibold text-ink-800 hover:bg-ledger-50 dark:border-ledger-700 dark:bg-ledger-900 dark:text-white dark:hover:bg-ledger-800";
  return <div className="flex flex-wrap gap-2">
    <button type="button" onClick={downloadCsv} className={buttonClass}>Export CSV</button>
    <button type="button" onClick={() => void downloadExcel()} className={buttonClass}>Export Excel</button>
    <button type="button" onClick={downloadPdf} className={buttonClass}>Export PDF</button>
  </div>;
}
