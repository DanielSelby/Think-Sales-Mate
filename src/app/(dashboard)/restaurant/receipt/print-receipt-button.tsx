"use client";

export default function PrintReceiptButton() {
  return (
    <div className="no-print mb-4 flex justify-end">
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white">
        Print receipt
      </button>
    </div>
  );
}
