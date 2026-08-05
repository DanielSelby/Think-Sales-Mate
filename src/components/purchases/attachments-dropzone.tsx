"use client";

import * as React from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StagedFile {
  id: string;
  file: File;
}

interface AttachmentsDropzoneProps {
  files: StagedFile[];
  onChange: (files: StagedFile[]) => void;
}

const ACCEPTED = ["application/pdf", "image/jpeg", "image/png"];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

export function AttachmentsDropzone({ files, onChange }: AttachmentsDropzoneProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  function addFiles(list: FileList | null) {
    if (!list) return;
    setError(null);
    const accepted: StagedFile[] = [];
    for (const file of Array.from(list)) {
      if (!ACCEPTED.includes(file.type)) {
        setError("Only PDF, JPG, and PNG files are supported.");
        continue;
      }
      if (file.size > MAX_SIZE) {
        setError("Files must be 5MB or smaller.");
        continue;
      }
      accepted.push({ id: crypto.randomUUID(), file });
    }
    if (accepted.length) onChange([...files, ...accepted]);
  }

  function remove(id: string) {
    onChange(files.filter((f) => f.id !== id));
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors",
          dragOver
            ? "border-signal bg-signal-soft"
            : "border-ledger-200 hover:border-ledger-300 dark:border-ledger-700"
        )}
      >
        <UploadCloud className="h-5 w-5 text-ledger-400" />
        <p className="text-sm text-ledger-500">
          Drag &amp; drop files here or <span className="font-medium text-signal">click to browse</span>
        </p>
        <p className="text-xs text-ledger-400">PDF, JPG, PNG (Max. 5MB each)</p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED.join(",")}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
      </div>

      {error && <p className="mt-2 text-xs text-alert">{error}</p>}

      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-2 rounded-md border border-ledger-100 px-3 py-2 text-sm dark:border-ledger-700"
            >
              <span className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 shrink-0 text-ledger-400" />
                <span className="truncate text-ink-900 dark:text-white">{f.file.name}</span>
                <span className="shrink-0 text-xs text-ledger-400">{(f.file.size / 1024).toFixed(0)} KB</span>
              </span>
              <button
                onClick={() => remove(f.id)}
                className="shrink-0 rounded-md p-1 text-ledger-400 hover:bg-ledger-100 hover:text-alert dark:hover:bg-white/[0.06]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}