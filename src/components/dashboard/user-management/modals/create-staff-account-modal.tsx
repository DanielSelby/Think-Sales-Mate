"use client";

import { useState } from "react";
import { Building2, CheckCircle2, Copy, KeyRound, Shield, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEPARTMENTS } from "../constants";
import type { RoleDefinition, UserBranch } from "../types";

interface CreateStaffAccountResult {
  error?: string;
  success?: boolean;
  username?: string;
  temporaryPassword?: string;
}

interface CreateStaffAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleDefinition[];
  branches: UserBranch[];
  onCreateStaff: (formData: FormData) => Promise<CreateStaffAccountResult>;
}

function makePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%";
  const values = new Uint32Array(14);
  if (typeof window !== "undefined" && window.crypto?.getRandomValues) window.crypto.getRandomValues(values);
  return Array.from(values, (value, index) => alphabet[(value + index * 17) % alphabet.length]).join("");
}

function makeUsername(name: string) {
  const base = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `${base || "staff"}.${Math.floor(100 + Math.random() * 900)}`.slice(0, 32);
}

export function CreateStaffAccountModal({
  isOpen,
  onClose,
  roles,
  branches,
  onCreateStaff
}: CreateStaffAccountModalProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [employeeId, setEmployeeId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState(DEPARTMENTS[0]);
  const [role, setRole] = useState(roles[0]?.key ?? "staff");
  const [locationId, setLocationId] = useState(branches[0]?.id ?? "");
  const [branchScope, setBranchScope] = useState<"all" | "assigned" | "single">("assigned");
  const [secondaryBranches, setSecondaryBranches] = useState<string[]>([]);
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdCredentials, setCreatedCredentials] = useState<{ username: string; password: string } | null>(null);

  if (!isOpen) return null;

  const resetAndClose = () => {
    setCreatedCredentials(null);
    setError(null);
    onClose();
  };

  const toggleBranch = (id: string) =>
    setSecondaryBranches((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const resolvedUsername = username.trim().toLowerCase() || makeUsername(fullName);
    const resolvedPassword = password || makePassword();
    const formData = new FormData();
    formData.set("full_name", fullName);
    formData.set("username", resolvedUsername);
    formData.set("password", resolvedPassword);
    formData.set("employee_id", employeeId);
    formData.set("email", email);
    formData.set("phone", phone);
    formData.set("department", department);
    formData.set("role", role);
    formData.set("location_id", locationId);
    formData.set("branch_scope", branchScope);
    formData.set("secondary_location_ids", secondaryBranches.join(","));
    Object.entries(approvals).forEach(([key, value]) => formData.set(key, String(value)));

    try {
      const result = await onCreateStaff(formData);
      if (result.error) {
        setError(result.error);
      } else {
        setCreatedCredentials({
          username: result.username ?? resolvedUsername,
          password: result.temporaryPassword ?? resolvedPassword
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyCredentials = async () => {
    if (!createdCredentials) return;
    await navigator.clipboard?.writeText(`Username: ${createdCredentials.username}\nPassword: ${createdCredentials.password}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600/10 text-emerald-600"><UserPlus className="h-5 w-5" /></div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Create Staff Account</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Provision immediate access without changing the invitation workflow</p>
            </div>
          </div>
          <button type="button" onClick={resetAndClose} className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </div>

        {createdCredentials ? (
          <div className="space-y-5 overflow-y-auto p-6">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
              <div><p className="text-sm font-semibold">Staff account created</p><p className="mt-1 text-xs">Save these credentials securely. The password will not be shown again.</p></div>
            </div>
            <div className="rounded-xl border border-ledger-200 bg-slate-50 p-4 dark:border-ledger-700 dark:bg-slate-800/60">
              <div className="grid gap-3 sm:grid-cols-2">
                <div><p className="text-[10px] font-bold uppercase text-ledger-400">Username</p><p className="mt-1 font-mono text-sm font-semibold text-ink-900 dark:text-white">{createdCredentials.username}</p></div>
                <div><p className="text-[10px] font-bold uppercase text-ledger-400">Temporary password</p><p className="mt-1 font-mono text-sm font-semibold text-ink-900 dark:text-white">{createdCredentials.password}</p></div>
              </div>
            </div>
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={copyCredentials}><Copy className="mr-1.5 h-3.5 w-3.5" /> Copy credentials</Button><Button type="button" onClick={resetAndClose} className="bg-blue-600 text-white hover:bg-blue-700">Done</Button></div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex min-h-0 flex-col">
            <div className="space-y-5 overflow-y-auto p-6">
              {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
              <section className="space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ledger-500"><KeyRound className="h-3.5 w-3.5 text-blue-600" /> Employee information & credentials</div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Full name *<Input required value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1 h-9 text-xs" placeholder="e.g. Kwame Mensah" /></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Employee ID<Input value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 h-9 text-xs font-mono" placeholder="TS-EMP-015" /></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Username *<div className="mt-1 flex gap-2"><Input required value={username} onChange={(event) => setUsername(event.target.value)} className="h-9 text-xs font-mono" placeholder="kwame.mensah" /><Button type="button" variant="outline" size="sm" className="h-9 shrink-0 text-[11px]" onClick={() => setUsername(makeUsername(fullName))}>Generate</Button></div></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Password *<div className="mt-1 flex gap-2"><Input required minLength={8} type="text" value={password} onChange={(event) => setPassword(event.target.value)} className="h-9 text-xs font-mono" placeholder="Generate a secure password" /><Button type="button" variant="outline" size="sm" className="h-9 shrink-0 text-[11px]" onClick={() => setPassword(makePassword())}>Generate</Button></div></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Email (optional)<Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 h-9 text-xs" placeholder="name@company.com" /></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Phone<Input value={phone} onChange={(event) => setPhone(event.target.value)} className="mt-1 h-9 text-xs" placeholder="+233 24 123 4567" /></label>
                </div>
              </section>

              <section className="space-y-3 border-t border-ledger-100 pt-4 dark:border-ledger-800">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ledger-500"><Shield className="h-3.5 w-3.5 text-purple-600" /> Role & branch access</div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Role<select value={role} onChange={(event) => setRole(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white">{roles.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}</select></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Department<select value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white">{DEPARTMENTS.map((item) => <option key={item}>{item}</option>)}</select></label>
                  <label className="text-xs font-semibold text-ink-900 dark:text-white">Primary branch<select required value={locationId} onChange={(event) => setLocationId(event.target.value)} className="mt-1 h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white">{branches.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">{(["all", "assigned", "single"] as const).map((scope) => <button key={scope} type="button" onClick={() => setBranchScope(scope)} className={`rounded-lg border p-2 text-left text-xs ${branchScope === scope ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300" : "border-ledger-200 text-ledger-500 dark:border-ledger-700"}`}><span className="font-semibold">{scope === "all" ? "All branches" : scope === "assigned" ? "Primary + assigned" : "Primary only"}</span></button>)}</div>
                {branchScope === "assigned" && <div className="grid gap-2 sm:grid-cols-2">{branches.filter((item) => item.id !== locationId).map((item) => <label key={item.id} className="flex items-center gap-2 rounded-lg border border-ledger-100 p-2 text-xs dark:border-ledger-800"><input type="checkbox" checked={secondaryBranches.includes(item.id)} onChange={() => toggleBranch(item.id)} />{item.name}</label>)}</div>}
              </section>

              <section className="space-y-3 border-t border-ledger-100 pt-4 dark:border-ledger-800">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ledger-500"><Building2 className="h-3.5 w-3.5 text-amber-600" /> Approval access (optional)</div>
                <div className="grid gap-2 sm:grid-cols-2">{[["approval_stock_transfers", "Stock transfers"], ["approval_purchases", "Purchase orders"], ["approval_expenses", "Operating expenses"], ["approval_price_updates", "Price updates"], ["approval_stock_adjustments", "Stock adjustments"]].map(([key, label]) => <label key={key} className="flex items-center gap-2 text-xs text-ink-900 dark:text-white"><input type="checkbox" checked={Boolean(approvals[key])} onChange={(event) => setApprovals((current) => ({ ...current, [key]: event.target.checked }))} /> Approve {label}</label>)}</div>
              </section>
            </div>
            <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50"><span className="text-[11px] text-ledger-500">Password is stored securely by Supabase Auth.</span><div className="flex gap-2"><Button type="button" variant="outline" onClick={resetAndClose}>Cancel</Button><Button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white hover:bg-blue-700">{isSubmitting ? "Creating account..." : "Create Staff Account"}</Button></div></div>
          </form>
        )}
      </div>
    </div>
  );
}
