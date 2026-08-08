"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EMPLOYMENT_TYPE_LABEL } from "@/lib/hrm/format";
import { createEmployee } from "@/app/(dashboard)/hrm/actions";
import type { EmploymentType } from "@/types/database";

const EMPLOYMENT_TYPES: EmploymentType[] = ["full_time", "part_time", "contract", "intern"];

export function AddEmployeeForm({ departments }: { departments: string[] }) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [fullName, setFullName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [jobTitle, setJobTitle] = React.useState("");
  const [department, setDepartment] = React.useState(departments[0] ?? "");
  const [customDepartment, setCustomDepartment] = React.useState("");
  const [employmentType, setEmploymentType] = React.useState<EmploymentType>("full_time");
  const [monthlySalary, setMonthlySalary] = React.useState("");
  const [hireDate, setHireDate] = React.useState(() => new Date().toISOString().slice(0, 10));

  function submit() {
    setError(null);
    const salary = Number(monthlySalary);
    if (Number.isNaN(salary) || salary <= 0) {
      setError("Enter a valid monthly salary.");
      return;
    }
    const finalDepartment = department === "__custom__" ? customDepartment : department;

    startTransition(async () => {
      const result = await createEmployee({
        fullName, email: email || null, phone: phone || null, jobTitle: jobTitle || null,
        department: finalDepartment || null, employmentType, monthlySalary: salary, hireDate,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/hrm/employees");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Add Employee</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">
            HRM &amp; Payroll <ChevronRight className="h-3.5 w-3.5" /> Employees <ChevronRight className="h-3.5 w-3.5" /> Add Employee
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={() => router.back()} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Employee
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-alert/30 bg-alert-soft px-4 py-2.5 text-sm text-alert">{error}</div>}

      <Card accent="neutral" className="max-w-2xl">
        <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Employee Information</CardTitle></CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Field label="Full Name" required><Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="e.g. Daniel Mensah" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Email"><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
            <Field label="Phone"><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Position / Job Title"><Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g. Software Developer" /></Field>
            <Field label="Department">
              <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                {departments.map((d) => <option key={d} value={d}>{d}</option>)}
                <option value="__custom__">+ New department...</option>
              </Select>
              {department === "__custom__" && (
                <Input className="mt-2" value={customDepartment} onChange={(e) => setCustomDepartment(e.target.value)} placeholder="Department name" />
              )}
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Employment Type">
              <Select value={employmentType} onChange={(e) => setEmploymentType(e.target.value as EmploymentType)}>
                {EMPLOYMENT_TYPES.map((t) => <option key={t} value={t}>{EMPLOYMENT_TYPE_LABEL[t]}</option>)}
              </Select>
            </Field>
            <Field label="Monthly Salary" required><Input type="number" min={0} step="0.01" value={monthlySalary} onChange={(e) => setMonthlySalary(e.target.value)} placeholder="0.00" /></Field>
            <Field label="Joining Date"><Input type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} /></Field>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">{label} {required && <span className="text-alert">*</span>}</span>
      {children}
    </label>
  );
}