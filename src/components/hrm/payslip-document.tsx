"use client";

import * as React from "react";
import { Download, Mail, MapPin, Phone, Printer, WalletCards } from "lucide-react";
import { recordPayslipEvent } from "@/app/(dashboard)/hrm/payslips/actions";
import { formatCurrency } from "@/lib/sales/format";

type PayLine = { description: string; amount: number };
export interface PayslipDocumentData {
  id: string;
  employee_name: string;
  employee_number: number | null;
  department: string | null;
  job_title: string | null;
  employment_type: string | null;
  hire_date: string | null;
  period_label: string;
  pay_period_start: string;
  pay_period_end: string;
  payment_date: string;
  payment_method: string | null;
  bank_name: string | null;
  account_number: string | null;
  mobile_money_number: string | null;
  payment_reference: string | null;
  currency: string;
  payroll_reference: string;
  earnings: PayLine[];
  deductions: PayLine[];
  total_earnings: number;
  total_deductions: number;
  net_pay: number;
  notes: string | null;
  company: { company_name: string | null; logo_url: string | null; business_email: string | null; business_phone: string | null; address: string };
}

const date = (value: string | null) => value ? new Date(`${value}T00:00:00Z`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }) : "—";

export function PayslipDocument({ payslip }: { payslip: PayslipDocumentData }) {
  const money = (value: number) => formatCurrency(value, payslip.currency);
  const track = (event: "viewed" | "downloaded" | "printed") => { void recordPayslipEvent(payslip.id, event); };
  React.useEffect(() => { void recordPayslipEvent(payslip.id, "viewed"); }, [payslip.id]);
  const waitForImages = async () => {
    await Promise.all(Array.from(document.images).map((image) => {
      if (image.complete) return Promise.resolve();
      return new Promise<void>((resolve) => {
        image.addEventListener("load", () => resolve(), { once: true });
        image.addEventListener("error", () => resolve(), { once: true });
      });
    }));
  };
  const print = async () => {
    await waitForImages();
    track("printed");
    window.print();
  };
  const download = async () => {
    await waitForImages();
    track("downloaded");
    window.print();
  };

  return (
    <>
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }

          html,
          body {
            width: 100%;
            min-height: 0;
            background: #fff !important;
          }

          body * {
            visibility: hidden !important;
          }

          .payslip-print,
          .payslip-print * {
            visibility: visible !important;
          }

          .payslip-print {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            border: 0 !important;
            border-radius: 0 !important;
            padding: 0 !important;
            box-shadow: none !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      <article className="payslip-print mx-auto max-w-4xl rounded-2xl border border-slate-100 bg-white p-6 text-[#102a4c] shadow-card sm:p-10 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none">
      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-3">
          {payslip.company.logo_url ? <img src={payslip.company.logo_url} alt="" className="h-14 w-14 object-contain" /> : <div className="h-14 w-14 rounded-xl bg-[#087ed1]" />}
          <div><h1 className="text-xl font-bold tracking-tight">{payslip.company.company_name || "ThinkSales Pro"}</h1><p className="text-xs text-slate-500">Smarter Business. Greater Growth.</p></div>
        </div>
        <div className="space-y-1 text-right text-xs text-slate-500"><p><MapPin className="mr-1 inline h-3.5 w-3.5 text-[#087ed1]" />{payslip.company.address || "Company address"}</p><p><Phone className="mr-1 inline h-3.5 w-3.5 text-[#087ed1]" />{payslip.company.business_phone || "—"}</p><p>{payslip.company.business_email || "—"}</p></div>
      </div>
      <div className="mt-8 flex items-end justify-between gap-4"><div><h2 className="text-4xl font-bold tracking-tight text-[#082d57]">Payslip</h2><p className="mt-1 text-sm text-slate-500">Your hard work drives our success.</p></div><div className="rounded-xl bg-[#eef6ff] px-5 py-3 text-sm"><p className="font-semibold">Pay Period</p><p>{date(payslip.pay_period_start)} – {date(payslip.pay_period_end)}</p></div></div>
      <section className="mt-7 grid grid-cols-2 gap-4 rounded-xl border border-[#e2ebf5] bg-[#f5f9fd] p-5 sm:grid-cols-4">
        <div className="col-span-2"><p className="font-semibold">{payslip.employee_name}</p><p className="text-xs text-slate-500">{payslip.job_title || "Employee"} · Employee ID: EMP-{String(payslip.employee_number ?? "").padStart(5, "0")}</p></div>
        <Info label="Department" value={payslip.department || "—"} /><Info label="Employment Type" value={payslip.employment_type?.replace("_", "-") || "—"} /><Info label="Join Date" value={date(payslip.hire_date)} />
      </section>
      <div className="mt-6 grid gap-4 md:grid-cols-2"><PayCard title="Earnings" lines={payslip.earnings} total={payslip.total_earnings} tone="green" money={money} /><PayCard title="Deductions" lines={payslip.deductions} total={payslip.total_deductions} tone="red" money={money} /></div>
      <section className="mt-6 flex items-center justify-between rounded-xl bg-[#07528b] px-6 py-5 text-white"><div><p className="text-lg font-semibold">Net Pay</p><p className="text-xs text-blue-100">The amount credited to your account</p></div><p className="text-2xl font-bold">{money(payslip.net_pay)}</p></section>
      <section className="mt-7 grid gap-6 rounded-xl bg-[#f5f9fd] p-5 text-sm sm:grid-cols-2"><div><h3 className="mb-3 font-semibold">Payment Details</h3><Detail label="Bank Name" value={payslip.bank_name || "—"} /><Detail label="Account Number" value={payslip.account_number || "—"} /><Detail label="Payment Reference" value={payslip.payment_reference || payslip.payroll_reference} /></div><div><h3 className="mb-3 font-semibold">Additional Information</h3><Detail label="Pay Date" value={date(payslip.payment_date)} /><Detail label="Currency" value={payslip.currency} /><Detail label="Mode of Payment" value={payslip.payment_method || "—"} /></div></section>
      <p className="mt-6 border-t border-slate-200 pt-4 text-xs text-slate-500">Payroll Reference: {payslip.payroll_reference}{payslip.notes ? ` · ${payslip.notes}` : ""}</p>
      <div className="mt-6 flex gap-2 print:hidden"><button onClick={print} className="inline-flex items-center gap-2 rounded-md bg-[#07528b] px-3 py-2 text-sm font-medium text-white"><Printer className="h-4 w-4" />Print Payslip</button><button onClick={download} className="inline-flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium"><Download className="h-4 w-4" />Download PDF</button><button type="button" disabled title="Configure an email provider with PDF attachment support to enable this action" className="inline-flex cursor-not-allowed items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-400"><Mail className="h-4 w-4" />Email Payslip</button></div>
      </article>
    </>
  );
}

function Info({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>; }
function Detail({ label, value }: { label: string; value: string }) { return <p className="mb-2 flex justify-between gap-4"><span className="text-slate-500">{label}</span><span className="text-right font-medium">{value}</span></p>; }
function PayCard({ title, lines, total, tone, money }: { title: string; lines: PayLine[]; total: number; tone: "green" | "red"; money: (value: number) => string }) { return <section className={`rounded-xl border p-5 ${tone === "green" ? "border-emerald-100 bg-emerald-50/60" : "border-rose-100 bg-rose-50/60"}`}><h3 className="mb-4 flex items-center gap-2 font-semibold"><WalletCards className="h-4 w-4" />{title}</h3><div className="flex justify-between border-b border-white/80 pb-2 text-xs font-semibold"><span>Description</span><span>Amount</span></div>{lines.map((line) => <div key={line.description} className="flex justify-between border-b border-white/80 py-3 text-sm"><span>{line.description}</span><span>{money(line.amount)}</span></div>)}<div className="mt-3 flex justify-between font-semibold"><span>Total {title}</span><span>{money(total)}</span></div></section>; }
