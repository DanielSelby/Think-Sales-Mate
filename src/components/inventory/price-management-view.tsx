"use client";

import * as React from "react";
import { Search, Download, History, Upload, Save, RefreshCw, TrendingUp, Package, Clock3, Layers3 } from "lucide-react";
import { bulkUpdateProductPrices, getPriceHistory, updateProductPrice } from "@/app/(dashboard)/inventory/prices/actions";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PriceProduct = {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: string | null;
  brand: string | null;
  sellingPrice: number;
  costPrice: number;
  wholesalePrice: number | null;
  stockQuantity: number;
  imageUrl: string | null;
  updatedAt: string;
};

type Tab = "update" | "import" | "groups";

type PriceGroup = {
  id: string;
  name: string;
  description: string;
};

export function PriceManagementView({ products, currency, canManage }: { products: PriceProduct[]; currency: string; canManage: boolean }) {
  const [tab, setTab] = React.useState<Tab>("update");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [brand, setBrand] = React.useState("all");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
  const [history, setHistory] = React.useState<any[] | null>(null);
  const [groups, setGroups] = React.useState<PriceGroup[]>([
    { id: "retail", name: "Retail", description: "Standard customer pricing" },
    { id: "wholesale", name: "Wholesale", description: "Bulk customer pricing" },
  ]);
  const bulkFileRef = React.useRef<HTMLInputElement>(null);
  const categories = [...new Set(products.map((p) => p.category).filter(Boolean))] as string[];
  const brands = [...new Set(products.map((p) => p.brand).filter(Boolean))] as string[];
  const filtered = products.filter((product) => {
    const needle = query.toLowerCase();
    return (!needle || [product.name, product.sku, product.barcode, product.category].some((value) => value?.toLowerCase().includes(needle)))
      && (category === "all" || product.category === category)
      && (brand === "all" || product.brand === brand);
  });
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);

  async function save(product: PriceProduct) {
    const value = Number(drafts[product.id]);
    const result = await updateProductPrice(product.id, value);
    setNotice(result.ok ? `${product.name} price updated.` : result.error ?? "Price update failed.");
    if (result.ok) setDrafts((current) => { const next = { ...current }; delete next[product.id]; return next; });
  }

  async function updateAll() {
    const pending = Object.fromEntries(
      Object.entries(drafts)
        .map(([id, value]): [string, number] => [id, Number(value)])
        .filter(([, value]) => Number.isFinite(value) && value >= 0)
    );
    if (Object.keys(pending).length === 0) {
      setNotice("There are no pending price changes.");
      return;
    }
    const result = await bulkUpdateProductPrices(pending);
    setNotice(result.ok ? `${result.updatedCount} prices updated successfully.` : result.error ?? "Price update failed.");
    if (result.ok) setDrafts({});
  }

  function downloadTemplate() {
    const csv = "Product Name,SKU,Barcode,Current Price,New Price,Retail Price,Wholesale Price\n" + products.map((p) => `${p.name},${p.sku},${p.barcode ?? ""},${p.sellingPrice},,${p.sellingPrice},${p.wholesalePrice ?? ""}`).join("\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    link.download = "price-import-template.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function showHistory() {
    const result = await getPriceHistory();
    if (!result.ok) {
      setNotice(result.error ?? "Could not load price history.");
      return;
    }
    setHistory(result.entries);
  }

  function importBulkPrices(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const rows = String(reader.result ?? "").split(/\r?\n/).filter(Boolean);
      if (rows.length < 2) {
        setNotice("The price file must include a header and at least one row.");
        return;
      }
      const headers = rows[0].split(",").map((header) => header.trim().toLowerCase());
      const skuIndex = headers.indexOf("sku");
      const priceIndex = headers.findIndex((header) => ["new price", "new_price", "price"].includes(header));
      if (skuIndex < 0 || priceIndex < 0) {
        setNotice("CSV must include SKU and New Price columns.");
        return;
      }
      const bySku = new Map(products.map((product) => [product.sku.toLowerCase(), product]));
      const nextDrafts: Record<string, string> = {};
      let matched = 0;
      for (const row of rows.slice(1)) {
        const cells = row.split(",");
        const product = bySku.get((cells[skuIndex] ?? "").trim().toLowerCase());
        const value = Number((cells[priceIndex] ?? "").trim());
        if (product && Number.isFinite(value) && value >= 0) {
          nextDrafts[product.id] = String(value);
          matched++;
        }
      }
      setDrafts(nextDrafts);
      setNotice(matched ? `${matched} price changes loaded. Review them, then click Update.` : "No matching valid SKU prices were found.");
    };
    reader.readAsText(file);
  }

  return <div className="mx-auto max-w-[1600px] space-y-5 pb-12">
    <div>
      <p className="text-xs text-ledger-400">Inventory &gt; Price Management</p>
      <h1 className="mt-1 font-display text-2xl font-bold text-ink-900 dark:text-white">Product Price Management</h1>
      <p className="mt-1 text-sm text-ledger-500">Manage product pricing manually, import prices in bulk, and maintain price groupings for different customer types and sales channels.</p>
    </div>
    <div className="flex flex-wrap gap-2 border-b border-ledger-200 dark:border-ledger-700">
      {([["update", "Update Price"], ["import", "Import Price"], ["groups", "Price Groupings"]] as const).map(([key, label]) => <button key={key} onClick={() => setTab(key)} className={cn("border-b-2 px-4 py-3 text-sm font-semibold", tab === key ? "border-signal text-signal" : "border-transparent text-ledger-500")}>{label}</button>)}
    </div>
    {notice && <div className="rounded-xl border border-signal/30 bg-signal-soft px-4 py-3 text-sm text-ink-900">{notice}</div>}
    {tab === "update" && <UpdateTabV2 products={filtered} allProducts={products} currency={currency} query={query} setQuery={setQuery} category={category} setCategory={setCategory} brand={brand} setBrand={setBrand} categories={categories} brands={brands} drafts={drafts} setDrafts={setDrafts} save={save} updateAll={updateAll} showHistory={showHistory} bulkFileRef={bulkFileRef} canManage={canManage} money={money} />}
    {history && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setHistory(null)}><Card className="max-h-[80vh] w-full max-w-2xl overflow-hidden" onClick={(event: React.MouseEvent) => event.stopPropagation()}><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Price History</h2><Button variant="outline" onClick={() => setHistory(null)}>Close</Button></div><div className="max-h-[60vh] overflow-y-auto">{history.length === 0 ? <p className="text-sm text-ledger-500">No price changes recorded yet.</p> : history.map((entry) => <div key={entry.id} className="flex justify-between border-b border-ledger-100 py-3 text-sm"><span>Product {entry.entity_id}<br /><span className="text-xs text-ledger-500">{new Date(entry.created_at).toLocaleString()}</span></span><strong>{entry.metadata?.new_price ?? "—"}</strong></div>)}</div></CardContent></Card></div>}
    {tab === "import" && <Card><CardContent className="space-y-5 p-6"><h2 className="text-base font-bold">Import Price</h2><p className="text-sm text-ledger-500">Download the template, update prices in Excel or CSV, then upload it for validation before applying changes.</p><Button variant="secondary" onClick={downloadTemplate}><Download className="h-4 w-4" /> Download CSV Template</Button><label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ledger-200 bg-ledger-50/50 text-center dark:border-ledger-700 dark:bg-white/[0.03]"><Upload className="h-7 w-7 text-signal" /><span className="mt-2 text-sm font-semibold">Drop CSV or Excel file here</span><span className="text-xs text-ledger-500">Validation preview will appear before import</span><input type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => setNotice(event.target.files?.[0] ? `${event.target.files[0].name} selected. Review and import after validation.` : null)} /></label></CardContent></Card>}
    {tab === "groups" && <GroupsTab products={products} currency={currency} canManage={canManage} groups={groups} setGroups={setGroups} setNotice={setNotice} />}
  </div>;
}

function UpdateTabV2({ products, allProducts, currency, query, setQuery, category, setCategory, brand, setBrand, categories, brands, drafts, setDrafts, save, updateAll, showHistory, bulkFileRef, canManage, money }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const cards = [
    ["Total Products", allProducts.length, Package, "bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400", "All active products"],
    ["Updated Today", allProducts.filter((p: PriceProduct) => p.updatedAt.slice(0, 10) === today).length, TrendingUp, "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400", "Price changes today"],
    ["Pending Updates", Object.keys(drafts).length, Clock3, "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400", "Changes awaiting update"],
    ["Price Groups", 2, Layers3, "bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400", "Configured price groups"],
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(([label, value, Icon, iconStyle, description]: any) => <div key={label} className="rounded-2xl border border-ledger-100 bg-white p-4 shadow-card dark:border-ledger-700 dark:bg-ink-900">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconStyle}`}><Icon className="h-5 w-5" /></div>
          <div>
            <p className="text-[11px] font-medium text-ledger-400">{label}</p>
            <p className="font-display text-xl font-bold text-ink-900 dark:text-white">{value}</p>
          </div>
        </div>
        <p className="mt-2 text-[10px] text-ledger-400">{description}</p>
      </div>)}
    </div>
    <div className="space-y-5">
      <div className="space-y-4">
        <Card><CardContent className="flex flex-wrap items-center gap-3 p-4"><h3 className="mr-2 text-sm font-bold">Quick Actions</h3><Button variant="secondary" onClick={showHistory}><History className="h-4 w-4" /> View Price History</Button><Button variant="secondary" disabled={!canManage} onClick={() => bulkFileRef.current?.click()}><Upload className="h-4 w-4" /> Bulk Update Prices</Button><input ref={bulkFileRef} type="file" accept=".csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) { const reader = new FileReader(); reader.onload = () => { const rows = String(reader.result ?? "").split(/\r?\n/).filter(Boolean); if (rows.length < 2) return; const headers = rows[0].split(",").map((header) => header.trim().toLowerCase()); const skuIndex = headers.indexOf("sku"); const priceIndex = headers.findIndex((header) => ["new price", "new_price", "price"].includes(header)); if (skuIndex < 0 || priceIndex < 0) return; const bySku = new Map(allProducts.map((product: PriceProduct) => [product.sku.toLowerCase(), product])); const next: Record<string, string> = {}; rows.slice(1).forEach((row) => { const cells = row.split(",");         const product = bySku.get((cells[skuIndex] ?? "").trim().toLowerCase()) as PriceProduct | undefined; const value = Number((cells[priceIndex] ?? "").trim()); if (product && Number.isFinite(value) && value >= 0) next[product.id] = String(value); }); setDrafts(next); }; reader.readAsText(file); } event.target.value = ""; }} /></CardContent></Card>
        <Card><CardContent className="flex flex-wrap gap-2 p-4">
          <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name, SKU, barcode or category" className="h-9 w-full rounded-lg border border-ledger-200 bg-white pl-9 pr-3 text-xs dark:border-ledger-700 dark:bg-ink-900" /></div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Categories</option>{categories.map((value: string) => <option key={value}>{value}</option>)}</select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Brands</option>{brands.map((value: string) => <option key={value}>{value}</option>)}</select>
          <Button variant="secondary" onClick={() => { setQuery(""); setCategory("all"); setBrand("all"); }}><RefreshCw className="h-3.5 w-3.5" /> Reset</Button>
          <Button variant="primary" className="bg-emerald-600 hover:bg-emerald-700" disabled={!canManage || Object.keys(drafts).length === 0} onClick={updateAll}><Save className="h-3.5 w-3.5" /> Update</Button>
        </CardContent></Card>
        <Card><CardContent className="overflow-x-auto p-0"><table className="w-full table-fixed text-left text-[11px]"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="w-[22%] p-2">Product</th><th className="w-[10%] p-2">SKU</th><th className="w-[10%] p-2">Category</th><th className="w-[9%] p-2">Cost</th><th className="w-[10%] p-2">Current</th><th className="w-[11%] p-2">New Price</th><th className="w-[8%] p-2">Change</th><th className="w-[9%] p-2">Profit Margin</th><th className="w-[7%] p-2">Updated</th><th className="w-[8%] p-2">Action</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
          {products.map((product: PriceProduct) => { const next = drafts[product.id]; const nextValue = next === undefined ? product.sellingPrice : Number(next); const change = product.sellingPrice ? ((nextValue - product.sellingPrice) / product.sellingPrice) * 100 : 0; const profitMargin = product.sellingPrice - product.costPrice; return <tr key={product.id}><td className="p-2"><div className="flex min-w-0 items-center gap-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-7 w-7 shrink-0 rounded object-cover" /> : <div className="h-7 w-7 shrink-0 rounded bg-ledger-100" />}<span className="truncate font-semibold text-ink-900 dark:text-white">{product.name}</span></div></td><td className="truncate p-2 font-mono text-ledger-500">{product.sku}</td><td className="truncate p-2">{product.category ?? "—"}</td><td className="truncate p-2">{money(product.costPrice)}</td><td className="truncate p-2">{money(product.sellingPrice)}</td><td className="p-2"><input disabled={!canManage} value={next === undefined ? product.sellingPrice : next} onChange={(e) => setDrafts((current: Record<string, string>) => ({ ...current, [product.id]: e.target.value }))} className="h-8 w-full rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-900" /></td><td className={cn("p-2 font-semibold", change > 0 ? "text-signal" : change < 0 ? "text-alert" : "text-ledger-400")}>{change.toFixed(1)}%</td><td className="p-2 font-semibold text-emerald-500">{money(profitMargin)}</td><td className="truncate p-2 text-ledger-500">{product.updatedAt.slice(0, 10) === today ? "Today" : product.updatedAt.slice(0, 10)}</td><td className="p-2"><Button size="sm" variant="primary" className="bg-emerald-600 px-2 hover:bg-emerald-700" disabled={!canManage || next === undefined} onClick={() => save(product)}><Save className="h-3.5 w-3.5" /> Save</Button></td></tr>; })}
        </tbody></table>{products.length === 0 && <p className="p-8 text-center text-sm text-ledger-500">No products match your filters.</p>}</CardContent></Card>
      </div>
    </div>
  </div>;
}

function UpdateTab({ products, allProducts, currency, query, setQuery, category, setCategory, brand, setBrand, categories, brands, drafts, setDrafts, save, canManage, money }: any) {
  const today = new Date().toISOString().slice(0, 10);
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-4"><Card><CardContent className="flex flex-wrap gap-2 p-4"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name, SKU, barcode or category" className="h-9 w-full rounded-lg border border-ledger-200 bg-white pl-9 pr-3 text-xs dark:border-ledger-700 dark:bg-ink-900" /></div><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Categories</option>{categories.map((value: string) => <option key={value}>{value}</option>)}</select><select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Brands</option>{brands.map((value: string) => <option key={value}>{value}</option>)}</select><Button variant="secondary" onClick={() => { setQuery(""); setCategory("all"); setBrand("all"); }}><RefreshCw className="h-3.5 w-3.5" /> Reset</Button><Button variant="primary"><Download className="h-3.5 w-3.5" /> Export Prices</Button></CardContent></Card><Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Category</th><th className="p-3">Cost Price</th><th className="p-3">Current Price</th><th className="p-3">New Price</th><th className="p-3">Change</th><th className="p-3">Updated</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">{products.map((product: PriceProduct) => { const next = drafts[product.id]; const nextValue = next === undefined ? product.sellingPrice : Number(next); const change = product.sellingPrice ? ((nextValue - product.sellingPrice) / product.sellingPrice) * 100 : 0; return <tr key={product.id}><td className="p-3"><div className="flex items-center gap-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-ledger-100" />}<span className="font-semibold text-ink-900 dark:text-white">{product.name}</span></div></td><td className="p-3 font-mono text-ledger-500">{product.sku}</td><td className="p-3">{product.category ?? "—"}</td><td className="p-3">{money(product.costPrice)}</td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3"><input disabled={!canManage} value={next === undefined ? product.sellingPrice : next} onChange={(e) => setDrafts((current: Record<string, string>) => ({ ...current, [product.id]: e.target.value }))} className="h-8 w-28 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-900" /></td><td className={cn("p-3 font-semibold", change > 0 ? "text-signal" : change < 0 ? "text-alert" : "text-ledger-400")}>{change.toFixed(1)}%</td><td className="p-3 text-ledger-500">{product.updatedAt.slice(0, 10) === today ? "Today" : product.updatedAt.slice(0, 10)}</td><td className="p-3"><Button size="sm" variant="primary" disabled={!canManage || next === undefined} onClick={() => save(product)}><Save className="h-3.5 w-3.5" /> Save</Button></td></tr>; })}</tbody></table>{products.length === 0 && <p className="p-8 text-center text-sm text-ledger-500">No products match your filters.</p>}</CardContent></Card></div><aside className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-1">{[["Total Products", allProducts.length, Package], ["Updated Today", allProducts.filter((p: PriceProduct) => p.updatedAt.slice(0, 10) === today).length, TrendingUp], ["Pending Updates", Object.keys(drafts).length, Clock3], ["Price Groups", 2, Layers3]].map(([label, value, Icon]: any) => <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-ledger-500"><span>{label}</span><Icon className="h-4 w-4 text-signal" /></div><p className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">{value}</p></CardContent></Card>)}</div><Card><CardContent className="space-y-3 p-4"><h3 className="text-sm font-bold">Quick Actions</h3><Button className="w-full" variant="secondary"><History className="h-4 w-4" /> View Price History</Button><Button className="w-full" variant="secondary"><Upload className="h-4 w-4" /> Bulk Update Prices</Button></CardContent></Card></aside></div>;
}

function GroupsTab({ products, currency, canManage, groups, setGroups, setNotice }: {
  products: PriceProduct[];
  currency: string;
  canManage: boolean;
  groups: PriceGroup[];
  setGroups: React.Dispatch<React.SetStateAction<PriceGroup[]>>;
  setNotice: (notice: string | null) => void;
}) {
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const money = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  function closeCreate() {
    setIsCreateOpen(false);
    setName("");
    setDescription("");
  }

  function createGroup(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) return;
    if (groups.some((group) => group.name.toLowerCase() === trimmedName.toLowerCase())) {
      setNotice(`A price group named "${trimmedName}" already exists.`);
      return;
    }
    setGroups((current) => [...current, {
      id: `${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
      name: trimmedName,
      description: description.trim() || "Custom customer pricing",
    }]);
    setNotice(`Price group "${trimmedName}" created.`);
    closeCreate();
  }

  return <Card><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Price Groupings</h2><p className="mt-1 text-sm text-ledger-500">Manage retail and wholesale prices connected to the existing product catalog.</p></div><Button variant="primary" disabled={!canManage} onClick={() => setIsCreateOpen(true)}>Create Group</Button></div><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{groups.map((group) => <div key={group.id} className="rounded-xl border border-ledger-200 p-4 dark:border-ledger-700"><p className="font-semibold">{group.name}</p><p className="mt-1 text-xs text-ledger-500">{group.description}</p></div>)}</div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Cost</th><th className="p-3">Retail</th><th className="p-3">Wholesale</th><th className="p-3">Last Updated</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">{products.map((product) => <tr key={product.id}><td className="p-3 font-semibold">{product.name}</td><td className="p-3 font-mono text-ledger-500">{product.sku}</td><td className="p-3">{money(product.costPrice)}</td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3">{money(product.wholesalePrice)}</td><td className="p-3 text-ledger-500">{product.updatedAt.slice(0, 10)}</td></tr>)}</tbody></table></div></CardContent>{isCreateOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={closeCreate}><Card className="w-full max-w-md" onClick={(event: React.MouseEvent) => event.stopPropagation()}><CardContent className="space-y-4 p-5"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Create Price Group</h2><Button variant="ghost" size="sm" type="button" onClick={closeCreate}>Close</Button></div><form className="space-y-4" onSubmit={createGroup}><label className="block text-sm font-semibold">Group name<input required autoFocus value={name} onChange={(event) => setName(event.target.value)} className="mt-1 h-9 w-full rounded-lg border border-ledger-200 px-3 text-sm dark:border-ledger-700 dark:bg-ink-900" placeholder="e.g. VIP Customers" /></label><label className="block text-sm font-semibold">Description<span className="mt-1 block text-xs font-normal text-ledger-500">Optional</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-ledger-200 px-3 py-2 text-sm dark:border-ledger-700 dark:bg-ink-900" placeholder="Describe when this group should be used" /></label><div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={closeCreate}>Cancel</Button><Button variant="primary" type="submit">Create Group</Button></div></form></CardContent></Card></div>}</Card>;
}
