"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Pencil,
  Check,
  ChevronDown,
  ChevronUp,
  StickyNote,
  Paperclip,
  RotateCcw,
  ArrowRight,
  Star,
  Building2,
  Package2,
  User,
  Users,
  Mail,
  Phone,
  Smartphone,
  IdCard,
  MapPin,
  Globe,
  Banknote,
  Info,
  AlertTriangle,
  Calendar
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useAppStore, THEMES } from "@/store/useAppStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SaleProductRowCell } from "@/components/sales/sale-product-row-cell";
import { AddContactDialog } from "@/components/contacts/add-contact-dialog";
import { recordSale, updateSale, addCustomer, getSaleInvoiceItems } from "@/app/(dashboard)/sales/actions";
import { buildInvoiceHtml, waitForInvoiceImages } from "@/lib/sales/invoice-template";
import { InvoiceFormatSelect } from "@/components/sales/invoice-format-select";
import { useInvoiceFormat, type SalesInvoiceTemplate } from "@/lib/sales/invoice-format";
import { derivePaymentStatus, formatCurrency } from "@/lib/sales/format";
import { addDaysToIsoDate } from "@/lib/sales/payment-terms";
import { CrossBranchStockButton } from "@/components/inventory/cross-branch-stock-button";
import { enqueueOfflineOperation } from "@/lib/offline/queue";
import { isOfflineTransactionsEnabled } from "@/lib/offline/cache";
import { TransactionFeedback } from "@/components/transactions/transaction-feedback";
import { OutOfStockFeedback, type OutOfStockItem } from "@/components/transactions/out-of-stock-feedback";
import { SmartProductSummary, useSmartProductLocator } from "@/components/transactions/smart-product-locator";
import { CustomerBalancePop } from "@/components/sales/customer-balance-pop";


export interface SellableProduct {
  id: string;
  locationId: string | null;
  sku: string;
  barcode?: string | null;
  name: string;
  unitPrice: number;
  wholesalePrice: number | null;
  vipPrice: number | null;
  specialPrice: number | null;
  costPrice: number;
  stockQuantity: number;
  allowNegativeStock: boolean;
}

export interface SaleCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  outstanding: number;
  isReturning: boolean;
  paymentTermsDays: number;
}

type PriceTier = "retail" | "wholesale" | "vip" | "special";
function getTierPrice(product: SellableProduct, tier: PriceTier) {
  if (tier === "wholesale") return product.wholesalePrice ?? product.unitPrice;
  if (tier === "vip") return product.vipPrice ?? product.unitPrice;
  if (tier === "special") return product.specialPrice ?? product.unitPrice;
  return product.unitPrice;
}

export interface SaleLocation {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  email: string | null;
}

export interface SalesRep {
  id: string;
  email: string;
  name: string | null;
}

export interface SaleStockLevel {
  productId: string;
  locationId: string;
  quantity: number;
}

export interface InitialSaleData {
  id: string;
  saleNumber: number;
  documentStatus: "draft" | "quotation" | "proforma" | "final";
  customerId: string | null;
  customerName: string | null;
  locationId: string | null;
  reference: string | null;
  saleDate: string;
  dueDate: string | null;
  paymentMethod: string | null;
  amountPaid: number | null;
  shippingAmount: number;
  discountAmount: number;
  taxAmount: number;
  items: { productId: string; quantity: number; unitPrice: number; discountPercent: number; taxPercent: number }[];
}

export interface RecentItem {
  id: string;
  name: string;
  unitPrice: number;
}

interface LineItem {
  key: string;
  productId: string;
  quantity: number;
  discountPercent: number;
  taxPercent: number;
}

const TAX_RATES = [0, 5, 12.5, 15];
const PAYMENT_METHODS = ["Cash", "MoMo", "Card", "Bank Transfer", "Store Credit"];
const DRAFT_KEY = "salesmate:new-sale-draft";

function formatMoney(value: number, currency: string) {
  return formatCurrency(value, currency);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function createInitialSaleLines(initialSale?: InitialSaleData): LineItem[] {
  return initialSale?.items.map((item, index) => ({
    key: `sale-${initialSale.id}-${index}`,
    productId: item.productId,
    quantity: item.quantity,
    discountPercent: item.discountPercent,
    taxPercent: item.taxPercent,
  })) ?? [];
}

function StepBadge({ index, label, active }: { index: number; label: string; active: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          active
            ? "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-signal text-xs font-semibold text-white"
            : "flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ledger-100 text-xs font-semibold text-ledger-400 dark:bg-white/[0.06]"
        }
      >
        {index}
      </span>
      <span className={active ? "text-sm font-medium text-ink-900 dark:text-white" : "text-sm font-medium text-ledger-400"}>
        {label}
      </span>
    </div>
  );
}

export function SaleForm({
  products,
  customers,
  locations,
  reps,
  recentItems,
  stockLevels,
  initialSale,
  currentUserId,
  currentUserEmail,
  orgId,
  orgName,
  systemName,
  currency,
  logoUrl,
  showLogoOnInvoices,
  organizationPhone,
  organizationEmail,
  organizationWebsite,
  showOrganizationContact,
  invoiceTemplate,
  invoiceSlogan,
  invoiceThankYouMessage,
  invoiceTermsAndConditions,
  canCheckCrossBranchStock,
  canChoosePriceTier,
  allowedPriceGroups,
}: {
  products: SellableProduct[];
  customers: SaleCustomer[];
  locations: SaleLocation[];
  reps: SalesRep[];
  recentItems: RecentItem[];
  stockLevels?: SaleStockLevel[];
  initialSale?: InitialSaleData;
  currentUserId: string;
  orgId: string;
  orgName: string;
  systemName: string;
  currency: string;
  currentUserEmail: string;
  logoUrl?: string | null;
  showLogoOnInvoices?: boolean;
  organizationPhone?: string | null;
  organizationEmail?: string | null;
  organizationWebsite?: string | null;
  showOrganizationContact?: boolean;
  invoiceTemplate?: SalesInvoiceTemplate;
  invoiceSlogan?: string | null;
  invoiceThankYouMessage?: string | null;
  invoiceTermsAndConditions?: string | null;
  canCheckCrossBranchStock: boolean;
  canChoosePriceTier: boolean;
  allowedPriceGroups: PriceTier[];
}) {
  const router = useRouter();
  const { activeTheme } = useAppStore();
  const [invoiceFormat, setInvoiceFormat] = useInvoiceFormat(currentUserId);
  const theme = THEMES[activeTheme];
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [transactionFeedback, setTransactionFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [stockWarning, setStockWarning] = useState<string | null>(null);
  const [outOfStockFeedback, setOutOfStockFeedback] = useState<{ item: OutOfStockItem; message: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [editingSaleId] = useState<string | null>(initialSale?.id ?? null);
  const [confirmZeroPayment, setConfirmZeroPayment] = useState(false);
  const [pendingRemoveKey, setPendingRemoveKey] = useState<string | null>(null);
  const [payBalanceOpen, setPayBalanceOpen] = useState(false);
  const [payBalanceInput, setPayBalanceInput] = useState("");

  // Customer
  const [customerList, setCustomerList] = useState<SaleCustomer[]>(customers);
  const [customerQuery, setCustomerQuery] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(initialSale?.customerId ?? null);
  const [walkInName, setWalkInName] = useState(initialSale?.customerId ? "" : initialSale?.customerName ?? "");
  const [customerBalanceNotice, setCustomerBalanceNotice] = useState<{ name: string; balance: number } | null>(null);
  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [customerSectionCollapsed, setCustomerSectionCollapsed] = useState(false);

  // Sale details
  const [saleDate, setSaleDate] = useState(initialSale?.saleDate ?? todayIso());
  const [dueDate, setDueDate] = useState(initialSale?.dueDate ?? addDaysToIsoDate(
    initialSale?.saleDate ?? todayIso(),
    customers.find((customer) => customer.id === initialSale?.customerId)?.paymentTermsDays ?? 0,
  ));
  const [saleTime, setSaleTime] = useState(() => new Date().toTimeString().slice(0, 5));
  const [salesRepId, setSalesRepId] = useState(currentUserId);
  const [locationId, setLocationId] = useState(initialSale?.locationId ?? locations[0]?.id ?? "");
  const [reference, setReference] = useState(initialSale?.reference ?? "");
  const [paymentTerm, setPaymentTerm] = useState(PAYMENT_METHODS[0]);
  const [docStatus, setDocStatus] = useState<"" | "draft" | "quotation" | "proforma" | "final">(initialSale?.documentStatus ?? "");
  const [invoiceScheme, setInvoiceScheme] = useState("Default");

  // Products
  const [search, setSearch] = useState("");
  const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);
  const uniqueProductSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (uniqueProductSearchTimer.current) clearTimeout(uniqueProductSearchTimer.current);
  }, []);
  const [stockFilter, setStockFilter] = useState<"all" | "available">("all");
  const [lines, setLines] = useState<LineItem[]>(() => createInitialSaleLines(initialSale));
  const smartLocator = useSmartProductLocator(lines);
  const [autoMergeDuplicates, setAutoMergeDuplicates] = useState(false);
  const [duplicateProduct, setDuplicateProduct] = useState<{ id: string; name: string; keys: string[] } | null>(null);
  const [priceTier, setPriceTier] = useState<PriceTier>(allowedPriceGroups[0] ?? "retail");

  // Additional information / charges — always visible now (the reference
  // shows Notes, Attach Document, Shipping, Other Charges, Discount, and
  // Tax as permanent fields rather than toggled quick-actions).
  const [note, setNote] = useState("");
  const [shippingAmount, setShippingAmount] = useState(initialSale?.shippingAmount ?? 0);
  const [otherChargesAmount, setOtherChargesAmount] = useState(0);
  const [additionalDiscountAmount, setAdditionalDiscountAmount] = useState(initialSale?.discountAmount ?? 0);
  const [additionalTaxPercent, setAdditionalTaxPercent] = useState(0);
  const [attachedFileName, setAttachedFileName] = useState<string | null>(null);

  // "Additional Options" checkboxes — printReceipt/updateStockOption
  // reflect what recordSale already does today (stock always adjusts), so
  // they're currently display-only. addToCustomerCredit/addToSalesQuotation
  // aren't backed by any table yet — flagging rather than inventing one.
  const [printReceipt, setPrintReceipt] = useState(true);
  const [updateStockOption, setUpdateStockOption] = useState(true);
  const [addToCustomerCredit, setAddToCustomerCredit] = useState(false);
  const [addToSalesQuotation, setAddToSalesQuotation] = useState(false);

  // Inline per-row product replacement — independent of the long search
  // bar's `search`/filteredProducts state above the table.
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // Payment
  const [paymentMethod, setPaymentMethod] = useState(initialSale?.paymentMethod ?? PAYMENT_METHODS[0]);
  const [amountPaid, setAmountPaid] = useState(initialSale?.amountPaid ?? 0);

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const selectedCustomer = customerList.find((c) => c.id === selectedCustomerId) ?? null;
  const dismissCustomerBalanceNotice = useCallback(() => setCustomerBalanceNotice(null), []);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return customerList.slice(0, 8);
    return customerList
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone?.includes(q) || c.email?.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customerList, customerQuery]);

  // product_id -> location_id -> quantity — same pattern as the POS screen.
  const stockByProduct = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const s of stockLevels ?? []) {
      if (!map.has(s.productId)) map.set(s.productId, new Map());
      map.get(s.productId)!.set(s.locationId, s.quantity);
    }
    return map;
  }, [stockLevels]);

  // Keep the branch-visible catalog searchable, but use only this location's
  // quantity. Zero-stock items remain visible and are rendered unavailable.
  const locationProducts = useMemo(() => {
    if (!locationId) return [];
    return products.flatMap((p) => {
      const locationStock = stockByProduct.get(p.id);
      if (p.locationId !== locationId && !locationStock?.has(locationId)) return [];
      return [{ ...p, stockQuantity: locationStock?.get(locationId) ?? 0 }];
    });
  }, [products, stockByProduct, locationId]);

  const locationProductById = useMemo(
    () => new Map(locationProducts.map((p) => [p.id, p])),
    [locationProducts]
  );

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return locationProducts.filter((p) => {
      if (stockFilter === "available" && p.stockQuantity <= 0) return false;
      return !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode ?? "").toLowerCase().includes(q);
    });
  }, [locationProducts, search, stockFilter]);
  const hasOnlyUnavailableMatches = Boolean(search.trim())
    && filteredProducts.length > 0
    && filteredProducts.every((product) => !product.allowNegativeStock && product.stockQuantity <= 0);

  const computedLines = lines.map((line) => {
    const product = locationProductById.get(line.productId) ?? productById.get(line.productId);
    const unitPrice = product ? getTierPrice(product, priceTier) : 0;
    const lineSubtotal = unitPrice * line.quantity;
    const lineDiscount = lineSubtotal * (line.discountPercent / 100);
    const taxable = lineSubtotal - lineDiscount;
    const lineTax = taxable * (line.taxPercent / 100);
    return { line, product, unitPrice, lineSubtotal, lineDiscount, taxable, lineTax, rowTotal: taxable };
  });
  const hasCostWarning = computedLines.some(({ product }) => product && [product.unitPrice, product.wholesalePrice, product.vipPrice, product.specialPrice].some((price) => price != null && price <= product.costPrice));

  const totalQuantity = lines.reduce((sum, l) => sum + l.quantity, 0);
  const subtotal = computedLines.reduce((sum, c) => sum + c.lineSubtotal, 0);
  const discountTotal = computedLines.reduce((sum, c) => sum + c.lineDiscount, 0);
  const taxTotal = computedLines.reduce((sum, c) => sum + c.lineTax, 0);
  const additionalTaxAmount = Math.max(0, (subtotal - discountTotal - additionalDiscountAmount) * (additionalTaxPercent / 100));
  const total = subtotal - discountTotal - additionalDiscountAmount + taxTotal + additionalTaxAmount + shippingAmount + otherChargesAmount;
  const changeOrDue = amountPaid - total;
  const balanceDue = Math.max(0, total - amountPaid);

  function updateLine(key: string, patch: Partial<LineItem>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addProduct(productId: string) {
    const product = locationProductById.get(productId);
    if (!product) return;
    if (!product.allowNegativeStock && product.stockQuantity <= 0) {
      setOutOfStockFeedback({
        item: { name: product.name, category: null, brand: null, stockQuantity: 0, availableStock: 0 },
        message: `"${product.name}" is out of stock at this location and cannot be added.`,
      });
      return;
    }
    const existing = lines.filter((l) => l.productId === productId);
    if (existing.length && autoMergeDuplicates) {
      updateLine(existing[0].key, { quantity: existing[0].quantity + 1 });
      smartLocator.locate(existing[0].key);
      return;
    }
    if (existing.length) {
      setDuplicateProduct({ id: productId, name: product.name, keys: existing.map((line) => line.key) });
      return;
    }
    setLines((prev) => [...prev, { key: crypto.randomUUID(), productId, quantity: 1, discountPercent: 0, taxPercent: 0 }]);
  }

  function clearUniqueProductSearchTimer() {
    if (uniqueProductSearchTimer.current) {
      clearTimeout(uniqueProductSearchTimer.current);
      uniqueProductSearchTimer.current = null;
    }
  }

  function handleProductSearchChange(value: string) {
    setSearch(value);
    setSearchDropdownOpen(true);
    clearUniqueProductSearchTimer();

    const q = value.trim().toLowerCase();
    if (q.length < 2) return;
    const matches = locationProducts.filter((product) =>
      (stockFilter !== "available" || product.stockQuantity > 0)
      && (
        product.name.toLowerCase().includes(q)
        || product.sku.toLowerCase().includes(q)
        || (product.barcode ?? "").toLowerCase().includes(q)
      )
    );
    if (matches.length !== 1) return;

    const product = matches[0];
    if (lines.some((line) => line.productId === product.id)) return;
    if (!product.allowNegativeStock && product.stockQuantity <= 0) return;
    uniqueProductSearchTimer.current = setTimeout(() => {
      uniqueProductSearchTimer.current = null;
      addProduct(product.id);
      setSearch("");
      setSearchDropdownOpen(false);
    }, 500);
  }

  // A blank row the user fills in via that row's own inline Product cell —
  // independent of the long search bar above the table.
  function addEmptyRow() {
    setLines((prev) => [...prev, { key: crypto.randomUUID(), productId: "", quantity: 1, discountPercent: 0, taxPercent: 0 }]);
  }

  // Placeholder until a "create new product from here" flow exists.
  function handleAddProduct() {
    setError("Add Product isn't wired up yet — tell me what it should do and I'll build it.");
  }

  // Selecting a replacement from a row's inline dropdown swaps productId
  // only — unitPrice/sku/stock all re-derive from productById on the next
  // render (computedLines already looks them up fresh), so nothing else
  // needs to change here.
  function selectReplacement(key: string, product: SellableProduct) {
    updateLine(key, { productId: product.id });
    setEditingLineId(null);
  }

  function removeLine(key: string) {
    setPendingRemoveKey(key);
  }

  function confirmRemoveLine() {
    if (!pendingRemoveKey) return;
    setLines((prev) => prev.filter((l) => l.key !== pendingRemoveKey));
    if (editingLineId === pendingRemoveKey) setEditingLineId(null);
    setPendingRemoveKey(null);
  }

  function selectCustomer(customer: SaleCustomer) {
    setSelectedCustomerId(customer.id);
    setDueDate(addDaysToIsoDate(saleDate, customer.paymentTermsDays));
    setWalkInName("");
    setShowCustomerPicker(false);
    setCustomerQuery("");
    setCustomerBalanceNotice(customer.outstanding > 0
      ? { name: customer.name, balance: customer.outstanding }
      : null);
  }

  async function handleSaveContact(contact: {
    name: string;
    contactType: "individual" | "business";
    contactId: string | null;
    phone: string;
    alternatePhone: string | null;
    landline: string | null;
    email: string | null;
    creditLimit: number | null;
  }): Promise<{ ok: boolean; error?: string }> {
    const result = await addCustomer(orgId, contact);
    if (!result.ok || !result.customer) {
      return { ok: false, error: result.error ?? "Couldn't save contact." };
    }
    const newCustomer: SaleCustomer = { ...result.customer, outstanding: 0, isReturning: false, paymentTermsDays: 0 };
    setCustomerList((prev) => [newCustomer, ...prev]);
    selectCustomer(newCustomer);
    setAddContactOpen(false);
    return { ok: true };
  }

  // Flags a line whose quantity exceeds available stock — shown as a
  // dismissing top banner plus a red Qty input, rather than silently
  // clamping the value the user typed.
  function warnIfOverstock(quantity: number, stockQuantity: number | undefined, name: string) {
    if (stockQuantity === undefined) return;
    if (quantity > stockQuantity) {
      setStockWarning(`Only ${stockQuantity} unit(s) of "${name}" in stock — you entered ${quantity}.`);
      window.clearTimeout((warnIfOverstock as any)._t);
      (warnIfOverstock as any)._t = window.setTimeout(() => setStockWarning(null), 4000);
    }
  }

  function showStockError(message: string) {
    if (!/out of stock|only \d+ unit|insufficient[_ ]stock/i.test(message)) return false;
    const name = message.match(/"([^"]+)"/)?.[1];
    const product = name
      ? products.find((candidate) => candidate.name === name)
      : undefined;
    const availableMatch = message.match(/only\s+(\d+)\s+unit/i);
    const availableStock = availableMatch ? Number(availableMatch[1]) : 0;
    setOutOfStockFeedback({
      item: {
        name: product?.name ?? name ?? "Selected product",
        category: null,
        brand: null,
        stockQuantity: product?.stockQuantity ?? 0,
        availableStock,
      },
      message,
    });
    return true;
  }

  function clearSale() {
    setSelectedCustomerId(null);
    setWalkInName("");
    setCustomerBalanceNotice(null);
    setCustomerQuery("");
    setSaleDate(todayIso());
    setSaleTime(new Date().toTimeString().slice(0, 5));
    setReference("");
    setPaymentTerm(PAYMENT_METHODS[0]);
    setDocStatus("");
    setLines([]);
    setSearch("");
    setEditingLineId(null);
    setConfirmZeroPayment(false);
    setNote("");
    setShippingAmount(0);
    setOtherChargesAmount(0);
    setAdditionalDiscountAmount(0);
    setAdditionalTaxPercent(0);
    setAttachedFileName(null);
    setPaymentMethod(PAYMENT_METHODS[0]);
    setAmountPaid(0);
    setError(null);
    window.localStorage.removeItem(DRAFT_KEY);
  }

  // Persists Draft/Quotation/Proforma to the DB — these show up on the
  // Drafts list (/sales/drafts) instead of the main Sales list, and never
  // touch inventory until later finalized into a real sale.
  function saveDraft() {
    if (docStatus !== "draft" && docStatus !== "quotation" && docStatus !== "proforma") {
      setError("Select Draft, Quotation, or Proforma under Status before saving.");
      return;
    }
    if (lines.filter((l) => l.productId).length === 0 && !selectedCustomer && !walkInName) {
      setError("Add at least a customer or a product before saving.");
      return;
    }
    setError(null);

    startTransition(async () => {
      if (editingSaleId) {
        const result = await updateSale({
          saleId: editingSaleId,
          documentStatus: docStatus,
          subtotal,
          total,
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name ?? walkInName,
          locationId: locationId || null,
          reference,
          saleDate,
          dueDate: dueDate || null,
          paymentMethod,
          amountPaid,
          priceTier,
          shippingAmount,
          discountAmount: discountTotal + additionalDiscountAmount,
          taxAmount: taxTotal + additionalTaxAmount,
          items: lines
            .filter((l) => l.productId)
            .map((l) => {
              const product = productById.get(l.productId);
              const unitPrice = product ? getTierPrice(product, priceTier) : 0;
              const gross = unitPrice * l.quantity;
              const disc = gross * (l.discountPercent / 100);
              const lineTotal = gross - disc + (gross - disc) * (l.taxPercent / 100);
              return { productId: l.productId, quantity: l.quantity, unitPrice, discountPercent: l.discountPercent, taxPercent: l.taxPercent, lineTotal };
            }),
        });
        if (!result.ok) {
          const message = result.error ?? "Review the sale details and try again.";
          if (showStockError(message)) setError(null);
          else {
            setTransactionFeedback({ kind: "error", message });
            setError(message);
          }
          return;
        }
        router.push("/sales/drafts");
        return;
      }

      const result = await recordSale({
        orgId,
        documentStatus: docStatus,
        subtotal,
        total,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name ?? walkInName,
        locationId: locationId || null,
        reference,
        saleDate,
        dueDate: dueDate || null,
        paymentMethod,
        amountPaid,
        shippingAmount,
        discountAmount: discountTotal + additionalDiscountAmount,
        taxAmount: taxTotal + additionalTaxAmount,
        notes: note,
        priceTier,
        items: lines.filter((l) => l.productId).map((l) => {
          const product = productById.get(l.productId);
          const unitPrice = product ? getTierPrice(product, priceTier) : 0;
          const gross = unitPrice * l.quantity;
          const discount = gross * (l.discountPercent / 100);
          const lineTotal = gross - discount + (gross - discount) * (l.taxPercent / 100);
          return {
          productId: l.productId,
          quantity: l.quantity,
          unitPrice,
          discountPercent: l.discountPercent,
          taxPercent: l.taxPercent,
          lineTotal,
          };
        })
      });
      if (result.error) {
        if (showStockError(result.error)) setError(null);
        else {
          setTransactionFeedback({ kind: "error", message: result.error });
          setError(result.error);
        }
        return;
      }
      router.push("/sales/drafts");
    });
  }

  function validate(): string | null {
    const validLines = lines.filter((l) => l.quantity > 0);
    if (validLines.length === 0) return "Add at least one product to the sale.";
    if (!selectedCustomerId && !walkInName.trim()) return "Select a customer or enter a walk-in customer name.";
    return null;
  }

  async function printSaleReceipt(saleId: string, saleNumber: number, paidAmount: number) {
    try {
      const items = await getSaleInvoiceItems(saleId);
      const html = buildInvoiceHtml({
        orgName,
        systemName,
        logoUrl,
        showLogoOnInvoices,
        saleNumber,
        saleDate,
        dueDate: dueDate || null,
        customerName: selectedCustomer?.name || walkInName || "Walk-in Customer",
        customerPhone: selectedCustomer?.phone ?? null,
        soldByName: reps.find((r) => r.id === salesRepId)?.name ?? currentUserEmail,
        locationName: locations.find((l) => l.id === locationId)?.name ?? null,
        locationCode: locations.find((l) => l.id === locationId)?.code ?? null,
        locationPhone: locations.find((l) => l.id === locationId)?.phone ?? null,
        locationEmail: locations.find((l) => l.id === locationId)?.email ?? null,
        organizationPhone,
        organizationEmail,
        organizationWebsite,
        showOrganizationContact,
        invoiceTemplate,
        invoiceSlogan,
        invoiceThankYouMessage,
        invoiceTermsAndConditions,
        paymentMethod,
        paymentStatus: derivePaymentStatus(total, amountPaid),
        subtotal,
        total,
        amountPaid,
        currency,
        items,
        printFormat: invoiceFormat,
      });
      const win = window.open("", "_blank", "width=800,height=900");
      if (!win) return;
      win.document.write(html);
      win.document.close();
      await waitForInvoiceImages(win);
      win.focus();
      win.print();
    } catch {
      // Printing is best-effort — a failed print shouldn't undo an
      // already-saved sale.
    }
  }

  function handleConfirm(amountPaidOverride?: number) {
    const paidAmount = amountPaidOverride ?? amountPaid;

    if (docStatus !== "final") {
      setError("Set Status to Final before completing the sale — use Save as Draft for Draft/Quotation/Proforma.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (paidAmount <= 0 && !confirmZeroPayment) {
      setError("No amount paid entered — this sale will be recorded as unpaid (Pending). Click Complete Sale again to confirm, or enter an amount paid.");
      setConfirmZeroPayment(true);
      return;
    }
    setConfirmZeroPayment(false);
    setError(null);

    if (!navigator.onLine) {
      if (!isOfflineTransactionsEnabled()) {
        setError("Offline transactions are disabled in General Settings. Reconnect before completing this sale.");
        return;
      }
      if (editingSaleId) {
        setError("Existing sales cannot be edited while offline. Reconnect before editing this sale.");
        return;
      }
      try {
        enqueueOfflineOperation("sale", {
          orgId,
          documentStatus: "final",
          subtotal,
          total,
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name ?? walkInName,
          locationId: locationId || null,
          reference,
          saleDate,
          dueDate: dueDate || null,
          paymentMethod,
          amountPaid: paidAmount,
          shippingAmount,
          discountAmount: discountTotal + additionalDiscountAmount,
          taxAmount: taxTotal + additionalTaxAmount,
          notes: note,
          priceTier,
          items: lines.filter((l) => l.productId).map((l) => {
            const product = productById.get(l.productId);
            const unitPrice = product ? getTierPrice(product, priceTier) : 0;
            const gross = unitPrice * l.quantity;
            const discount = gross * (l.discountPercent / 100);
            const lineTotal = gross - discount + (gross - discount) * (l.taxPercent / 100);
            return {
              productId: l.productId,
              quantity: l.quantity,
              unitPrice,
              discountPercent: l.discountPercent,
              taxPercent: l.taxPercent,
              lineTotal,
            };
          }),
        });
      } catch (error) {
        setError(error instanceof Error ? `Could not save this sale offline: ${error.message}` : "Could not save this sale offline.");
        return;
      }
      setError("Connection unavailable. Sale saved on this device and will sync when online.");
      return;
    }

    startTransition(async () => {
      if (editingSaleId) {
        const result = await updateSale({
          saleId: editingSaleId,
          documentStatus: "final",
          subtotal,
          total,
          customerId: selectedCustomerId,
          customerName: selectedCustomer?.name ?? walkInName,
          locationId: locationId || null,
          reference,
          saleDate,
          dueDate: dueDate || null,
          paymentMethod,
          amountPaid: paidAmount,
          priceTier,
          shippingAmount,
          discountAmount: discountTotal + additionalDiscountAmount,
          taxAmount: taxTotal + additionalTaxAmount,
          items: lines
            .filter((l) => l.productId)
            .map((l) => {
              const product = productById.get(l.productId);
              const unitPrice = product ? getTierPrice(product, priceTier) : 0;
              const gross = unitPrice * l.quantity;
              const disc = gross * (l.discountPercent / 100);
              const lineTotal = gross - disc + (gross - disc) * (l.taxPercent / 100);
              return {
                productId: l.productId,
                quantity: l.quantity,
                unitPrice,
                discountPercent: l.discountPercent,
                taxPercent: l.taxPercent,
                lineTotal,
              };
            }),
        });

        if (!result.ok) {
          setError(result.error ?? "Something went wrong.");
          return;
        }

        if (printReceipt && initialSale) await printSaleReceipt(editingSaleId, initialSale.saleNumber, paidAmount);
        setTransactionFeedback({ kind: "success", message: "The sale was updated successfully." });
        window.setTimeout(() => router.push(`/sales/${editingSaleId}`), 900);
        return;
      }

      const result = await recordSale({
        orgId,
        documentStatus: "final",
        subtotal,
        total,
        customerId: selectedCustomerId,
        customerName: selectedCustomer?.name ?? walkInName,
        locationId: locationId || null,
        reference,
        saleDate,
        dueDate: dueDate || null,
        paymentMethod,
        amountPaid: paidAmount,
        shippingAmount,
        discountAmount: discountTotal + additionalDiscountAmount,
        taxAmount: taxTotal + additionalTaxAmount,
        notes: note,
        priceTier,
        items: lines.filter((l) => l.productId).map((l) => {
         const product = productById.get(l.productId);
         const unitPrice = product ? getTierPrice(product, priceTier) : 0;
         const gross = unitPrice * l.quantity;
         const discount = gross * (l.discountPercent / 100);
         const lineTotal = gross - discount + (gross - discount) * (l.taxPercent / 100);
         return { productId: l.productId, quantity: l.quantity, unitPrice, discountPercent: l.discountPercent, taxPercent: l.taxPercent, lineTotal };
        })
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      if (printReceipt && result.saleId && result.saleNumber) {
        await printSaleReceipt(result.saleId, result.saleNumber, paidAmount);
      }
      setTransactionFeedback({ kind: "success", message: "The sale was recorded successfully." });
      window.setTimeout(() => router.push(`/sales/${result.saleId}`), 900);
    });
  }

  // "Pay Balance" — fills (or tops up) Amount Paid, and if this is an
  // existing sale being edited, saves immediately so the payment actually
  // reconciles (rather than just sitting in the field unsaved).
  function handlePayBalance() {
    const amount = Number(payBalanceInput);
    if (Number.isNaN(amount) || amount <= 0) return;
    const newAmountPaid = Math.min(total, amountPaid + amount);
    setAmountPaid(Number(newAmountPaid.toFixed(2)));
    setPayBalanceOpen(false);
    setPayBalanceInput("");
    if (editingSaleId) handleConfirm(newAmountPaid);
  }

  return (
    <div className="sales-page new-sale-page w-full pb-32">
      {customerBalanceNotice && (
        <CustomerBalancePop
          customerName={customerBalanceNotice.name}
          balance={customerBalanceNotice.balance}
          currency={currency}
          onClose={dismissCustomerBalanceNotice}
        />
      )}
      {transactionFeedback && <TransactionFeedback {...transactionFeedback} onClose={() => setTransactionFeedback(null)} />}
      {duplicateProduct && <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/40 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl dark:bg-ink-900"><h2 className="font-semibold text-ink-900 dark:text-white">Product already exists</h2><p className="mt-2 text-sm text-ledger-500">&quot;{duplicateProduct.name}&quot; already exists in {duplicateProduct.keys.length} row{duplicateProduct.keys.length === 1 ? "" : "s"}.</p><div className="mt-5 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => { smartLocator.locate(duplicateProduct.keys[0]); setDuplicateProduct(null); }} className="rounded-lg border border-ledger-200 px-3 py-2 text-xs font-semibold">Go To Existing Row</button><button type="button" onClick={() => { setLines((prev) => [...prev, { key: crypto.randomUUID(), productId: duplicateProduct.id, quantity: 1, discountPercent: 0, taxPercent: 0 }]); setDuplicateProduct(null); }} className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white">Add Another Row</button></div></div></div>}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">
            {editingSaleId ? "Edit sale" : "New sale"}
          </h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">
            {editingSaleId ? "Update this sale's details, then save your changes." : "Create a new sales transaction."}
          </p>
        </div>
        <Button variant="outline" type="button" onClick={clearSale}>
          <RotateCcw className="h-3.5 w-3.5" />
          Clear sale
        </Button>
      </div>

      {/* Step indicator */}
      <div className="mt-5 flex items-center gap-3 overflow-x-auto rounded-card border border-ledger-100 bg-white px-5 py-3 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <StepBadge index={1} label="Customer" active={!!selectedCustomerId || !!walkInName} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={2} label="Products" active={lines.length > 0} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={3} label="Payment" active={amountPaid > 0} />
        <div className="h-px w-6 shrink-0 bg-ledger-100 dark:bg-ledger-700" />
        <StepBadge index={4} label="Review & Confirm" active={false} />
      </div>

      {error && <p className="mt-4 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>}
      {outOfStockFeedback && (
        <OutOfStockFeedback
          {...outOfStockFeedback}
          onClose={() => setOutOfStockFeedback(null)}
          onCheckAgain={() => {
            setOutOfStockFeedback(null);
            router.refresh();
          }}
          onBrowseSimilar={() => {
            setOutOfStockFeedback(null);
            setSearch("");
            setSearchDropdownOpen(true);
            searchRef.current?.focus();
          }}
        />
      )}
      {stockWarning && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-alert/30 bg-alert-soft px-3 py-2 text-sm text-alert">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {stockWarning}
        </div>
      )}
      {hasCostWarning && (
        <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          One or more selected prices are at or below cost. This transaction will be flagged for review.
        </div>
      )}

      <div className="mt-5 space-y-5">
          {/* Customer & Sale Details — merged, matching the reference layout */}
          <div className="sale-details-section rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-ledger-400" />
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Customer &amp; Sale Details</h2>
              </div>
              <button
                type="button"
                onClick={() => setCustomerSectionCollapsed((v) => !v)}
                className="flex items-center gap-1 text-xs font-medium text-ledger-500 hover:text-ink-900 dark:hover:text-white"
              >
                {customerSectionCollapsed ? "Show" : "Hide"}
                {customerSectionCollapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
              </button>
            </div>

            {!customerSectionCollapsed && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Customer <span className="text-alert">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <button
                      type="button"
                      onClick={() => setShowCustomerPicker((s) => !s)}
                      className="flex h-10 w-full items-center justify-between rounded-md border border-ledger-200 bg-white px-3 text-left text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                    >
                      <span className="truncate">
                        {selectedCustomer ? selectedCustomer.name : walkInName ? `${walkInName} (walk-in)` : "Walk-in Customer"}
                      </span>
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
                    </button>
                    {showCustomerPicker && (
                      <div className="absolute left-0 right-0 top-11 z-30 rounded-md border border-ledger-100 bg-white p-2 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                        <div className="relative">
                          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ledger-400" />
                          <input
                            autoFocus
                            value={customerQuery}
                            onChange={(e) => setCustomerQuery(e.target.value)}
                            placeholder="Search customers by name, phone, or email…"
                            className="h-9 w-full rounded-md border border-ledger-200 bg-white pl-8 pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                          />
                        </div>
                        <div className="mt-2 max-h-40 space-y-0.5 overflow-y-auto">
                          {filteredCustomers.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCustomer(c)}
                              className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-ledger-50 dark:hover:bg-white/[0.04]"
                            >
                              <span className="text-ink-900 dark:text-white">{c.name}</span>
                              <span className="text-xs text-ledger-400">{c.phone ?? c.email ?? ""}</span>
                            </button>
                          ))}
                          {filteredCustomers.length === 0 && (
                            <p className="px-2 py-2 text-center text-xs text-ledger-400">No matching customers.</p>
                          )}
                        </div>
                        <div className="mt-2 border-t border-ledger-100 pt-2 dark:border-ledger-700">
                          <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                            Or enter a walk-in customer name
                          </label>
                          <Input
                            value={walkInName}
                            onChange={(e) => {
                              const name = e.target.value;
                              setWalkInName(name);
                              setSelectedCustomerId(null);
                              const matchingCustomer = customerList.find((customer) =>
                                customer.name.trim().toLocaleLowerCase() === name.trim().toLocaleLowerCase()
                              );
                              setCustomerBalanceNotice(matchingCustomer && matchingCustomer.outstanding > 0
                                ? { name: matchingCustomer.name, balance: matchingCustomer.outstanding }
                                : null);
                            }}
                            placeholder="Walk-in customer"
                            className="mt-1"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddContactOpen(true)}
                    title="Add a new contact"
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-white transition-colors"
                    style={{ background: theme.colors.primary }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {selectedCustomer && (
                  <div className="flex flex-wrap gap-3 text-xs text-ledger-500 dark:text-ledger-400">
                    {selectedCustomer.email && (
                      <span className="flex items-center gap-1"><Mail className="h-3 w-3" /> {selectedCustomer.email}</span>
                    )}
                    {selectedCustomer.phone && (
                      <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedCustomer.phone}</span>
                    )}
                    {selectedCustomer.outstanding > 0 && (
                      <span className="font-medium text-alert">Outstanding: {formatMoney(selectedCustomer.outstanding, currency)}</span>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Sale Date <span className="text-alert">*</span>
                </label>
                <Input
                  type="date"
                  value={saleDate}
                  onChange={(e) => {
                    const nextDate = e.target.value;
                    setSaleDate(nextDate);
                    setDueDate(addDaysToIsoDate(nextDate, selectedCustomer?.paymentTermsDays ?? 0));
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Sale Time</label>
                <Input type="time" value={saleTime} onChange={(e) => setSaleTime(e.target.value)} />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Payment Term</label>
                <select
                  value={paymentTerm}
                  onChange={(e) => setPaymentTerm(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Payment due date <span className="font-normal text-ledger-400">(customer default: Net {selectedCustomer?.paymentTermsDays ?? 0})</span>
                </label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Salesperson</label>
                <select
                  value={salesRepId}
                  onChange={(e) => setSalesRepId(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {reps.length === 0 ? (
                    <option value={currentUserId}>{currentUserEmail}</option>
                  ) : (
                    reps.map((r) => (
                      <option key={r.id} value={r.id}>{r.name ?? r.email}</option>
                    ))
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Reference <span className="font-normal text-ledger-400">(optional)</span>
                </label>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Enter reference" />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                  Status <span className="text-alert">*</span>
                </label>
                <select
                  value={docStatus}
                  onChange={(e) => setDocStatus(e.target.value as typeof docStatus)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="">Please Select</option>
                  <option value="draft">Draft</option>
                  <option value="quotation">Quotation</option>
                  <option value="proforma">Proforma</option>
                  <option value="final">Final</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Invoice Scheme</label>
                <select
                  value={invoiceScheme}
                  onChange={(e) => setInvoiceScheme(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option>Default</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Branch</label>
                <select
                  value={locationId}
                  onChange={(e) => setLocationId(e.target.value)}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {locations.length === 0 ? (
                    <option value="">No branches yet</option>
                  ) : (
                    locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>
            )}
          </div>

          {/* Sale Items */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Sale Items ({lines.length} items)</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-ledger-500">Price type:</span>
              {(["retail", "wholesale", "vip", "special"] as const).filter((tier) => allowedPriceGroups.includes(tier)).map((tier) => (
                <button key={tier} type="button" disabled={!canChoosePriceTier} onClick={() => setPriceTier(tier)} className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition-colors", priceTier === tier ? "text-white" : "border border-ledger-200 text-ledger-500 dark:border-ledger-700")} style={priceTier === tier ? { background: theme.colors.primary } : undefined}>{tier === "special" ? "S.P" : tier}</button>
              ))}
              {!canChoosePriceTier && <span className="text-[11px] text-ledger-400">You do not have permission to change pricing.</span>}
              <div className="ml-auto flex items-center gap-1 rounded-md border border-ledger-200 p-1 dark:border-ledger-700" role="group" aria-label="Filter products by stock">
                {(["all", "available"] as const).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    aria-pressed={stockFilter === filter}
                    onClick={() => setStockFilter(filter)}
                    className={cn("rounded px-2.5 py-1.5 text-xs font-semibold transition-colors", stockFilter !== filter && "text-ledger-500 hover:bg-ledger-50 dark:hover:bg-white/[0.06]")}
                    style={stockFilter === filter ? { background: theme.colors.primary, color: "#fff" } : undefined}
                  >
                    {filter === "all" ? "Show All" : "Show Available"}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: theme.colors.primary }}
                />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => handleProductSearchChange(e.target.value)}
                  onFocus={() => {
                    setSearchDropdownOpen(true);
                    const bounds = searchRef.current?.getBoundingClientRect();
                    if (bounds && (bounds.bottom > window.innerHeight - 220 || bounds.top < 16)) {
                      searchRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
                    }
                  }}
                  onBlur={() => {
                    clearUniqueProductSearchTimer();
                    setTimeout(() => setSearchDropdownOpen(false), 150);
                  }}
                  placeholder="Enter Product name / SKU / Scan bar code"
                  className="h-11 w-full rounded-md border pl-9 pr-3 text-sm font-medium outline-none"
                  style={{ background: theme.colors.primaryPale, borderColor: `${theme.colors.primary}4D`, color: theme.colors.primary }}
                />
                {searchDropdownOpen && (
                  <div className="absolute left-0 right-0 top-12 z-40 max-h-72 overflow-y-auto rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                    {filteredProducts.length === 0 && (
                      <p className="px-3 py-3 text-sm text-ledger-400">No matching products.</p>
                    )}
                    {filteredProducts.map((p) => {
                      const alreadyAdded = lines.some((l) => l.productId === p.id);
                      const unavailable = !p.allowNegativeStock && p.stockQuantity <= 0;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={alreadyAdded}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => { clearUniqueProductSearchTimer(); addProduct(p.id); setSearch(""); setSearchDropdownOpen(false); }}
                          className={cn(
                            "flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-ledger-50 disabled:cursor-not-allowed disabled:opacity-45 dark:hover:bg-white/[0.06]",
                            unavailable && "bg-red-50/60 text-ledger-400 dark:bg-red-950/20"
                          )}
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-ledger-100 text-ledger-400 dark:bg-white/[0.06]">
                            <Package2 className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className={cn("block truncate text-sm", unavailable ? "text-ledger-400" : "text-ink-900 dark:text-white")}>{p.name}</span>
                            <span className="block text-xs text-ledger-400">
                              {p.sku} · {unavailable ? "Out Of Stock" : `stock ${p.stockQuantity}`}
                            </span>
                          </span>
                          <span className="shrink-0 font-mono text-sm text-ledger-600 dark:text-ledger-300">
                            {alreadyAdded ? "Added" : unavailable ? "Unavailable" : formatMoney(getTierPrice(p, priceTier), currency)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <CrossBranchStockButton
                query={search}
                enabled={canCheckCrossBranchStock && Boolean(search.trim()) && (filteredProducts.length === 0 || hasOnlyUnavailableMatches)}
              />
              <div className="flex shrink-0 items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={addEmptyRow}>
                  <Plus className="h-3.5 w-3.5" /> Add Row
                </Button>
                <Button
                  type="button"
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

            {products.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ledger-400">Add a product to Inventory to start selling.</p>
            ) : (
              <>
                <div className="mt-4 flex items-center justify-between rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/20 dark:text-blue-100">
                  <span>Auto Merge Duplicate Products</span>
                  <button type="button" onClick={() => setAutoMergeDuplicates((value) => !value)} className={cn("rounded-full px-3 py-1 text-[10px] font-semibold", autoMergeDuplicates ? "bg-blue-600 text-white" : "bg-white text-ledger-500")}>{autoMergeDuplicates ? "ON" : "OFF"}</button>
                </div>
                <SmartProductSummary products={locationProducts} rows={lines} onLocate={smartLocator.locate} className="mt-3" />
                <div className="sale-items-table-scroll mt-4 overflow-x-auto rounded-md border border-ledger-100 dark:border-ledger-700">
                  <table className="w-full text-sm">
                    <thead>
                      <tr
                        className="text-left text-xs font-semibold text-white"
                        style={{ background: theme.colors.primaryMid, borderBottom: `1px solid ${theme.colors.primary}` }}
                      >
                        <th className="py-2 pl-3 pr-2">Product</th>
                        <th className="px-2 py-2">SKU</th>
                        <th className="px-2 py-2 text-right">Unit Price</th>
                        <th className="px-2 py-2 text-center">Qty</th>
                        <th className="px-2 py-2 text-right">Disc. (%)</th>
                        <th className="px-2 py-2 text-right">Tax (%)</th>
                        <th className="px-2 py-2 text-right">Total</th>
                        <th className="w-16 py-2 pr-3" />
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.map(({ line, product, unitPrice, rowTotal }) => {
                        const isEditing = editingLineId === line.key || !product;
                        return (
                          <tr key={line.key} ref={(element) => { smartLocator.rowRefs.current[line.key] = element; }} className={cn("border-b border-ledger-50 last:border-0 dark:border-ledger-700/50", smartLocator.rowClassName(line.key))}>
                            <td className="py-2 pl-3 pr-2">
                              {isEditing ? (
                                <SaleProductRowCell
                                  products={locationProducts}
                                  currentName={product?.name ?? ""}
                                  onSelect={(p) => selectReplacement(line.key, p)}
                                  onClose={() => setEditingLineId(null)}
                                />
                              ) : (
                                <span className="font-medium text-ink-900 dark:text-white">{product!.name}</span>
                              )}
                            </td>
                            <td className="px-2 py-2 font-mono text-xs text-ledger-500">{product?.sku ?? "—"}</td>
                            <td className="px-2 py-2 text-right figure text-ledger-500 dark:text-ledger-400">
                              {formatMoney(unitPrice, currency)}
                            </td>
                            <td className="px-2 py-2">
                              <div className="flex items-center justify-center gap-1">
                                <button
                                  type="button"
                                  onClick={() => updateLine(line.key, { quantity: Math.max(1, line.quantity - 1) })}
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  min={1}
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const next = Math.max(1, Number(e.target.value));
                                    updateLine(line.key, { quantity: next });
                                    if (product) warnIfOverstock(next, product.stockQuantity, product.name);
                                  }}
                                  className={cn(
                                    "h-6 w-10 rounded border bg-white text-center text-xs dark:bg-ink-900 dark:text-white",
                                    product && line.quantity > product.stockQuantity
                                      ? "border-alert text-alert focus-visible:ring-alert/40"
                                      : "border-ledger-200 dark:border-ledger-700"
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateLine(line.key, {
                                      quantity: Math.min(product?.stockQuantity ?? line.quantity, line.quantity + 1)
                                    })
                                  }
                                  className="flex h-6 w-6 items-center justify-center rounded border border-ledger-200 text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:hover:bg-white/[0.06]"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <input
                                  type="number"
                                  min={0}
                                  max={100}
                                  value={line.discountPercent}
                                  onChange={(e) => updateLine(line.key, { discountPercent: Number(e.target.value) })}
                                  className="h-8 w-14 rounded-md border border-ledger-200 bg-white px-1 text-right text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                                />
                                <span className="text-xs text-ledger-400">%</span>
                              </div>
                            </td>
                            <td className="px-2 py-2 text-right">
                              <select
                                value={line.taxPercent}
                                onChange={(e) => updateLine(line.key, { taxPercent: Number(e.target.value) })}
                                className="h-8 rounded-md border border-ledger-200 bg-white px-1 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                              >
                                {TAX_RATES.map((rate) => (
                                  <option key={rate} value={rate}>
                                    {rate}%
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-2 py-2 text-right figure font-medium text-ink-900 dark:text-white">
                              {formatMoney(rowTotal, currency)}
                            </td>
                            <td className="px-2 py-2 pr-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                {product && !isEditing && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingLineId(line.key)}
                                    className="text-ledger-400 hover:text-signal"
                                    aria-label="Edit product"
                                  >
                                    <Pencil className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {editingLineId === line.key && (
                                  <button
                                    type="button"
                                    onClick={() => setEditingLineId(null)}
                                    className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
                                    aria-label="Done editing"
                                  >
                                    <Check className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => removeLine(line.key)}
                                  className="text-ledger-400 hover:text-alert"
                                  aria-label="Remove item"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {lines.length === 0 && (
                    <p className="py-6 text-center text-sm text-ledger-400">
                      No products added yet — search above and click a product to add it.
                    </p>
                  )}
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <Button type="button" variant="outline" size="sm" onClick={addEmptyRow}>
                    <Plus className="h-3.5 w-3.5" /> Add Row
                  </Button>
                  <span className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Total Items: {lines.length}</span>
                </div>

                {/* Footer stat strip */}
                <div className="mt-4 grid grid-cols-2 gap-3 rounded-md bg-ledger-50 p-3 text-center text-xs sm:grid-cols-4 dark:bg-white/[0.04]">
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{lines.length}</p>
                    <p className="text-ledger-400">Items</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{totalQuantity}</p>
                    <p className="text-ledger-400">Total qty</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-ink-900 dark:text-white">{formatMoney(subtotal, currency)}</p>
                    <p className="text-ledger-400">Sub total</p>
                  </div>
                  <div>
                    <p className="figure text-sm font-semibold text-alert">-{formatMoney(discountTotal, currency)}</p>
                    <p className="text-ledger-400">Discount</p>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Additional Information + Additional Charges */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center gap-2">
                <StickyNote className="h-4 w-4 text-ledger-400" />
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Additional Information</h2>
              </div>
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Notes (Optional)</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    placeholder="Enter notes here…"
                    className="w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Attach Document (Optional)</label>
                  <label className="flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-ledger-200 px-4 py-4 text-center text-xs text-ledger-400 hover:border-signal dark:border-ledger-700">
                    <Paperclip className="h-4 w-4" />
                    {attachedFileName ? (
                      <span className="text-ink-900 dark:text-white">{attachedFileName}</span>
                    ) : (
                      <span>Drag &amp; drop files here or <span className="font-medium text-signal">browse</span></span>
                    )}
                    <span>Supports: PDF, JPG, PNG (Max 5MB)</span>
                    <input type="file" className="hidden" onChange={(e) => setAttachedFileName(e.target.files?.[0]?.name ?? null)} />
                  </label>
                  {attachedFileName && (
                    <p className="text-[11px] text-ledger-400">
                      Attached to this form only — file storage isn&rsquo;t wired up yet, so it won&rsquo;t be saved with the sale.
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-ledger-400" />
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Additional Charges</h2>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Shipping</label>
                  <input
                    type="number"
                    min={0}
                    value={shippingAmount}
                    onChange={(e) => setShippingAmount(Math.max(0, Number(e.target.value)))}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Other Charges</label>
                  <input
                    type="number"
                    min={0}
                    value={otherChargesAmount}
                    onChange={(e) => setOtherChargesAmount(Math.max(0, Number(e.target.value)))}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Discount</label>
                  <input
                    type="number"
                    min={0}
                    value={additionalDiscountAmount}
                    onChange={(e) => setAdditionalDiscountAmount(Math.max(0, Number(e.target.value)))}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Tax (%)</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={additionalTaxPercent}
                    onChange={(e) => setAdditionalTaxPercent(Math.max(0, Number(e.target.value)))}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Additional Options */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex items-center gap-2">
              <Check className="h-4 w-4 text-ledger-400" />
              <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Additional Options</h2>
            </div>
            <div className="mt-3 space-y-2 text-sm">
              <InvoiceFormatSelect value={invoiceFormat} onChange={setInvoiceFormat} />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={printReceipt} onChange={(e) => setPrintReceipt(e.target.checked)} className="h-4 w-4 rounded accent-signal" />
                Print sale receipt after saving
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={updateStockOption} onChange={(e) => setUpdateStockOption(e.target.checked)} className="h-4 w-4 rounded accent-signal" />
                Update stock
              </label>
              <label className="flex items-center gap-2 text-ledger-400">
                <input type="checkbox" checked={addToCustomerCredit} onChange={(e) => setAddToCustomerCredit(e.target.checked)} className="h-4 w-4 rounded accent-signal" disabled />
                Add to customer credit <span className="text-[11px]">(not wired up yet)</span>
              </label>
              <label className="flex items-center gap-2 text-ledger-400">
                <input type="checkbox" checked={addToSalesQuotation} onChange={(e) => setAddToSalesQuotation(e.target.checked)} className="h-4 w-4 rounded accent-signal" disabled />
                Add to sales quotation <span className="text-[11px]">(not wired up yet)</span>
              </label>
            </div>
          </div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Sale Summary</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Sub total ({lines.length} items)</dt>
                <dd className="figure text-ink-900 dark:text-white">{formatMoney(subtotal, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Discount</dt>
                <dd className="figure text-alert">-{formatMoney(discountTotal + additionalDiscountAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Tax</dt>
                <dd className="figure text-ink-900 dark:text-white">+{formatMoney(taxTotal + additionalTaxAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Shipping</dt>
                <dd className="figure text-ink-900 dark:text-white">+{formatMoney(shippingAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-ledger-500 dark:text-ledger-400">Other Charges</dt>
                <dd className="figure text-ink-900 dark:text-white">+{formatMoney(otherChargesAmount, currency)}</dd>
              </div>
              <div className="flex items-center justify-between border-t border-ledger-100 pt-2 dark:border-ledger-700">
                <dt className="font-medium text-ledger-600 dark:text-ledger-300">Total ({lines.length} items)</dt>
                <dd className="figure text-lg font-semibold text-signal">{formatMoney(total, currency)}</dd>
              </div>
              {discountTotal > 0 && (
                <div className="flex items-center justify-between rounded-md bg-signal-soft px-2 py-1.5">
                  <dt className="flex items-center gap-1 text-xs font-medium text-signal">
                    <Star className="h-3 w-3" /> You save
                  </dt>
                  <dd className="figure text-xs font-semibold text-signal">{formatMoney(discountTotal, currency)}</dd>
                </div>
              )}
            </dl>

            {balanceDue > 0.004 && (
              <div className="mt-3 space-y-2 border-t border-ledger-100 pt-3 dark:border-ledger-700">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-alert">Balance Due</span>
                  <span className="figure text-sm font-semibold text-alert">{formatMoney(balanceDue, currency)}</span>
                </div>
                {!payBalanceOpen ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => { setPayBalanceInput(balanceDue.toFixed(2)); setPayBalanceOpen(true); }}
                  >
                    Pay Balance
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      max={balanceDue}
                      step="0.01"
                      value={payBalanceInput}
                      onChange={(e) => setPayBalanceInput(e.target.value)}
                      className="h-9 flex-1 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                    />
                    <Button type="button" size="sm" disabled={isPending} onClick={handlePayBalance}>
                      Confirm
                    </Button>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPayBalanceOpen(false)}>
                      Cancel
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 space-y-1.5 border-t border-ledger-100 pt-4 dark:border-ledger-700">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Payment method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Amount paid</label>
              <div className="flex items-center rounded-md border border-ledger-200 dark:border-ledger-700">
                <span className="px-3 text-sm text-ledger-400">GHC</span>
                <input
                  type="number"
                  min={0}
                  value={amountPaid}
                  onChange={(e) => setAmountPaid(Math.max(0, Number(e.target.value)))}
                  className="h-10 w-full rounded-r-md border-l border-ledger-200 bg-white pr-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[25, 50, 75, 100].map((pct) => (
                  <button
                    key={pct}
                    type="button"
                    onClick={() => setAmountPaid(Number((total * (pct / 100)).toFixed(2)))}
                    className={
                      Math.round(amountPaid * 100) === Math.round(total * (pct / 100) * 100)
                        ? "rounded-md bg-signal py-1 text-xs font-semibold text-white"
                        : "rounded-md border border-ledger-200 py-1 text-xs font-medium text-ledger-500 hover:bg-ledger-50 dark:border-ledger-700 dark:text-ledger-400 dark:hover:bg-white/[0.06]"
                    }
                  >
                    {pct}%
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between rounded-md bg-ledger-50 px-3 py-2 text-sm dark:bg-white/[0.04]">
              <span className="text-ledger-500 dark:text-ledger-400">{changeOrDue >= 0 ? "Change" : "Balance due"}</span>
              <span className={changeOrDue >= 0 ? "figure font-semibold text-signal" : "figure font-semibold text-alert"}>
                {formatMoney(Math.abs(changeOrDue), currency)}
              </span>
            </div>
          </div>

          {recentItems.length > 0 && (
            <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Recent items</h3>
                <Link href="/inventory" className="text-xs font-medium text-signal hover:underline">
                  View all
                </Link>
              </div>
              <ul className="mt-3 space-y-2">
                {recentItems.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addProduct(item.id)}
                      disabled={!productById.has(item.id) || lines.some((l) => l.productId === item.id)}
                      className="flex w-full items-center justify-between rounded-md p-2 text-left text-sm hover:bg-ledger-50 disabled:cursor-default disabled:opacity-40 dark:hover:bg-white/[0.04]"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <Package2 className="h-3.5 w-3.5 shrink-0 text-ledger-400" />
                        <span className="truncate text-ink-900 dark:text-white">{item.name}</span>
                      </span>
                      <span className="shrink-0 figure text-xs text-ledger-400">{formatMoney(item.unitPrice, currency)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer action bar */}
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-ledger-100 bg-white/95 backdrop-blur dark:border-ledger-700 dark:bg-ink-900/95">
        <div className="mx-auto flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3">
          <Button type="button" variant="outline" onClick={clearSale}>
            Cancel
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={isPending || (docStatus !== "draft" && docStatus !== "quotation" && docStatus !== "proforma")}
              onClick={saveDraft}
              className={cn( (docStatus === "draft" || docStatus === "quotation" || docStatus === "proforma") && "border-amber bg-amber text-white hover:bg-amber/90")}
            >
              {isPending ? "Saving…" : "Save as Draft"}
            </Button>
            <Button
              type="button"
              disabled={isPending || docStatus !== "final"}
              onClick={() => handleConfirm()}
              className="text-white transition-colors"
              style={{ background: theme.colors.primary }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primaryMid; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = theme.colors.primary; }}
            >
              {isPending ? "Saving…" : editingSaleId ? "Update Sale" : "Complete Sale"}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <AddContactDialog open={addContactOpen} onClose={() => setAddContactOpen(false)} onSave={handleSaveContact} />
      <ConfirmDialog
        open={pendingRemoveKey !== null}
        description="Remove this item from the sale?"
        onCancel={() => setPendingRemoveKey(null)}
        onConfirm={confirmRemoveLine}
      />
    </div>
  );
}