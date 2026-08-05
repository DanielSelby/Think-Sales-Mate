"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

function toCsvValue(value: unknown): string {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function ExportCsvButton({
  filename,
  headers,
  rows
}: {
  filename: string;
  headers: string[];
  rows: (string | number)[][];
}) {
  function handleExport() {
    const lines = [headers.map(toCsvValue).join(","), ...rows.map((row) => row.map(toCsvValue).join(","))];
    const csv = lines.join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <Button variant="outline" onClick={handleExport} disabled={rows.length === 0}>
      <Download className="h-4 w-4" />
      Export CSV
    </Button>
  );
}