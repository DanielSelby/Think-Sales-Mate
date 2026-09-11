"use client";

import { useMemo, useState } from "react";
import { BarChart3, Calendar, Download, Lightbulb, Search, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/sales/format";

export type ForecastSale = { id: string; sale_number: number; total: number; created_at: string; location_id: string | null; customer_name: string | null };
export type ForecastLocation = { id: string; name: string };
export type ForecastProductSale = { sale_id: string; product_id: string; quantity: number; line_total: number; product_name: string; sku: string };
type Filters = { from: string; to: string; location: string; horizon: number };

function daysBetween(from: string, to: string) {
  return Math.max(1, Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1);
}

function percent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

export function SalesForecastingView({ currency, sales, locations, productSales, filters }: { currency: string; sales: ForecastSale[]; locations: ForecastLocation[]; productSales: ForecastProductSale[]; filters: Filters }) {
  const [from, setFrom] = useState(filters.from);
  const [to, setTo] = useState(filters.to);
  const [location, setLocation] = useState(filters.location);
  const [horizon, setHorizon] = useState(filters.horizon);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("Forecast Overview");

  const visibleSales = useMemo(() => sales.filter((sale) => !location || location === "all" || sale.location_id === location), [location, sales]);
  const selectedSales = useMemo(() => visibleSales.filter((sale) => sale.created_at.slice(0, 10) >= from && sale.created_at.slice(0, 10) <= to), [from, to, visibleSales]);
  const selectedSaleIds = useMemo(() => new Set(selectedSales.map((sale) => sale.id)), [selectedSales]);
  const productRows = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; sku: string; quantity: number; revenue: number }>();
    productSales.forEach((item) => {
      if (!selectedSaleIds.has(item.sale_id)) return;
      const row = rows.get(item.product_id) ?? { id: item.product_id, name: item.product_name, sku: item.sku, quantity: 0, revenue: 0 };
      row.quantity += item.quantity;
      row.revenue += item.line_total;
      rows.set(item.product_id, row);
    });
    return Array.from(rows.values()).filter((row) => !query || `${row.name} ${row.sku}`.toLowerCase().includes(query.toLowerCase())).sort((a, b) => b.revenue - a.revenue);
  }, [productSales, query, selectedSaleIds]);
  const historicalRows = useMemo(() => [...selectedSales].sort((a, b) => b.created_at.localeCompare(a.created_at)), [selectedSales]);
  const historicalSales = selectedSales.reduce((sum, sale) => sum + Number(sale.total), 0);
  const dayCount = daysBetween(from, to);
  const dailyTotals = useMemo(() => {
    const totals = new Map<string, number>();
    visibleSales.forEach((sale) => totals.set(sale.created_at.slice(0, 10), (totals.get(sale.created_at.slice(0, 10)) ?? 0) + Number(sale.total)));
    return totals;
  }, [visibleSales]);
  const recentDays = Array.from({ length: Math.min(28, dayCount) }, (_, index) => {
    const date = new Date(`${to}T00:00:00`);
    date.setDate(date.getDate() - index);
    return dailyTotals.get(date.toISOString().slice(0, 10)) ?? 0;
  });
  const averageDaily = recentDays.reduce((sum, value) => sum + value, 0) / Math.max(1, recentDays.length);
  const priorDaily = historicalSales / dayCount;
  const trend = priorDaily ? (averageDaily - priorDaily) / priorDaily : 0;
  const forecastedSales = averageDaily * horizon * (1 + Math.max(-0.5, Math.min(0.5, trend * 0.5)));
  const historicalOrders = selectedSales.length;
  const predictedOrders = Math.round((historicalOrders / dayCount) * horizon * (1 + Math.max(-0.5, Math.min(0.5, trend * 0.5))));
  const volatility = recentDays.length > 1 && averageDaily ? Math.sqrt(recentDays.reduce((sum, value) => sum + (value - averageDaily) ** 2, 0) / recentDays.length) / averageDaily : 1;
  const confidence = recentDays.length < 7 ? null : Math.max(35, Math.min(96, Math.round(92 - volatility * 35 + Math.min(10, recentDays.length / 3))));
  const branchRows = locations.map((branch) => {
    const branchSales = selectedSales.filter((sale) => sale.location_id === branch.id);
    const amount = branchSales.reduce((sum, sale) => sum + Number(sale.total), 0);
    const previous = visibleSales.filter((sale) => sale.location_id === branch.id && sale.created_at.slice(0, 10) < from).reduce((sum, sale) => sum + Number(sale.total), 0);
    const projected = amount / Math.max(1, dayCount) * horizon;
    return { ...branch, historical: amount, forecast: projected, growth: previous ? (amount - previous) / previous * 100 : 0, confidence, orders: Math.round(branchSales.length / Math.max(1, dayCount) * horizon) };
  }).filter((branch) => !query || branch.name.toLowerCase().includes(query.toLowerCase()));
  const chartPoints = Array.from({ length: 14 }, (_, index) => {
    const date = new Date(`${to}T00:00:00`);
    date.setDate(date.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    return { label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }), value: dailyTotals.get(key) ?? 0 };
  });
  const maxChart = Math.max(1, ...chartPoints.map((point) => point.value), averageDaily);
  const exportCsv = () => {
    const rows = [["Branch", "Historical Sales", "Forecasted Sales", "Growth", "Confidence", "Predicted Orders"], ...branchRows.map((row) => [row.name, row.historical.toFixed(2), row.forecast.toFixed(2), percent(row.growth), row.confidence ? `${row.confidence}%` : "Insufficient data", String(row.orders)])];
    const url = URL.createObjectURL(new Blob([rows.map((row) => row.join(",")).join("\n")], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `sales-forecast-${from}-to-${to}.csv`; link.click(); URL.revokeObjectURL(url);
  };
  const apply = (event: React.FormEvent) => { event.preventDefault(); window.history.pushState({}, "", `/reports/forecasting?from=${from}&to=${to}&location=${location}&horizon=${horizon}`); };

  return <main className="mx-auto max-w-[1500px] space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 text-xs text-slate-400">Home <span className="mx-1">›</span> Reports <span className="mx-1">›</span> Sales Forecasting</div><h1 className="text-2xl font-bold text-slate-900">Sales Forecasting</h1><p className="mt-1 text-sm text-slate-500">Predict future sales and plan your business with data-driven insights.</p></div><form onSubmit={apply} className="flex flex-wrap items-center gap-2"><label className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2 text-xs"><Calendar className="h-4 w-4 text-slate-400" /><input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /><span>to</span><input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><select value={location} onChange={(event) => setLocation(event.target.value)} className="rounded-xl border bg-white px-3 py-2 text-xs"><option value="all">All Branches</option>{locations.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><select value={horizon} onChange={(event) => setHorizon(Number(event.target.value))} className="rounded-xl border bg-white px-3 py-2 text-xs"><option value={7}>Next 7 days</option><option value={30}>Next 30 days</option><option value={60}>Next 60 days</option><option value={90}>Next 90 days</option></select><button className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white">Apply</button></form></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{[["Forecasted Sales", forecastedSales ? formatCurrency(forecastedSales, currency) : "Insufficient data", "Based on recent weighted average"], ["Historical Sales", formatCurrency(historicalSales, currency), `${selectedSales.length} completed records`], ["Growth Rate", percent(trend * 100), "Forecast vs selected history"], ["Forecast Confidence", confidence ? `${confidence}%` : "Insufficient data", "Calculated from volatility"], ["Predicted Orders", predictedOrders.toLocaleString(), "Based on order frequency"]].map(([label, value, note], index) => <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm"><div className="flex items-center gap-2 text-xs text-slate-500"><span className="rounded-lg bg-emerald-50 p-2 text-emerald-600">{index === 0 ? <TrendingUp className="h-4 w-4" /> : <BarChart3 className="h-4 w-4" />}</span>{label}</div><p className="mt-3 text-xl font-bold text-slate-900">{value}</p><p className="mt-1 text-[11px] text-emerald-600">{note}</p></div>)}</div>
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"><section className="rounded-2xl border bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Sales Forecast vs Actual</h2><p className="text-xs text-slate-500">Actual daily sales and projected average for the next {horizon} days.</p></div><span className="text-xs text-slate-400">Confidence range: {confidence ? `±${Math.round((100 - confidence) / 2)}%` : "Insufficient data"}</span></div><div className="mt-6 flex h-56 items-end gap-2 border-b border-slate-100">{chartPoints.map((point) => <div key={point.label} className="group flex min-w-0 flex-1 flex-col items-center justify-end"><div title={`${point.label}: ${formatCurrency(point.value, currency)}`} className="w-full rounded-t bg-blue-500 group-hover:bg-blue-700" style={{ height: `${point.value / maxChart * 170}px`, minHeight: point.value ? 4 : 0 }} /><span className="mt-2 hidden truncate text-[10px] text-slate-400 sm:block">{point.label}</span></div>)}<div className="flex min-w-8 flex-1 flex-col items-center justify-end"><div title={`Forecast average: ${formatCurrency(averageDaily, currency)}`} className="w-full rounded-t bg-emerald-500" style={{ height: `${averageDaily / maxChart * 170}px`, minHeight: averageDaily ? 4 : 0 }} /><span className="mt-2 text-[10px] text-emerald-600">Forecast</span></div></div><div className="mt-3 flex gap-4 text-xs text-slate-500"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-blue-500" />Actual</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-500" />Forecast</span></div></section><aside className="space-y-4"><div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-emerald-600" />Forecast Insights</h3><p className="mt-3 text-sm text-slate-600">{confidence ? `Sales are projected to ${trend >= 0 ? "increase" : "decrease"} by ${Math.abs(trend * 100).toFixed(1)}% based on recent performance.` : "Insufficient historical data to produce a reliable forecast."}</p><p className="mt-3 text-sm text-slate-600">{branchRows[0] ? `${branchRows.sort((a, b) => b.forecast - a.forecast)[0].name} is projected to contribute the most forecasted sales.` : "No branch data is available for this period."}</p></div><div className="rounded-2xl border bg-white p-5 shadow-sm"><h3 className="font-semibold">Quick Actions</h3><button type="button" onClick={exportCsv} className="mt-3 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold"><Download className="h-4 w-4" /> Export Forecast Report</button><a href="/reports" className="mt-2 flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold">View Reports</a></div></aside></div>
    <section className="rounded-2xl border bg-white shadow-sm"><div className="flex flex-wrap gap-2 border-b p-4">{["Forecast Overview", "Product Forecast", "Branch Comparison", "Historical Data"].map((value) => <button type="button" key={value} onClick={() => setTab(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? "bg-emerald-600 text-white" : "text-slate-500 hover:bg-slate-50"}`}>{value}</button>)}</div><div className="flex flex-wrap items-center gap-2 border-b p-4"><div className="relative flex-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search branches, products or categories..." className="h-9 w-full rounded-xl border pl-9 pr-3 text-xs" /></div><button type="button" onClick={exportCsv} className="flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"><Download className="h-4 w-4" /> Export</button></div>{tab === "Product Forecast" && <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr>{["Product", "SKU", "Units Sold", "Historical Revenue", "Forecast Revenue"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{productRows.map((row) => <tr key={row.id}><td className="px-4 py-4 font-semibold text-slate-900">{row.name}</td><td className="px-4 py-4">{row.sku || "—"}</td><td className="px-4 py-4">{row.quantity.toLocaleString()}</td><td className="px-4 py-4">{formatCurrency(row.revenue, currency)}</td><td className="px-4 py-4 font-semibold">{formatCurrency(row.revenue / Math.max(1, dayCount) * horizon, currency)}</td></tr>)}{!productRows.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No product sales match the selected filters.</td></tr>}</tbody></table></div>}{tab === "Historical Data" && <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr>{["Sale", "Date", "Customer", "Branch", "Total"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{historicalRows.map((sale) => <tr key={sale.id}><td className="px-4 py-4 font-semibold text-slate-900">#{sale.sale_number}</td><td className="px-4 py-4">{new Date(sale.created_at).toLocaleDateString()}</td><td className="px-4 py-4">{sale.customer_name || "Walk-in customer"}</td><td className="px-4 py-4">{locations.find((branch) => branch.id === sale.location_id)?.name || "Unassigned"}</td><td className="px-4 py-4 font-semibold">{formatCurrency(Number(sale.total), currency)}</td></tr>)}{!historicalRows.length && <tr><td colSpan={5} className="p-10 text-center text-slate-500">No historical sales match the selected filters.</td></tr>}</tbody></table></div>}{(tab === "Forecast Overview" || tab === "Branch Comparison") && <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-slate-50 uppercase text-slate-500"><tr>{["Branch", "Forecasted Sales", "Historical Sales", "Growth", "Confidence", "Predicted Orders", "Actions"].map((heading) => <th key={heading} className="px-4 py-3">{heading}</th>)}</tr></thead><tbody className="divide-y">{branchRows.map((row) => <tr key={row.id}><td className="px-4 py-4 font-semibold text-slate-900">{row.name}</td><td className="px-4 py-4 font-semibold">{formatCurrency(row.forecast, currency)}</td><td className="px-4 py-4">{formatCurrency(row.historical, currency)}</td><td className="px-4 py-4 text-emerald-600">{percent(row.growth)}</td><td className="px-4 py-4">{row.confidence ? `${row.confidence}%` : "Insufficient data"}</td><td className="px-4 py-4">{row.orders}</td><td className="px-4 py-4"><button type="button" onClick={() => setLocation(row.id)} className="rounded-lg border px-3 py-1.5">View</button></td></tr>)}{!branchRows.length && <tr><td colSpan={7} className="p-10 text-center text-slate-500">No branch sales match the selected filters.</td></tr>}</tbody></table></div>}<div className="border-t p-4 text-xs text-slate-500">Showing {tab === "Product Forecast" ? productRows.length : tab === "Historical Data" ? historicalRows.length : branchRows.length} {tab === "Product Forecast" ? "product" : tab === "Historical Data" ? "sale" : "accessible branch"}{(tab === "Product Forecast" ? productRows.length : tab === "Historical Data" ? historicalRows.length : branchRows.length) === 1 ? "" : "s"} · {tab}</div></section>
  </main>;
}
