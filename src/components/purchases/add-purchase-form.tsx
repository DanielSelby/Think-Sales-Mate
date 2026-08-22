"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Info, Plus, Trash2, Sparkles, ChevronRight, Loader2, ClipboardList, Eye, EyeOff,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { formatCurrency } from "@/lib/sales/format";
import { SHIPPING_METHODS, UNIT_OPTIONS } from "@/lib/purchases/format";
import { createPurchase, type PurchaseItemInput } from "@/app/(dashboard)/purchases/actions";
import { ProductPicker, type PickableProduct } from "@/components/purchases/product-picker";
import { ProductRowCell } from "@/components/purchases/product-row-cell";
import { AttachmentsDropzone, type StagedFile } from "@/components/purchases/attachments-dropzone";
import { AddSupplierDialog } from "@/components/suppliers/add-supplier-dialog";

export interface SupplierOption {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  paymentTerms: string | null;
  currency: string;
}

export interface LocationOption {
  id: string;
  name: string;
  address: string | null;
}

export interface ProjectOption {
  id: string;
  name: string;
}

export interface BankAccountOption {
  id: string;
  name: string;
}

export interface Recommendation {
  productId: string;
  productName: string;
  suggestion: string;
  kind: "reorder" | "frequent" | "supplier" | "saving";
}

interface AddPurchaseFormProps {
  suppliers: SupplierOption[];
  locations: LocationOption[];
  projects: ProjectOption[];
  products: PickableProduct[];
  bankAccounts: BankAccountOption[];
  currency: string;
  recommendations: Recommendation[];
}

interface LineItem {
  key: string;
  productId: string;
  name: string;
  sku: string;
  barcode: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  taxPercent: number;
}

const RECOMMENDATION_ICON_TONE: Record<Recommendation["kind"], string> = {
  reorder: "text-signal",
  frequent: "text-amber",
  supplier: "text-ledger-400",
  saving: "text-signal",
};

function lineTotal(line: LineItem) {
  const gross = line.quantity * line.unitPrice;
  const discount = gross * (line.discountPercent / 100);
  const taxable = gross - discount;
  const tax = taxable * (line.taxPercent / 100);
  return { gross, discount, tax, total: taxable + tax };
}

export function AddPurchaseForm({
  suppliers, locations, projects, products, bankAccounts, currency, recommendations,
}: AddPurchaseFormProps) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const theme = THEMES[activeTheme];
  const [isPending, startTransition] = React.useTransition();
  const [formError, setFormError] = React.useState<string | null>(null);

  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? "");
  const [purchaseDate, setPurchaseDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [expectedDeliveryDate, setExpectedDeliveryDate] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [invoiceNumber, setInvoiceNumber] = React.useState("");
  const [purchaseStatus, setPurchaseStatus] = React.useState<"" | "received" | "pending" | "ordered">("");

  // "Pending" in the dropdown maps to the same "draft" action your
  // Save as Draft button already uses — there's no separate "pending"
  // value in the purchases.status enum.
  const STATUS_TO_ACTION: Record<"received" | "pending" | "ordered", "draft" | "ordered" | "received"> = {
    received: "received",
    pending: "draft",
    ordered: "ordered",
  };
  const [shippingMethod, setShippingMethod] = React.useState<string>(SHIPPING_METHODS[0]);
  const [projectId, setProjectId] = React.useState("");

  const [locationId, setLocationId] = React.useState(locations[0]?.id ?? "");
  const [deliveryAddress, setDeliveryAddress] = React.useState(locations[0]?.address ?? "");
  const [deliveryNotes, setDeliveryNotes] = React.useState("");

  const [items, setItems] = React.useState<LineItem[]>([]);
  const [discountAmount, setDiscountAmount] = React.useState(0);
  const [shippingCost, setShippingCost] = React.useState(0);

  const [paymentMethod, setPaymentMethod] = React.useState("Bank Transfer");
  const [paymentAccount, setPaymentAccount] = React.useState(bankAccounts[0]?.name ?? "");
  const [payFromAccount, setPayFromAccount] = React.useState(bankAccounts[0]?.name ?? "");

  const [purchaseNote, setPurchaseNote] = React.useState("");
  const [internalNote, setInternalNote] = React.useState("");
  const [attachments, setAttachments] = React.useState<StagedFile[]>([]);

  // Hide/show toggle for the Supplier & Purchase Details card.
  const [detailsVisible, setDetailsVisible] = React.useState(true);

  // Inline "Add Supplier" — opens a dialog without leaving this page;
  // once saved, the new supplier is auto-selected as soon as the
  // refreshed `suppliers` prop includes it.
  const [addSupplierOpen, setAddSupplierOpen] = React.useState(false);
  const [pendingSupplierName, setPendingSupplierName] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!pendingSupplierName) return;
    const match = suppliers.find((s) => s.name === pendingSupplierName);
    if (match) {
      setSupplierId(match.id);
      setPendingSupplierName(null);
    }
  }, [suppliers, pendingSupplierName]);

  const selectedSupplier = suppliers.find((s) => s.id === supplierId) ?? null;

  function onLocationChange(id: string) {
    setLocationId(id);
    const loc = locations.find((l) => l.id === id);
    if (loc?.address && !deliveryAddress) setDeliveryAddress(loc.address);
  }

  function addProduct(product: PickableProduct) {
    setItems((prev) => {
      const existing = prev.find((l) => l.productId === product.id);
      if (existing) {
        return prev.map((l) => (l.productId === product.id ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        {
          key: crypto.randomUUID(),
          productId: product.id,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode,
          unit: "pcs",
          quantity: 1,
          unitPrice: product.costPrice,
          discountPercent: 0,
          taxPercent: 15,
        },
      ];
    });
  }

  // "Add Row" — a blank line the user fills in via the row's own inline
  // Product cell, independent of the long search bar above the table.
  function addEmptyRow() {
    setItems((prev) => [
      ...prev,
      {
        key: crypto.randomUUID(),
        productId: "",
        name: "",
        sku: "",
        barcode: null,
        unit: "pcs",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        taxPercent: 15,
      },
    ]);
  }

  // Selecting a product from a row's inline dropdown replaces that row only
  // — Auto SKU, cost price, and barcode update immediately; quantity,
  // discount %, and tax % the user already set are preserved.
  function selectProductForLine(key: string, product: PickableProduct) {
    setItems((prev) =>
      prev.map((l) =>
        l.key === key
          ? { ...l, productId: product.id, name: product.name, sku: product.sku, barcode: product.barcode, unitPrice: product.costPrice }
          : l
      )
    );
  }

  // Placeholder until the Add Product component is provided — it should
  // open that flow and, on save, likely call addProduct() so the new
  // product is inserted as a line here too.
  function handleAddProduct() {
    setFormError("Add Product isn't wired up yet — send the component and I'll connect it.");
  }

  function updateLine(key: string, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setItems((prev) => prev.filter((l) => l.key !== key));
  }

  const computedLines = items.map((l) => ({ line: l, ...lineTotal(l) }));
  const subtotal = computedLines.reduce((sum, c) => sum + c.gross, 0);
  const itemsDiscount = computedLines.reduce((sum, c) => sum + c.discount, 0);
  const tax = computedLines.reduce((sum, c) => sum + c.tax, 0);
  const totalDiscount = itemsDiscount + Math.max(0, discountAmount);
  const grandTotal = subtotal - totalDiscount + tax + Math.max(0, shippingCost);

  function buildInput(action: "draft" | "ordered" | "received") {
    const purchaseItems: PurchaseItemInput[] = items.map((l) => ({
      productId: l.productId,
      quantity: l.quantity,
      unit: l.unit,
      unitPrice: l.unitPrice,
      discountPercent: l.discountPercent,
      taxPercent: l.taxPercent,
    }));

    return {
      supplierId,
      purchaseDate,
      expectedDeliveryDate: expectedDeliveryDate || null,
      reference: reference || null,
      invoiceNumber: invoiceNumber || null,
      shippingMethod: shippingMethod || null,
      projectId: projectId || null,
      locationId,
      deliveryAddress: deliveryAddress || null,
      deliveryNotes: deliveryNotes || null,
      items: purchaseItems,
      discountAmount,
      shippingCost,
      paymentMethod: paymentMethod || null,
      paymentAccount: paymentAccount || null,
      payFromAccount: payFromAccount || null,
      purchaseNote: purchaseNote || null,
      internalNote: internalNote || null,
      action,
    };
  }

  function submit(action: "draft" | "ordered" | "received") {
    setFormError(null);
    if (!supplierId) return setFormError("Select a supplier.");
    if (!locationId) return setFormError("Select where this purchase will be received.");
    if (items.length === 0) return setFormError("Add at least one product.");

    startTransition(async () => {
      const result = await createPurchase(buildInput(action));
      if (!result.ok) {
        setFormError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      router.push(`/purchases/${result.purchaseId}`);
    });
  }

  return (
    <div className="space-y-5 pb-24">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Add Purchase</h1>
          <p className="mt-1 flex items-center gap-1 text-sm text-ledger-500 dark:text-ledger-400">
            Purchases <ChevronRight className="h-3.5 w-3.5" /> Add Purchase
          </p>
        </div>
        <div className="rounded-md border border-ledger-100 bg-white px-4 py-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900">
          <p className="text-xs text-ledger-400">Purchase No.</p>
          <p className="font-mono font-medium text-ink-900 dark:text-white">Auto-generated on save</p>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-2 rounded-md border border-signal/30 bg-signal-soft px-4 py-2.5 text-sm text-ink-900 dark:bg-signal/10 dark:text-white">
        <Info className="h-4 w-4 shrink-0 text-signal" />
        All fields marked with <span className="font-semibold">*</span> are required.
      </div>

      <div className="space-y-5">
          {/* Supplier & Purchase Details — merged card, matching the reference layout */}
          <Card accent="neutral">
            <CardHeader className="flex-row items-center justify-between gap-2 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-ledger-400" />
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Supplier &amp; Purchase Details
                </CardTitle>
              </div>
              <button
                type="button"
                onClick={() => setDetailsVisible((v) => !v)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-ledger-500 hover:bg-ledger-100 dark:text-ledger-400 dark:hover:bg-white/[0.06]"
              >
                {detailsVisible ? (
                  <>
                    <EyeOff className="h-3.5 w-3.5" /> Hide
                  </>
                ) : (
                  <>
                    <Eye className="h-3.5 w-3.5" /> Show
                  </>
                )}
              </button>
            </CardHeader>
            {detailsVisible && (
              <CardContent className="pt-0">
                <div className="grid grid-cols-1 gap-x-5 gap-y-3 md:grid-cols-3">
                  <Field label="Supplier" required>
                    <div className="flex items-center gap-2">
                      <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="flex-1">
                        <option value="" disabled>Select supplier</option>
                        {suppliers.map((s) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </Select>
                      <button
                        type="button"
                        onClick={() => setAddSupplierOpen(true)}
                        title="Add new supplier"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-ledger-200 text-ledger-500 transition-colors hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-400 dark:hover:bg-white/[0.06]"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  </Field>
                  <Field label="Purchase Reference">
                    <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter reference (optional)" />
                  </Field>
                  <Field label="Location" required>
                    <Select value={locationId} onChange={(e) => onLocationChange(e.target.value)}>
                      <option value="" disabled>Select location</option>
                      {locations.map((l) => (
                        <option key={l.id} value={l.id}>{l.name}</option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Invoice No.">
                    <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Enter invoice number" />
                  </Field>
                  <Field label="Payment Terms">
                    <Input value={selectedSupplier?.paymentTerms ?? "—"} disabled className="opacity-70" />
                  </Field>
                  <Field label="Currency" required>
                    <Input value={selectedSupplier?.currency ?? currency} disabled className="opacity-70" />
                  </Field>

                  <Field label="Purchase Date" required>
                    <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
                  </Field>
                  <Field label="Due Date">
                    <Input type="date" value={expectedDeliveryDate} onChange={(e) => setExpectedDeliveryDate(e.target.value)} />
                  </Field>
                  <Field label="Notes">
                    <textarea
                      value={purchaseNote}
                      onChange={(e) => setPurchaseNote(e.target.value)}
                      rows={1}
                      placeholder="Enter notes (optional)"
                      className="flex w-full resize-none rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                    />
                  </Field>
                  <Field label="Purchase Status:" required hint="Pending saves as a draft, Ordered records the purchase, Received also receives the items and updates stock.">
                    <Select value={purchaseStatus} onChange={(e) => setPurchaseStatus(e.target.value as typeof purchaseStatus)}>
                      <option value="">Please Select</option>
                      <option value="received">Received</option>
                      <option value="pending">Pending</option>
                      <option value="ordered">Ordered</option>
                    </Select>
                  </Field>
                </div>

                <details className="mt-4 rounded-md border border-ledger-100 px-3 py-2 dark:border-ledger-700">
                  <summary className="cursor-pointer text-xs font-medium text-ledger-500">
                    More options — shipping method, project, delivery address
                  </summary>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Shipping Method">
                      <Select value={shippingMethod} onChange={(e) => setShippingMethod(e.target.value)}>
                        {SHIPPING_METHODS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Project (Optional)">
                      <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                        <option value="">Select project</option>
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label="Contact Person">
                      <Input value={selectedSupplier?.contactPerson ?? ""} disabled className="opacity-70" />
                    </Field>
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Delivery Address">
                      <textarea
                        value={deliveryAddress}
                        onChange={(e) => setDeliveryAddress(e.target.value)}
                        rows={2}
                        className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </Field>
                    <Field label="Delivery Notes">
                      <textarea
                        value={deliveryNotes}
                        onChange={(e) => setDeliveryNotes(e.target.value)}
                        rows={2}
                        placeholder="Please deliver during working hours."
                        className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                      />
                    </Field>
                  </div>
                </details>
              </CardContent>
            )}
          </Card>

          {/* 4. Product table */}
          <Card accent="neutral">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <StepBadge n={2} />
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Products
                </CardTitle>
              </div>
              <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                <ProductPicker products={products} onSelect={addProduct} className="max-w-none flex-1" theme={theme} />
                <div className="flex shrink-0 items-center gap-2">
                  <Button variant="outline" size="sm" onClick={addEmptyRow}>
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleAddProduct}
                    className="text-white transition-colors"
                    style={{ background: theme.colors.primary }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
                  >
                    <Plus className="h-3.5 w-3.5" /> Add Product
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr
                      className="text-xs font-semibold text-white"
                      style={{ background: theme.colors.primaryMid, borderBottom: `1px solid ${theme.colors.primary}` }}
                    >
                      <th className="w-8 px-3 py-2 font-semibold">#</th>
                      <th className="px-3 py-2 font-semibold">Product</th>
                      <th className="px-3 py-2 font-semibold">SKU</th>
                      <th className="px-3 py-2 font-semibold">Barcode</th>
                      <th className="w-28 px-3 py-2 text-right font-semibold">Unit Price</th>
                      <th className="w-20 px-3 py-2 text-right font-semibold">Qty</th>
                      <th className="w-24 px-3 py-2 font-semibold">Unit</th>
                      <th className="w-24 px-3 py-2 text-right font-semibold">Disc. (%)</th>
                      <th className="w-20 px-3 py-2 text-right font-semibold">Tax (%)</th>
                      <th className="w-28 px-3 py-2 text-right font-semibold">Total</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={11} className="px-4 py-10 text-center text-ledger-400">
                          No products added yet. Search above to add your first line.
                        </td>
                      </tr>
                    )}
                    {computedLines.map(({ line, total }, i) => (
                      <tr key={line.key}>
                        <td className="px-3 py-2 text-ledger-400">{i + 1}</td>
                        <td className="px-3 py-2">
                          <ProductRowCell
                            products={products}
                            currentName={line.name}
                            onSelect={(p) => selectProductForLine(line.key, p)}
                          />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-ledger-500">{line.sku || "—"}</td>
                        <td className="px-3 py-2 font-mono text-xs text-ledger-500">{line.barcode ?? "—"}</td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={line.unitPrice}
                            onChange={(e) => updateLine(line.key, { unitPrice: Number(e.target.value) })}
                            className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={1}
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: Math.max(1, Number(e.target.value)) })}
                            className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={line.unit}
                            onChange={(e) => updateLine(line.key, { unit: e.target.value })}
                            className="h-8 w-full rounded border border-ledger-200 bg-white px-1.5 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          >
                            {UNIT_OPTIONS.map((u) => (
                              <option key={u} value={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={line.discountPercent}
                            onChange={(e) => updateLine(line.key, { discountPercent: Number(e.target.value) })}
                            className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={line.taxPercent}
                            onChange={(e) => updateLine(line.key, { taxPercent: Number(e.target.value) })}
                            className="h-8 w-full rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-medium text-ink-900 dark:text-white">
                          {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            onClick={() => removeLine(line.key)}
                            className="rounded p-1.5 text-alert/70 hover:bg-alert-soft hover:text-alert"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Internal note + Attachments — the supplier-facing note now
              lives in the merged Supplier & Purchase Details card above. */}
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <Card accent="neutral">
              <CardHeader className="pb-2">
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Internal Note
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <Field label="Internal Note (team only)">
                  <textarea
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    rows={3}
                    placeholder="Not shown to the supplier..."
                    className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </Field>
              </CardContent>
            </Card>

            <Card accent="neutral">
              <CardHeader className="pb-2">
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Attach Documents
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <AttachmentsDropzone files={attachments} onChange={setAttachments} />
                <p className="mt-2 text-xs text-ledger-400">
                  Invoices, delivery notes, receipts, and supporting documents.
                </p>
              </CardContent>
            </Card>
          </div>

          {/* Purchase Summary, Payment Info & AI recommendations — moved
              down here so Products above gets the full page width instead
              of being squeezed against a narrow sidebar. */}
          <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-3">
            <Card accent="signal">
              <CardHeader className="pb-2">
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Purchase Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2.5 pt-0 text-sm">
                <SummaryRow label={`Total Items (${items.length})`} value="" muted />
                <SummaryRow label="Subtotal" value={formatCurrency(subtotal, currency)} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ledger-500">Discount</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={discountAmount}
                    onChange={(e) => setDiscountAmount(Number(e.target.value))}
                    className="h-8 w-28 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <SummaryRow label="Tax" value={formatCurrency(tax, currency)} />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-ledger-500">Shipping Cost</span>
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={shippingCost}
                    onChange={(e) => setShippingCost(Number(e.target.value))}
                    className="h-8 w-28 rounded border border-ledger-200 bg-white px-2 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-ledger-100 pt-3 dark:border-ledger-700">
                  <span className="font-medium text-ink-900 dark:text-white">Total Amount</span>
                  <span className="font-display text-lg font-semibold text-signal">
                    {formatCurrency(Math.max(0, grandTotal), currency)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card accent="neutral">
              <CardHeader className="pb-2">
                <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                  Payment Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                <Field label="Payment Method">
                  <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                    {["Bank Transfer", "Cash", "Mobile Money", "Cheque", "Credit"].map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Account">
                  <Select value={paymentAccount} onChange={(e) => setPaymentAccount(e.target.value)}>
                    <option value="">Select account</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Pay From">
                  <Select value={payFromAccount} onChange={(e) => setPayFromAccount(e.target.value)}>
                    <option value="">Select account</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.name}>{a.name}</option>
                    ))}
                  </Select>
                </Field>
                <p className="rounded-md bg-ledger-50 px-3 py-2 text-xs text-ledger-500 dark:bg-white/[0.04]">
                  Payment will be recorded when you choose <strong>Save &amp; Receive Items</strong>, or later from the purchase detail page.
                </p>
              </CardContent>
            </Card>

            {recommendations.length > 0 && (
              <Card accent="amber">
                <CardHeader className="flex-row items-center gap-2 pb-2">
                  <Sparkles className="h-4 w-4 text-amber" />
                  <CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">
                    AI Purchase Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5 pt-0">
                  <p className="text-xs text-ledger-400">Based on your purchase history and sales trends.</p>
                  {recommendations.slice(0, 4).map((r, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Sparkles className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", RECOMMENDATION_ICON_TONE[r.kind])} />
                      <p className="text-ledger-600 dark:text-ledger-300">
                        <span className="font-medium text-ink-900 dark:text-white">{r.productName}</span> — {r.suggestion}
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

      {formError && (
        <div className="rounded-md border border-alert/30 bg-alert-soft px-4 py-2.5 text-sm text-alert">
          {formError}
        </div>
      )}

      {/* Sticky action bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ledger-100 bg-white/95 px-6 py-3 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between">
          <Button variant="outline" size="md" onClick={() => router.back()} disabled={isPending}>
            Cancel
          </Button>
          <div className="flex items-center gap-2">
            {purchaseStatus && (
              <Button
                variant="primary"
                size="md"
                onClick={() => submit(STATUS_TO_ACTION[purchaseStatus])}
                disabled={isPending}
                className="bg-signal hover:bg-signal/90 dark:bg-signal dark:hover:bg-signal/90"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Save as {purchaseStatus === "pending" ? "Draft" : purchaseStatus === "ordered" ? "Ordered" : "Received"}
              </Button>
            )}
            <Button variant="secondary" size="md" onClick={() => submit("draft")} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save as Draft
            </Button>
            <Button variant="primary" size="md" onClick={() => submit("ordered")} disabled={isPending}>
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Purchase
            </Button>
            <Button
              variant="primary"
              size="md"
              onClick={() => submit("received")}
              disabled={isPending}
              className="bg-signal hover:bg-signal/90 dark:bg-signal dark:hover:bg-signal/90"
            >
              {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              <Plus className="h-4 w-4" />
              Save &amp; Receive Items
            </Button>
          </div>
        </div>
      </div>

      <AddSupplierDialog
        open={addSupplierOpen}
        onClose={() => setAddSupplierOpen(false)}
        currency={currency}
        onCreated={(name) => setPendingSupplierName(name)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function StepBadge({ n }: { n: number }) {
  return (
    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-ink-900 text-[11px] font-semibold text-white dark:bg-white dark:text-ink-900">
      {n}
    </span>
  );
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-xs font-medium text-ledger-500">
        {label} {required && <span className="text-alert">*</span>}
        {hint && (
          <span title={hint} className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full bg-signal text-white">
            <Info className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={muted ? "text-ledger-400" : "text-ledger-500"}>{label}</span>
      <span className={cn("font-medium", muted ? "text-ledger-400" : "text-ink-900 dark:text-white")}>{value}</span>
    </div>
  );
}