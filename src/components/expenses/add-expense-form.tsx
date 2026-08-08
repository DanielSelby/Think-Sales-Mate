"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2, Plus, Trash2, X, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/sales/format";
import {
  EXPENSE_CATEGORIES, PAYMENT_METHODS, DEPARTMENTS, RECURRING_FREQUENCIES,
  EXPENSE_TYPES, CURRENCIES, DISPLAY_STATUS_LABEL, DISPLAY_STATUS_TONE,
} from "@/lib/expenses/format";
import { AttachmentsDropzone, type StagedFile } from "@/components/purchases/attachments-dropzone";
import {
  createExpense, getBudgetStatus, getRecentExpensesForCategory, searchPurchaseOrdersForExpense,
  type ExpenseItemInput, type ApproverOption, type BudgetStatus, type RecentExpenseSummary, type PurchaseOrderOption,
} from "@/app/(dashboard)/expenses/actions";

export interface LocationOption { id: string; name: string; }
export interface BankAccountOption { id: string; name: string; }

interface AddExpenseFormProps {
  locations: LocationOption[];
  bankAccounts: BankAccountOption[];
  approvers: ApproverOption[];
  currency: string;
  currentUserName: string;
}

interface LineItem {
  key: string;
  description: string;
  category: string;
  quantity: number;
  unitCost: number;
  taxAmount: number;
}

export function AddExpenseForm({ locations, bankAccounts, approvers, currency, currentUserName }: AddExpenseFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [expenseDate, setExpenseDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = React.useState("");
  const [category, setCategory] = React.useState<string>(EXPENSE_CATEGORIES[0]);
  const [department, setDepartment] = React.useState<string>(DEPARTMENTS[0]);
  const [vendor, setVendor] = React.useState("");
  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [poQuery, setPoQuery] = React.useState("");
  const [poResults, setPoResults] = React.useState<PurchaseOrderOption[]>([]);
  const [selectedPo, setSelectedPo] = React.useState<PurchaseOrderOption | null>(null);
  const [poOpen, setPoOpen] = React.useState(false);

  const [items, setItems] = React.useState<LineItem[]>([
    { key: crypto.randomUUID(), description: "", category, quantity: 1, unitCost: 0, taxAmount: 0 },
  ]);

  const [expenseType, setExpenseType] = React.useState<string>(EXPENSE_TYPES[0]);
  const [tags, setTags] = React.useState<string[]>([]);
  const [tagInput, setTagInput] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const [approvalRequired, setApprovalRequired] = React.useState(true);
  const [approverId, setApproverId] = React.useState(approvers[0]?.id ?? "");
  const [comments, setComments] = React.useState("");

  const [paymentMethod, setPaymentMethod] = React.useState<string>(PAYMENT_METHODS[0]);
  const [paymentAccount, setPaymentAccount] = React.useState(bankAccounts[0]?.name ?? "");
  const [transactionReference, setTransactionReference] = React.useState("");
  const [expenseCurrency, setExpenseCurrency] = React.useState<string>(currency);
  const [paymentStatus, setPaymentStatus] = React.useState<"unpaid" | "paid">("unpaid");
  const [paidOn, setPaidOn] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [discountAmount, setDiscountAmount] = React.useState(0);

  const [isRecurring, setIsRecurring] = React.useState(false);
  const [recurringFrequency, setRecurringFrequency] = React.useState<string>(RECURRING_FREQUENCIES[1]);
  const [attachments, setAttachments] = React.useState<StagedFile[]>([]);

  const [budget, setBudget] = React.useState<BudgetStatus | null>(null);
  const [recentExpenses, setRecentExpenses] = React.useState<RecentExpenseSummary[]>([]);

  React.useEffect(() => {
    getBudgetStatus(category).then(setBudget);
    getRecentExpensesForCategory(category).then(setRecentExpenses);
  }, [category]);

  React.useEffect(() => {
    if (!poOpen) return;
    const t = setTimeout(() => {
      searchPurchaseOrdersForExpense(poQuery).then(setPoResults);
    }, 200);
    return () => clearTimeout(t);
  }, [poQuery, poOpen]);

  function addItem() {
    setItems((prev) => [...prev, { key: crypto.randomUUID(), description: "", category, quantity: 1, unitCost: 0, taxAmount: 0 }]);
  }
  function updateItem(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  }
  function removeItem(key: string) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.key !== key) : prev));
  }

  function addTag() {
    const t = tagInput.trim();
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t]);
    setTagInput("");
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCost, 0);
  const taxTotal = items.reduce((sum, i) => sum + i.taxAmount, 0);
  const total = Math.max(0, subtotal + taxTotal - discountAmount);

  function buildItems(): ExpenseItemInput[] {
    return items
      .filter((i) => i.description.trim())
      .map((i) => ({ description: i.description, category: i.category, quantity: i.quantity, unitCost: i.unitCost, taxAmount: i.taxAmount }));
  }

  function submit(action: "draft" | "submitted", forceApproval: boolean) {
    setError(null);
    const finalApprovalRequired = forceApproval ? true : approvalRequired;
    if (forceApproval && !approverId) {
      setError("Select an approver before submitting for approval.");
      return;
    }
    if (buildItems().length === 0) {
      setError("Add at least one expense item with a description.");
      return;
    }

    startTransition(async () => {
      const result = await createExpense({
        category, vendor: vendor || null, department, locationId: locationId || null,
        paymentMethod, paymentAccount: paymentAccount || null, transactionReference: transactionReference || null,
        currency: expenseCurrency, referenceNumber: reference || null,
        purchaseOrderId: selectedPo?.id ?? null, expenseDate, dueDate: null, notes: notes || null,
        expenseType, tags, approvalRequired: finalApprovalRequired, approverId: approverId || null,
        discountAmount, paymentStatus, paidOn: paymentStatus === "paid" ? paidOn : null,
        items: buildItems(), isRecurring, recurringFrequency: isRecurring ? recurringFrequency : null,
        action,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      router.push("/expenses");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Add Expense</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">
            Home <ChevronRight className="h-3.5 w-3.5" /> Expenses <ChevronRight className="h-3.5 w-3.5" /> Add Expense
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="md" onClick={() => router.back()} disabled={isPending}>Cancel</Button>
          <Button variant="secondary" size="md" onClick={() => submit("draft", false)} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Draft
          </Button>
          <Button variant="outline" size="md" onClick={() => submit("submitted", true)} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Submit for Approval
          </Button>
          <Button variant="primary" size="md" onClick={() => submit("submitted", false)} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Expense
          </Button>
        </div>
      </div>

      {error && <div className="rounded-md border border-alert/30 bg-alert-soft px-4 py-2.5 text-sm text-alert">{error}</div>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {/* Expense Information */}
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Expense Information</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Field label="Expense Date" required><Input type="date" value={expenseDate} onChange={(e) => setExpenseDate(e.target.value)} /></Field>
                <Field label="Expense No."><Input value="Auto-generated" disabled className="opacity-70" /></Field>
                <Field label="Reference / Description">
                  <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Office stationery and printer ink" />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <Field label="Category" required>
                  <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                    {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </Select>
                </Field>
                <Field label="Department">
                  <Select value={department} onChange={(e) => setDepartment(e.target.value)}>
                    {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
                  </Select>
                </Field>
                <Field label="Vendor / Payee" required>
                  <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="e.g. Office Depot Ghana" />
                </Field>
                <Field label="Purchase Order (Optional)">
                  <div className="relative">
                    {selectedPo ? (
                      <div className="flex h-10 items-center justify-between rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                        <span className="truncate">{selectedPo.label}</span>
                        <button onClick={() => setSelectedPo(null)}><X className="h-3.5 w-3.5 text-ledger-400" /></button>
                      </div>
                    ) : (
                      <Input value={poQuery} onFocus={() => setPoOpen(true)} onChange={(e) => { setPoQuery(e.target.value); setPoOpen(true); }} placeholder="Search PO..." />
                    )}
                    {poOpen && !selectedPo && poResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-11 z-30 max-h-48 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                        {poResults.map((p) => (
                          <button key={p.id} onClick={() => { setSelectedPo(p); setPoOpen(false); setPoQuery(""); }} className="block w-full truncate px-3 py-2 text-left text-sm hover:bg-ledger-50 dark:hover:bg-white/[0.06]">
                            {p.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            </CardContent>
          </Card>

          {/* Expense Items */}
          <Card accent="neutral">
            <CardHeader className="flex-row items-center justify-between pb-2">
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Expense Items</CardTitle>
              <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" /> Add Item</Button>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-ledger-100 bg-ledger-50/60 text-xs text-ledger-400 dark:border-ledger-700 dark:bg-white/[0.03]">
                      <th className="w-8 px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 font-medium">Item / Description</th>
                      <th className="w-36 px-3 py-2 font-medium">Category</th>
                      <th className="w-16 px-3 py-2 text-right font-medium">Qty</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Unit Cost</th>
                      <th className="w-20 px-3 py-2 text-right font-medium">Tax</th>
                      <th className="w-24 px-3 py-2 text-right font-medium">Amount</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                    {items.map((item, i) => (
                      <tr key={item.key}>
                        <td className="px-3 py-2 text-ledger-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <input value={item.description} onChange={(e) => updateItem(item.key, { description: e.target.value })} placeholder="e.g. A4 Papers (Double A)" className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                        </td>
                        <td className="px-3 py-2">
                          <select value={item.category} onChange={(e) => updateItem(item.key, { category: e.target.value })} className="h-8 w-full rounded border border-ledger-200 bg-white px-1.5 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white">
                            {EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(item.key, { quantity: Math.max(1, Number(e.target.value)) })} className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} step="0.01" value={item.unitCost} onChange={(e) => updateItem(item.key, { unitCost: Number(e.target.value) })} className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0} step="0.01" value={item.taxAmount} onChange={(e) => updateItem(item.key, { taxAmount: Number(e.target.value) })} className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-ink-900 dark:text-white">
                          {(item.quantity * item.unitCost + item.taxAmount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={() => removeItem(item.key)} className="rounded p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-ledger-50/60 font-medium dark:bg-white/[0.03]">
                      <td colSpan={3} className="px-3 py-2 text-right text-ledger-500">Total</td>
                      <td className="px-3 py-2 text-right text-ledger-500">{items.reduce((s, i) => s + i.quantity, 0)}</td>
                      <td />
                      <td className="px-3 py-2 text-right text-ledger-500">{taxTotal.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right font-mono text-ink-900 dark:text-white">{(subtotal + taxTotal).toFixed(2)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Additional Info + Approval */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card accent="neutral">
              <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Additional Information</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Field label="Expense Type">
                  <Select value={expenseType} onChange={(e) => setExpenseType(e.target.value)}>
                    {EXPENSE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </Select>
                </Field>
                <Field label="Tags (Optional)">
                  <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ledger-200 p-1.5 dark:border-ledger-700">
                    {tags.map((t) => (
                      <Badge key={t} tone="neutral" className="flex items-center gap-1">
                        {t} <button onClick={() => setTags((prev) => prev.filter((x) => x !== t))}><X className="h-3 w-3" /></button>
                      </Badge>
                    ))}
                    <input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                      placeholder="Add tag..."
                      className="h-6 flex-1 min-w-[80px] border-none bg-transparent text-sm outline-none dark:text-white"
                    />
                  </div>
                </Field>
                <Field label="Notes (Optional)">
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="For general office use." className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                </Field>
                <label className="flex items-center gap-2 text-sm text-ink-900 dark:text-white">
                  <input type="checkbox" checked={isRecurring} onChange={(e) => setIsRecurring(e.target.checked)} className="h-4 w-4 rounded border-ledger-300 accent-signal" />
                  Recurring expense
                </label>
                {isRecurring && (
                  <Field label="Frequency">
                    <Select value={recurringFrequency} onChange={(e) => setRecurringFrequency(e.target.value)}>
                      {RECURRING_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
                    </Select>
                  </Field>
                )}
              </CardContent>
            </Card>

            <Card accent="neutral">
              <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Approval Information</CardTitle></CardHeader>
              <CardContent className="space-y-3 pt-0">
                <label className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ledger-500">Approval Required</span>
                  <button
                    onClick={() => setApprovalRequired((v) => !v)}
                    className={`relative h-5 w-9 rounded-full transition-colors ${approvalRequired ? "bg-signal" : "bg-ledger-200 dark:bg-ledger-700"}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${approvalRequired ? "translate-x-4" : "translate-x-0.5"}`} />
                  </button>
                </label>
                <Field label="Requested By"><Input value={currentUserName} disabled className="opacity-70" /></Field>
                <Field label="Approver">
                  <Select value={approverId} onChange={(e) => setApproverId(e.target.value)} disabled={!approvalRequired}>
                    <option value="">Select approver</option>
                    {approvers.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </Select>
                </Field>
                <div>
                  <p className="mb-1 text-xs font-medium text-ledger-500">Approval Status</p>
                  <Badge tone={DISPLAY_STATUS_TONE.pending_approval}>{DISPLAY_STATUS_LABEL.pending_approval}</Badge>
                </div>
                <Field label="Comments (Optional)">
                  <textarea value={comments} onChange={(e) => setComments(e.target.value)} rows={2} placeholder="Waiting for manager approval." className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 dark:border-ledger-700 dark:bg-ink-900 dark:text-white" />
                </Field>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Payment Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 pt-0">
              <Field label="Payment Method" required>
                <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                </Select>
              </Field>
              <Field label="Payment Account" required>
                <Select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}>
                  <option value="">Select account</option>
                  {bankAccounts.map((a) => <option key={a.id} value={a.name}>{a.name}</option>)}
                </Select>
              </Field>
              <Field label="Transaction ID / Reference">
                <Input value={transactionReference} onChange={(e) => setTransactionReference(e.target.value)} placeholder="MOMO-20250531-123456" />
              </Field>
              <Field label="Currency">
                <Select value={expenseCurrency} onChange={(e) => setExpenseCurrency(e.target.value)}>
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Payment Status" required>
                  <Select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as "unpaid" | "paid")}>
                    <option value="unpaid">Unpaid</option>
                    <option value="paid">Paid</option>
                  </Select>
                </Field>
                <Field label="Paid On">
                  <Input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} disabled={paymentStatus !== "paid"} />
                </Field>
              </div>
              <Field label="Discount (if applicable)">
                <Input type="number" min={0} step="0.01" value={discountAmount} onChange={(e) => setDiscountAmount(Number(e.target.value))} />
              </Field>
            </CardContent>
          </Card>

          <Card accent="neutral">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Attachments</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <AttachmentsDropzone files={attachments} onChange={setAttachments} />
            </CardContent>
          </Card>

          <Card accent="signal">
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Expense Summary</CardTitle></CardHeader>
            <CardContent className="space-y-2 pt-0 text-sm">
              <div className="flex items-center justify-between"><span className="text-ledger-500">Subtotal (Excl. Tax)</span><span className="font-medium text-ink-900 dark:text-white">{formatCurrency(subtotal, expenseCurrency)}</span></div>
              <div className="flex items-center justify-between"><span className="text-ledger-500">Tax Amount</span><span className="font-medium text-ink-900 dark:text-white">{formatCurrency(taxTotal, expenseCurrency)}</span></div>
              {discountAmount > 0 && (
                <div className="flex items-center justify-between"><span className="text-ledger-500">Discount</span><span className="font-medium text-alert">-{formatCurrency(discountAmount, expenseCurrency)}</span></div>
              )}
              <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-3 dark:border-ledger-700">
                <span className="font-medium text-ink-900 dark:text-white">Total Amount</span>
                <span className="font-display text-lg font-semibold text-signal">{formatCurrency(total, expenseCurrency)}</span>
              </div>
            </CardContent>
          </Card>

          {recentExpenses.length > 0 && (
            <Card accent="neutral">
              <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Recent Expenses ({category})</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-0">
                {recentExpenses.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <span className="text-ledger-500">{new Date(e.date).toLocaleDateString("en-GH", { day: "2-digit", month: "short" })}</span>
                    <span className="font-mono text-ink-900 dark:text-white">{formatCurrency(e.amount, currency)}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card accent={budget?.hasBudget && budget.percentUsed >= 90 ? "alert" : "amber"}>
            <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Budget Status</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {!budget?.hasBudget ? (
                <p className="text-sm text-ledger-400">No monthly budget set for {category}.</p>
              ) : (
                <>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span className="text-ledger-500">{formatCurrency(budget.spentThisMonth, currency)} of {formatCurrency(budget.monthlyLimit, currency)}</span>
                    <span className="font-medium text-ink-900 dark:text-white">{budget.percentUsed}%</span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-ledger-100 dark:bg-white/[0.06]">
                    <div className={`h-1.5 rounded-full ${budget.percentUsed >= 90 ? "bg-alert" : "bg-amber"}`} style={{ width: `${budget.percentUsed}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-ledger-400">{formatCurrency(budget.remaining, currency)} remaining this month</p>
                </>
              )}
            </CardContent>
          </Card>

          <Card accent="amber">
            <CardHeader className="flex-row items-center gap-2 pb-2">
              <Sparkles className="h-4 w-4 text-amber" />
              <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">AI Expense Insights</CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-sm text-ledger-500">
              {budget?.hasBudget && budget.percentUsed >= 90 ? (
                <p>{category} spending is at {budget.percentUsed}% of this month's budget — this expense may push it over.</p>
              ) : recentExpenses.length >= 3 ? (
                <p>You've logged {recentExpenses.length} {category} expenses recently, averaging {formatCurrency(recentExpenses.reduce((s, e) => s + e.amount, 0) / recentExpenses.length, currency)}.</p>
              ) : (
                <p>Not enough history yet for a useful insight on {category}.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
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