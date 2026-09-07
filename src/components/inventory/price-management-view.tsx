"use client";

import * as React from "react";
import { Search, Download, History, Upload, Save, RefreshCw, TrendingUp, Package, Clock3, Layers3 } from "lucide-react";
import { bulkUpdateProductPrices, updateProductPrice } from "@/app/(dashboard)/inventory/prices/actions";
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

export function PriceManagementView({ products, currency, canManage }: { products: PriceProduct[]; currency: string; canManage: boolean }) {
  const [tab, setTab] = React.useState<Tab>("update");
  const [query, setQuery] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [brand, setBrand] = React.useState("all");
  const [drafts, setDrafts] = React.useState<Record<string, string>>({});
  const [notice, setNotice] = React.useState<string | null>(null);
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
    {tab === "update" && <UpdateTabV2 products={filtered} allProducts={products} currency={currency} query={query} setQuery={setQuery} category={category} setCategory={setCategory} brand={brand} setBrand={setBrand} categories={categories} brands={brands} drafts={drafts} setDrafts={setDrafts} save={save} updateAll={updateAll} canManage={canManage} money={money} />}
    {tab === "import" && <Card><CardContent className="space-y-5 p-6"><h2 className="text-base font-bold">Import Price</h2><p className="text-sm text-ledger-500">Download the template, update prices in Excel or CSV, then upload it for validation before applying changes.</p><Button variant="secondary" onClick={downloadTemplate}><Download className="h-4 w-4" /> Download CSV Template</Button><label className="flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-ledger-200 bg-ledger-50/50 text-center dark:border-ledger-700 dark:bg-white/[0.03]"><Upload className="h-7 w-7 text-signal" /><span className="mt-2 text-sm font-semibold">Drop CSV or Excel file here</span><span className="text-xs text-ledger-500">Validation preview will appear before import</span><input type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => setNotice(event.target.files?.[0] ? `${event.target.files[0].name} selected. Review and import after validation.` : null)} /></label></CardContent></Card>}
    {tab === "groups" && <GroupsTab products={products} currency={currency} />}
  </div>;
}

function UpdateTabV2({ products, allProducts, currency, query, setQuery, category, setCategory, brand, setBrand, categories, brands, drafts, setDrafts, save, updateAll, canManage, money }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const cards = [
    ["Total Products", allProducts.length, Package, "from-blue-500 to-cyan-500"],
    ["Updated Today", allProducts.filter((p: PriceProduct) => p.updatedAt.slice(0, 10) === today).length, TrendingUp, "from-emerald-500 to-teal-500"],
    ["Pending Updates", Object.keys(drafts).length, Clock3, "from-amber-500 to-orange-500"],
    ["Price Groups", 2, Layers3, "from-violet-500 to-fuchsia-500"],
  ];
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map(([label, value, Icon, gradient]: any) => <div key={label} className={`rounded-2xl bg-gradient-to-br ${gradient} p-4 text-white shadow-lg`}>
        <div className="flex items-center justify-between text-xs font-semibold text-white/80"><span>{label}</span><Icon className="h-5 w-5" /></div>
        <p className="mt-3 text-2xl font-bold">{value}</p>
      </div>)}
    </div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <Card><CardContent className="flex flex-wrap gap-2 p-4">
          <div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name, SKU, barcode or category" className="h-9 w-full rounded-lg border border-ledger-200 bg-white pl-9 pr-3 text-xs dark:border-ledger-700 dark:bg-ink-900" /></div>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Categories</option>{categories.map((value: string) => <option key={value}>{value}</option>)}</select>
          <select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Brands</option>{brands.map((value: string) => <option key={value}>{value}</option>)}</select>
          <Button variant="secondary" onClick={() => { setQuery(""); setCategory("all"); setBrand("all"); }}><RefreshCw className="h-3.5 w-3.5" /> Reset</Button>
          <Button variant="primary" disabled={!canManage || Object.keys(drafts).length === 0} onClick={updateAll}><Save className="h-3.5 w-3.5" /> Update</Button>
        </CardContent></Card>
        <Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Category</th><th className="p-3">Cost Price</th><th className="p-3">Current Price</th><th className="p-3">New Price</th><th className="p-3">Change</th><th className="p-3">Updated</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
          {products.map((product: PriceProduct) => { const next = drafts[product.id]; const nextValue = next === undefined ? product.sellingPrice : Number(next); const change = product.sellingPrice ? ((nextValue - product.sellingPrice) / product.sellingPrice) * 100 : 0; return <tr key={product.id}><td className="p-3"><div className="flex items-center gap-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-ledger-100" />}<span className="font-semibold text-ink-900 dark:text-white">{product.name}</span></div></td><td className="p-3 font-mono text-ledger-500">{product.sku}</td><td className="p-3">{product.category ?? "—"}</td><td className="p-3">{money(product.costPrice)}</td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3"><input disabled={!canManage} value={next === undefined ? product.sellingPrice : next} onChange={(e) => setDrafts((current: Record<string, string>) => ({ ...current, [product.id]: e.target.value }))} className="h-8 w-28 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-900" /></td><td className={cn("p-3 font-semibold", change > 0 ? "text-signal" : change < 0 ? "text-alert" : "text-ledger-400")}>{change.toFixed(1)}%</td><td className="p-3 text-ledger-500">{product.updatedAt.slice(0, 10) === today ? "Today" : product.updatedAt.slice(0, 10)}</td><td className="p-3"><Button size="sm" variant="primary" disabled={!canManage || next === undefined} onClick={() => save(product)}><Save className="h-3.5 w-3.5" /> Save</Button></td></tr>; })}
        </tbody></table>{products.length === 0 && <p className="p-8 text-center text-sm text-ledger-500">No products match your filters.</p>}</CardContent></Card>
      </div>
      <aside><Card><CardContent className="space-y-3 p-4"><h3 className="text-sm font-bold">Quick Actions</h3><Button className="w-full" variant="secondary"><History className="h-4 w-4" /> View Price History</Button><Button className="w-full" variant="secondary"><Upload className="h-4 w-4" /> Bulk Update Prices</Button></CardContent></Card></aside>
    </div>
  </div>;
}

function UpdateTab({ products, allProducts, currency, query, setQuery, category, setCategory, brand, setBrand, categories, brands, drafts, setDrafts, save, canManage, money }: any) {
  const today = new Date().toISOString().slice(0, 10);
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_280px]"><div className="space-y-4"><Card><CardContent className="flex flex-wrap gap-2 p-4"><div className="relative min-w-[240px] flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-ledger-400" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product name, SKU, barcode or category" className="h-9 w-full rounded-lg border border-ledger-200 bg-white pl-9 pr-3 text-xs dark:border-ledger-700 dark:bg-ink-900" /></div><select value={category} onChange={(e) => setCategory(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Categories</option>{categories.map((value: string) => <option key={value}>{value}</option>)}</select><select value={brand} onChange={(e) => setBrand(e.target.value)} className="h-9 rounded-lg border border-ledger-200 px-3 text-xs dark:border-ledger-700 dark:bg-ink-900"><option value="all">All Brands</option>{brands.map((value: string) => <option key={value}>{value}</option>)}</select><Button variant="secondary" onClick={() => { setQuery(""); setCategory("all"); setBrand("all"); }}><RefreshCw className="h-3.5 w-3.5" /> Reset</Button><Button variant="primary"><Download className="h-3.5 w-3.5" /> Export Prices</Button></CardContent></Card><Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[950px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Category</th><th className="p-3">Cost Price</th><th className="p-3">Current Price</th><th className="p-3">New Price</th><th className="p-3">Change</th><th className="p-3">Updated</th><th className="p-3">Action</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">{products.map((product: PriceProduct) => { const next = drafts[product.id]; const nextValue = next === undefined ? product.sellingPrice : Number(next); const change = product.sellingPrice ? ((nextValue - product.sellingPrice) / product.sellingPrice) * 100 : 0; return <tr key={product.id}><td className="p-3"><div className="flex items-center gap-2">{product.imageUrl ? <img src={product.imageUrl} alt="" className="h-8 w-8 rounded object-cover" /> : <div className="h-8 w-8 rounded bg-ledger-100" />}<span className="font-semibold text-ink-900 dark:text-white">{product.name}</span></div></td><td className="p-3 font-mono text-ledger-500">{product.sku}</td><td className="p-3">{product.category ?? "—"}</td><td className="p-3">{money(product.costPrice)}</td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3"><input disabled={!canManage} value={next === undefined ? product.sellingPrice : next} onChange={(e) => setDrafts((current: Record<string, string>) => ({ ...current, [product.id]: e.target.value }))} className="h-8 w-28 rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-900" /></td><td className={cn("p-3 font-semibold", change > 0 ? "text-signal" : change < 0 ? "text-alert" : "text-ledger-400")}>{change.toFixed(1)}%</td><td className="p-3 text-ledger-500">{product.updatedAt.slice(0, 10) === today ? "Today" : product.updatedAt.slice(0, 10)}</td><td className="p-3"><Button size="sm" variant="primary" disabled={!canManage || next === undefined} onClick={() => save(product)}><Save className="h-3.5 w-3.5" /> Save</Button></td></tr>; })}</tbody></table>{products.length === 0 && <p className="p-8 text-center text-sm text-ledger-500">No products match your filters.</p>}</CardContent></Card></div><aside className="space-y-4"><div className="grid grid-cols-2 gap-3 xl:grid-cols-1">{[["Total Products", allProducts.length, Package], ["Updated Today", allProducts.filter((p: PriceProduct) => p.updatedAt.slice(0, 10) === today).length, TrendingUp], ["Pending Updates", Object.keys(drafts).length, Clock3], ["Price Groups", 2, Layers3]].map(([label, value, Icon]: any) => <Card key={label}><CardContent className="p-4"><div className="flex items-center justify-between text-xs text-ledger-500"><span>{label}</span><Icon className="h-4 w-4 text-signal" /></div><p className="mt-2 text-2xl font-bold text-ink-900 dark:text-white">{value}</p></CardContent></Card>)}</div><Card><CardContent className="space-y-3 p-4"><h3 className="text-sm font-bold">Quick Actions</h3><Button className="w-full" variant="secondary"><History className="h-4 w-4" /> View Price History</Button><Button className="w-full" variant="secondary"><Upload className="h-4 w-4" /> Bulk Update Prices</Button></CardContent></Card></aside></div>;
}

function GroupsTab({ products, currency }: { products: PriceProduct[]; currency: string }) {
  const money = (value: number | null) => value == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  return <Card><CardContent className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Price Groupings</h2><p className="mt-1 text-sm text-ledger-500">Manage retail and wholesale prices connected to the existing product catalog.</p></div><Button variant="primary">Create Group</Button></div><div className="mt-5 overflow-x-auto"><table className="w-full min-w-[700px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase tracking-wider text-ledger-500 dark:bg-white/[0.03]"><tr><th className="p-3">Product</th><th className="p-3">SKU</th><th className="p-3">Cost</th><th className="p-3">Retail</th><th className="p-3">Wholesale</th><th className="p-3">Last Updated</th></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">{products.map((product) => <tr key={product.id}><td className="p-3 font-semibold">{product.name}</td><td className="p-3 font-mono text-ledger-500">{product.sku}</td><td className="p-3">{money(product.costPrice)}</td><td className="p-3">{money(product.sellingPrice)}</td><td className="p-3">{money(product.wholesalePrice)}</td><td className="p-3 text-ledger-500">{product.updatedAt.slice(0, 10)}</td></tr>)}</tbody></table></div></CardContent></Card>;
}
