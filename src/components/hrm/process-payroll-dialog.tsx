"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Info } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatCurrency } from "@/lib/sales/format";
import { PAYROLL_TYPES } from "@/lib/hrm/format";
import { processPayroll } from "@/app/(dashboard)/hrm/actions";

interface ProcessPayrollDialogProps {
  open: boolean;
  onClose: () => void;
  activeEmployeeCount: number;
  grossPayPreview: number;
  currency: string;
  onProcessed: () => void;
}

export function ProcessPayrollDialog({ open, onClose, activeEmployeeCount, grossPayPreview, currency, onProcessed }: ProcessPayrollDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const today = new Date();
  const [periodStart, setPeriodStart] = React.useState(() => new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [periodEnd, setPeriodEnd] = React.useState(() => new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [paymentDate, setPaymentDate] = React.useState(() => new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().slice(0, 10));
  const [payrollType, setPayrollType] = React.useState<string>(PAYROLL_TYPES[0]);
  const [deductionRate, setDeductionRate] = React.useState(0);
  const [allowances, setAllowances] = React.useState(0);
  const [employerContribution, setEmployerContribution] = React.useState(0);

  const deductions = Math.round(grossPayPreview * (deductionRate / 100) * 100) / 100;
  const netPay = grossPayPreview - deductions + allowances;

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await processPayroll({
        payrollType, periodStart, periodEnd, paymentDate,
        deductionRatePercent: deductionRate, allowancesTotal: allowances, employerContribution,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onProcessed();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onClose={() => (isPending ? null : onClose())} title="Process Payroll" className="max-w-lg">
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-amber/30 bg-amber-soft px-3 py-2 text-xs text-ink-900 dark:bg-amber/10 dark:text-white">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
          The deduction rate below is a flat percentage you set &mdash; it&apos;s not a real PAYE/SSNIT calculation. Enter your own statutory rate, or leave at 0% and record actual deductions separately.
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Pay Period Start"><Input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} /></Field>
          <Field label="Pay Period End"><Input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payroll Type">
            <Select value={payrollType} onChange={(e) => setPayrollType(e.target.value)}>
              {PAYROLL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Payment Date"><Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} /></Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Deduction Rate (%)"><Input type="number" min={0} max={100} step="0.1" value={deductionRate} onChange={(e) => setDeductionRate(Number(e.target.value))} /></Field>
          <Field label="Allowances Total"><Input type="number" min={0} step="0.01" value={allowances} onChange={(e) => setAllowances(Number(e.target.value))} /></Field>
          <Field label="Employer Contribution"><Input type="number" min={0} step="0.01" value={employerContribution} onChange={(e) => setEmployerContribution(Number(e.target.value))} /></Field>
        </div>

        <div className="rounded-md border border-ledger-100 p-3 text-sm dark:border-ledger-700">
          <Row label="Employees" value={`${activeEmployeeCount}`} />
          <Row label="Gross Pay" value={formatCurrency(grossPayPreview, currency)} />
          <Row label="Deductions" value={formatCurrency(deductions, currency)} />
          <Row label="Allowances" value={formatCurrency(allowances, currency)} />
          <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
            <span className="font-medium text-ink-900 dark:text-white">Estimated Net Pay</span>
            <span className="font-display text-lg font-semibold text-signal">{formatCurrency(netPay, currency)}</span>
          </div>
        </div>

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={onClose} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending || activeEmployeeCount === 0}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Process Payroll
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-ledger-500">{label}</span>
      <span className="font-medium text-ink-900 dark:text-white">{value}</span>
    </div>
  );
}