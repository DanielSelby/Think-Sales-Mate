"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { getProductAppPath } from "@/lib/product-app-routes";
import { saveEducationAccountingJournal } from "@/app/(dashboard)/education/accounting/actions";

type JournalLine = {
  account_id: string;
  debit: string;
  credit: string;
  description: string;
};

type AccountOption = {
  id: string;
  branch_id: string | null;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  is_active: boolean;
};

type CampusOption = { id: string; name: string };
type FiscalYearOption = { id: string; name: string; starts_on: string; ends_on: string };
type PeriodOption = {
  id: string;
  fiscal_year_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
};

type InitialJournal = {
  id: string;
  branch_id: string | null;
  fiscal_year_id: string;
  period_id: string;
  entry_date: string;
  reference: string | null;
  description: string;
  lines: JournalLine[];
};

function blankLine(): JournalLine {
  return { account_id: "", debit: "", credit: "", description: "" };
}

function minorUnits(value: string) {
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(value)) return 0;
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function EducationAccountingJournalForm({
  accounts,
  campuses,
  fiscalYears,
  periods,
  hasOrganizationScope,
  initialJournal,
}: {
  accounts: AccountOption[];
  campuses: CampusOption[];
  fiscalYears: FiscalYearOption[];
  periods: PeriodOption[];
  hasOrganizationScope: boolean;
  initialJournal?: InitialJournal;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const initialDate = initialJournal?.entry_date ?? today;
  const openPeriods = periods.filter((period) => period.status === "open");
  const initialPeriod = initialJournal?.period_id
    ? periods.find((period) => period.id === initialJournal.period_id)
    : openPeriods.find((period) => period.starts_on <= initialDate && period.ends_on >= initialDate)
      ?? openPeriods[0];
  const initialYearId = initialJournal?.fiscal_year_id ?? initialPeriod?.fiscal_year_id ?? fiscalYears[0]?.id ?? "";
  const [fiscalYearId, setFiscalYearId] = useState(initialYearId);
  const [periodId, setPeriodId] = useState(initialJournal?.period_id ?? initialPeriod?.id ?? "");
  const [entryDate, setEntryDate] = useState(initialDate);
  const [branchId, setBranchId] = useState(initialJournal?.branch_id ?? (hasOrganizationScope ? "" : campuses[0]?.id ?? ""));
  const [lines, setLines] = useState<JournalLine[]>(initialJournal?.lines.length
    ? initialJournal.lines
    : [blankLine(), blankLine()]);

  const availablePeriods = openPeriods.filter((period) => period.fiscal_year_id === fiscalYearId);
  const currentAccounts = useMemo(() => accounts.filter((account) =>
    account.is_active
      ? account.branch_id === null || account.branch_id === branchId
      : lines.some((line) => line.account_id === account.id)
  ), [accounts, branchId, lines]);
  const totalDebit = lines.reduce((sum, line) => sum + minorUnits(line.debit), 0);
  const totalCredit = lines.reduce((sum, line) => sum + minorUnits(line.credit), 0);
  const isBalanced = totalDebit > 0 && totalDebit === totalCredit;

  function updateLine(index: number, field: keyof JournalLine, value: string) {
    setLines((current) => current.map((line, lineIndex) => {
      if (lineIndex !== index) return line;
      if (field === "debit" && value) return { ...line, debit: value, credit: "" };
      if (field === "credit" && value) return { ...line, credit: value, debit: "" };
      return { ...line, [field]: value };
    }));
  }

  function updatePeriod(nextPeriodId: string) {
    const period = periods.find((option) => option.id === nextPeriodId);
    setPeriodId(nextPeriodId);
    if (period) {
      setFiscalYearId(period.fiscal_year_id);
      if (entryDate < period.starts_on || entryDate > period.ends_on) setEntryDate(period.starts_on);
    }
  }

  const lockedScope = Boolean(initialJournal);
  const formLines = JSON.stringify(lines);

  return (
    <form action={saveEducationAccountingJournal} className="space-y-5">
      {initialJournal && <input type="hidden" name="journalId" value={initialJournal.id} />}
      <input type="hidden" name="lines" value={formLines} />
      {lockedScope ? (
        <>
          <input type="hidden" name="branchId" value={branchId} />
          <input type="hidden" name="fiscalYearId" value={fiscalYearId} />
          <input type="hidden" name="periodId" value={periodId} />
        </>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-sm font-medium text-slate-700">
          Campus
          {lockedScope ? (
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700">
              {branchId ? campuses.find((campus) => campus.id === branchId)?.name ?? "Assigned campus" : "All campuses"}
            </p>
          ) : (
            <select name="branchId" value={branchId} onChange={(event) => {
              const nextBranchId = event.target.value;
              setBranchId(nextBranchId);
              setLines((current) => current.map((line) => {
                const account = accounts.find((option) => option.id === line.account_id);
                return account && (account.branch_id === null || account.branch_id === nextBranchId)
                  ? line
                  : { ...line, account_id: "" };
              }));
            }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              {hasOrganizationScope && <option value="">All campuses</option>}
              {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
            </select>
          )}
        </label>
        <label className="text-sm font-medium text-slate-700">
          Fiscal year
          {lockedScope ? (
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700">
              {fiscalYears.find((year) => year.id === fiscalYearId)?.name ?? "Fiscal year"}
            </p>
          ) : (
            <select name="fiscalYearId" required value={fiscalYearId} onChange={(event) => {
              const nextYearId = event.target.value;
              const nextPeriod = openPeriods.find((period) => period.fiscal_year_id === nextYearId);
              setFiscalYearId(nextYearId);
              setPeriodId(nextPeriod?.id ?? "");
              if (nextPeriod) setEntryDate(nextPeriod.starts_on);
            }} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              {fiscalYears.map((year) => (
                <option key={year.id} value={year.id} disabled={!openPeriods.some((period) => period.fiscal_year_id === year.id)}>
                  {year.name}
                </option>
              ))}
            </select>
          )}
        </label>
        <label className="text-sm font-medium text-slate-700">
          Accounting period
          {lockedScope ? (
            <p className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-normal text-slate-700">
              {periods.find((period) => period.id === periodId)?.name ?? "Period"}
            </p>
          ) : (
            <select name="periodId" required value={periodId} onChange={(event) => updatePeriod(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900">
              {availablePeriods.filter((period) => period.status === "open").map((period) => (
                <option key={period.id} value={period.id}>{period.name} · {period.starts_on} — {period.ends_on}</option>
              ))}
            </select>
          )}
        </label>
        <label className="text-sm font-medium text-slate-700">
          Entry date
          <input required name="entryDate" type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Description
          <input required name="description" maxLength={300} defaultValue={initialJournal?.description ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
        <label className="text-sm font-medium text-slate-700 sm:col-span-2">
          Reference (optional)
          <input name="reference" maxLength={120} defaultValue={initialJournal?.reference ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900" />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2.5">Account</th>
              <th className="px-3 py-2.5">Line description</th>
              <th className="px-3 py-2.5">Debit</th>
              <th className="px-3 py-2.5">Credit</th>
              <th className="px-3 py-2.5"><span className="sr-only">Remove line</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {lines.map((line, index) => (
              <tr key={index}>
                <td className="px-3 py-2">
                  <select value={line.account_id} onChange={(event) => updateLine(index, "account_id", event.target.value)} aria-label={`Line ${index + 1} account`} className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-sm text-slate-900">
                    <option value="">Select account</option>
                    {currentAccounts.map((account) => (
                      <option key={account.id} value={account.id} disabled={!account.is_active}>
                        {account.code} · {account.name} ({account.account_type}{account.is_active ? "" : ", inactive"})
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-3 py-2">
                  <input value={line.description} onChange={(event) => updateLine(index, "description", event.target.value)} maxLength={300} aria-label={`Line ${index + 1} description`} className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={line.debit} onChange={(event) => updateLine(index, "debit", event.target.value)} aria-label={`Line ${index + 1} debit`} className="w-32 rounded-lg border border-slate-300 px-2.5 py-2 text-right text-sm" />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min="0.01" step="0.01" inputMode="decimal" value={line.credit} onChange={(event) => updateLine(index, "credit", event.target.value)} aria-label={`Line ${index + 1} credit`} className="w-32 rounded-lg border border-slate-300 px-2.5 py-2 text-right text-sm" />
                </td>
                <td className="px-3 py-2">
                  <button type="button" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remove line ${index + 1}`} className="rounded p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-slate-50 text-sm font-semibold text-slate-800">
            <tr>
              <td colSpan={2} className="px-3 py-3 text-right">Totals</td>
              <td className="px-3 py-3 text-right tabular-nums">{(totalDebit / 100).toFixed(2)}</td>
              <td className="px-3 py-3 text-right tabular-nums">{(totalCredit / 100).toFixed(2)}</td>
              <td className="px-3 py-3">{isBalanced ? <span className="text-emerald-700">Balanced</span> : <span className="text-amber-700">Unbalanced</span>}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" disabled={lines.length >= 200} onClick={() => setLines((current) => [...current, blankLine()])} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
          <Plus className="h-4 w-4" /> Add line
        </button>
        <button type="submit" disabled={currentAccounts.filter((account) => account.is_active).length < 2 || !periodId || availablePeriods.length === 0} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50">
          Save draft
        </button>
      </div>
      {fiscalYears.length === 0 && (
        <p className="text-sm text-amber-800">Create a fiscal year before entering journals. <Link href={getProductAppPath("think-education", "/accounting/periods")} className="font-semibold underline">Go to fiscal periods</Link></p>
      )}
      {currentAccounts.filter((account) => account.is_active).length < 2 && (
        <p className="text-sm text-amber-800">Create at least two active accounts available to this campus before entering a journal. <Link href={getProductAppPath("think-education", "/accounting/chart-of-accounts")} className="font-semibold underline">Go to chart of accounts</Link></p>
      )}
      <p className="text-xs text-slate-500">Drafts can be saved before balancing. Posting requires equal debit and credit totals, active accounts, and an open accounting period.</p>
    </form>
  );
}
