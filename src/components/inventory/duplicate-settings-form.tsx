"use client";

import { useState, useTransition } from "react";
import { ShieldCheck, Save } from "lucide-react";
import { saveDuplicateSettings } from "@/app/(dashboard)/inventory/duplicate-actions";
import type { BarcodeValidationMode, DuplicateControlMode } from "@/lib/inventory/duplicate-products";

const modes: Array<{ value: DuplicateControlMode; label: string; description: string }> = [
  { value: "allow", label: "Allow Duplicates", description: "Create products without duplicate checks." },
  { value: "warn", label: "Warn Only", description: "Show matches but allow users to continue." },
  { value: "block_exact", label: "Block Exact Duplicates", description: "Block names that normalize to the same value." },
  { value: "block_exact_similar", label: "Block Exact + Similar Duplicates", description: "Recommended for clean catalogs and reliable reporting." },
];

export function DuplicateSettingsForm({ settings, canManage }: { settings: { controlMode: DuplicateControlMode; similarityThreshold: number; barcodeValidation: BarcodeValidationMode }; canManage: boolean }) {
  const [controlMode, setControlMode] = useState(settings.controlMode);
  const [threshold, setThreshold] = useState(settings.similarityThreshold);
  const [barcodeValidation, setBarcodeValidation] = useState(settings.barcodeValidation);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function save() {
    setError(null);
    startTransition(async () => {
      const result = await saveDuplicateSettings({ controlMode, similarityThreshold: threshold, barcodeValidation });
      if (result.error) setError(result.error); else setSaved(true);
    });
  }
  return <div className="mx-auto max-w-4xl space-y-5"><div><p className="text-xs text-ledger-400">Settings <span className="mx-1">›</span> Products</p><h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Duplicate Product Control</h1><p className="text-sm text-ledger-500">Keep your catalog clean before duplicate SKUs enter inventory.</p></div><div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center gap-3 border-b border-ledger-100 pb-4 dark:border-ledger-700"><span className="rounded-xl bg-blue-50 p-2 text-blue-600"><ShieldCheck className="h-5 w-5" /></span><div><h2 className="font-display font-bold">Product name matching</h2><p className="text-xs text-ledger-400">Normalize capitalization, punctuation, spacing, and minor variations.</p></div></div><div className="mt-4 space-y-2">{modes.map((mode) => <label key={mode.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${controlMode === mode.value ? "border-brand-300 bg-brand-50/50" : "border-ledger-100 dark:border-ledger-700"}`}><input type="radio" checked={controlMode === mode.value} onChange={() => setControlMode(mode.value)} disabled={!canManage} className="mt-1 accent-brand-600" /><span><span className="block text-sm font-semibold">{mode.label}{mode.value === "block_exact_similar" && <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] text-emerald-700">Recommended</span>}</span><span className="text-xs text-ledger-500">{mode.description}</span></span></label>)}</div><div className="mt-5 rounded-xl bg-ledger-50 p-4 dark:bg-ink-950"><div className="flex justify-between text-sm font-semibold"><span>Similarity threshold</span><span className="text-brand-600">{threshold}%</span></div><input type="range" min="70" max="100" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} disabled={!canManage} className="mt-3 w-full accent-brand-600" /><div className="flex justify-between text-[10px] text-ledger-400"><span>70% broad matching</span><span>100% exact matching</span></div></div></div><div className="rounded-2xl border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900"><h2 className="font-display font-bold">Barcode validation</h2><p className="mt-1 text-xs text-ledger-400">Barcodes are unique identifiers and should normally be blocked when already assigned.</p><select value={barcodeValidation} onChange={(event) => setBarcodeValidation(event.target.value as BarcodeValidationMode)} disabled={!canManage} className="mt-4 w-full rounded-xl border border-ledger-200 px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-950"><option value="allow">Allow</option><option value="warn">Warn</option><option value="block">Block</option></select></div>{error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}<div className="flex items-center justify-end gap-3">{saved && <span className="text-sm text-emerald-600">Settings saved</span>}{canManage && <button onClick={save} disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{pending ? "Saving…" : "Save settings"}</button>}</div></div>;
}
