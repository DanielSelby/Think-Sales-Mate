function pdfText(value: unknown) {
  return String(value ?? "—")
    .replace(/[\r\n\t]+/g, " ")
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

export function createClassReportPdf(lines: string[]) {
  const pageLines = 54;
  const wrappedLines = lines.flatMap((line) => {
    const normalized = String(line ?? "—").replace(/[\r\n\t]+/g, " ").normalize("NFKD").replace(/[^\x20-\x7e]/g, "?");
    return normalized.match(/.{1,105}/g) ?? [""];
  });
  const pages = Array.from({ length: Math.max(1, Math.ceil(wrappedLines.length / pageLines)) }, (_, index) =>
    wrappedLines.slice(index * pageLines, (index + 1) * pageLines));
  const objects: string[] = [];
  const pageObjectIds = pages.map((_, index) => 4 + index * 2);
  const fontObjectId = 3 + pages.length * 2;
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;

  pages.forEach((page, index) => {
    const contentObjectId = 3 + index * 2;
    const pageObjectId = pageObjectIds[index];
    const text = [
      "BT",
      "/F1 8 Tf",
      "36 790 Td",
      "11 TL",
      ...page.map((line) => `(${pdfText(line)}) Tj T*`),
      "ET",
    ].join("\n");
    objects[contentObjectId] = `<< /Length ${Buffer.byteLength(text, "ascii")} >>\nstream\n${text}\nendstream`;
    objects[pageObjectId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontObjectId} 0 R >> >> /Contents ${contentObjectId} 0 R >>`;
  });
  objects[fontObjectId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let document = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(document, "ascii");
    document += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(document, "ascii");
  document += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    document += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  document += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(document, "ascii");
}
