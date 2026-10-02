"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CircleDollarSign, RotateCcw } from "lucide-react";
import { formatCurrencyAmount, type CurrencyConfig } from "@/lib/currency";

type Closing = {
  id: string;
  closing_date: string;
  location_id?: string | null;
  created_by: string;
  shift?: string | null;
  expected_cash?: number | string | null;
  actual_cash?: number | string | null;
  variance?: number | string | null;
  classification?: string | null;
  variance_reason?: string | null;
  status?: string | null;
};
type Location = { id: string; name: string };
type User = { id: string; name: string };
type RangeKey = "7" | "30" | "90" | "custom";
type Props = { closings: Closing[]; locations: Location[]; users: User[]; currency: CurrencyConfig; organizationName: string };

const amount = (value: unknown) => Number(value ?? 0) || 0;
const shiftName = (value?: string | null) => (value ?? "full_day").replaceAll("_", " ");
const COLORS = ["#1675d1", "#10a37f", "#f59e0b", "#8b5cf6", "#ef4444", "#64748b"];

export function CashClosingAnalytics({ closings, locations, users, currency, organizationName }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState<RangeKey>("30");
  const [from, setFrom] = useState(() => {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - 29);
    return date.toISOString().slice(0, 10);
  });
  const [to, setTo] = useState(today);
  const [branchId, setBranchId] = useState("");
  const [userId, setUserId] = useState("");
  const [shift, setShift] = useState("");
  const [varianceType, setVarianceType] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const userName = (id: string) => users.find((user) => user.id === id)?.name ?? "Unknown user";
  const branchName = (id?: string | null) => locations.find((location) => location.id === id)?.name ?? "All branches";

  const filtered = useMemo(() => {
    let start = from;
    let end = to;
    if (range !== "custom") {
      const days = Number(range);
      end = today;
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - days + 1);
      start = date.toISOString().slice(0, 10);
    }
    return closings.filter((row) => {
      const variance = amount(row.variance);
      const type = variance < 0 ? "shortage" : variance > 0 ? "excess" : "balanced";
      return row.closing_date >= start
        && row.closing_date <= end
        && (!branchId || row.location_id === branchId)
        && (!userId || row.created_by === userId)
        && (!shift || (row.shift ?? "full_day") === shift)
        && (!varianceType || type === varianceType)
        && (!selectedReason || (row.variance_reason?.trim() || "No reason recorded") === selectedReason);
    });
  }, [closings, from, to, range, today, branchId, userId, shift, varianceType, selectedReason]);

  const shortages = filtered.filter((row) => amount(row.variance) < 0);
  const excesses = filtered.filter((row) => amount(row.variance) > 0);
  const shortAmount = shortages.reduce((sum, row) => sum + Math.abs(amount(row.variance)), 0);
  const excessAmount = excesses.reduce((sum, row) => sum + amount(row.variance), 0);
  const averageVariance = filtered.length
    ? filtered.reduce((sum, row) => sum + Math.abs(amount(row.variance)), 0) / filtered.length
    : 0;

  const trendData = useMemo(() => {
    const days = new Map<string, { date: string; shortage: number; excess: number; closings: number }>();
    for (const row of filtered) {
      const point = days.get(row.closing_date) ?? { date: row.closing_date, shortage: 0, excess: 0, closings: 0 };
      const variance = amount(row.variance);
      if (variance < 0) point.shortage += Math.abs(variance);
      if (variance > 0) point.excess += variance;
      point.closings += 1;
      days.set(row.closing_date, point);
    }
    return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  }, [filtered]);

  const branchData = useMemo(() => {
    const groups = new Map<string, { branchId: string; branch: string; shortage: number; excess: number; net: number; closings: number }>();
    for (const row of filtered) {
      const id = row.location_id ?? "";
      const point = groups.get(id) ?? { branchId: id, branch: branchName(id), shortage: 0, excess: 0, net: 0, closings: 0 };
      const variance = amount(row.variance);
      if (variance < 0) point.shortage += Math.abs(variance);
      if (variance > 0) point.excess += variance;
      point.net += variance;
      point.closings += 1;
      groups.set(id, point);
    }
    return [...groups.values()].sort((a, b) => a.branch.localeCompare(b.branch));
  }, [filtered, locations]);

  const reasonData = useMemo(() => {
    const groups = new Map<string, { reason: string; occurrences: number; total: number; cases: number }>();
    const varianceCases = filtered.filter((row) => amount(row.variance) !== 0).length;
    for (const row of filtered.filter((item) => amount(item.variance) !== 0)) {
      const reason = row.variance_reason?.trim() || "No reason recorded";
      const point = groups.get(reason) ?? { reason, occurrences: 0, total: 0, cases: 0 };
      point.occurrences += 1;
      point.total += Math.abs(amount(row.variance));
      point.cases = varianceCases;
      groups.set(reason, point);
    }
    return [...groups.values()].sort((a, b) => b.occurrences - a.occurrences);
  }, [filtered]);

  const byBranch = (rows: Closing[]) => {
    const groups = new Map<string, { name: string; closings: number; amount: number }>();
    rows.forEach((row) => {
      const name = branchName(row.location_id);
      const point = groups.get(name) ?? { name, closings: 0, amount: 0 };
      point.closings += 1;
      point.amount += Math.abs(amount(row.variance));
      groups.set(name, point);
    });
    return [...groups.values()].sort((a, b) => b.amount - a.amount);
  };
  const shortByBranch = byBranch(shortages);
  const excessByBranch = byBranch(excesses);
  const averageShortage = shortages.length ? shortAmount / shortages.length : 0;
  const averageExcess = excesses.length ? excessAmount / excesses.length : 0;
  const resetFilters = () => {
    setRange("30");
    setFrom("");
    setTo("");
    setBranchId("");
    setUserId("");
    setShift("");
    setVarianceType("");
    setSelectedReason("");
  };

  const cards = [
    { label: "Total closings", value: String(filtered.length), icon: CircleDollarSign, color: "text-blue-600" },
    { label: "Balanced closings", value: String(filtered.filter((row) => amount(row.variance) === 0).length), icon: CircleDollarSign, color: "text-emerald-600" },
    { label: "Total shortage", value: formatCurrencyAmount(shortAmount, currency), icon: ArrowDownRight, color: "text-red-600" },
    { label: "Total excess", value: formatCurrencyAmount(excessAmount, currency), icon: ArrowUpRight, color: "text-amber-600" },
    { label: "Average variance", value: formatCurrencyAmount(averageVariance, currency), icon: BarChart3, color: "text-violet-600" },
    { label: "Pending approvals", value: String(filtered.filter((row) => row.status === "pending_approval").length), icon: AlertTriangle, color: "text-orange-600" },
  ];

  return (
    <section className="space-y-4" aria-labelledby="cash-closing-analytics">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-[#1675d1]" />
          <div><h2 id="cash-closing-analytics" className="text-lg font-bold text-[#12345a] dark:text-white">End-of-Day Analytics</h2><p className="text-xs text-ledger-500">Real closing data for {organizationName} and your permitted branch scope.</p></div>
        </div>
        <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 rounded-md border px-3 py-2 text-xs font-medium"><RotateCcw className="h-3.5 w-3.5" />Reset filters</button>
      </div>

      <div className="grid gap-2 rounded-xl border border-[#dce8f2] bg-white p-3 shadow-sm dark:border-ledger-700 dark:bg-ink-900 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <label className="text-[10px] font-medium text-ledger-500">Organization<input value={organizationName} readOnly className="mt-1 h-9 w-full rounded border border-ledger-200 bg-ledger-50 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label>
        <label className="text-[10px] font-medium text-ledger-500">Branch<select value={branchId} onChange={(event) => setBranchId(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All authorized branches</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        <label className="text-[10px] font-medium text-ledger-500">Date range<select value={range} onChange={(event) => setRange(event.target.value as RangeKey)} className="mt-1 h-9 w-full rounded border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="90">Last 90 days</option><option value="custom">Custom range</option></select></label>
        {range === "custom" && <><label className="text-[10px] font-medium text-ledger-500">From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label><label className="text-[10px] font-medium text-ledger-500">To<input type="date" value={to} onChange={(event) => setTo(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 px-2 text-xs dark:border-ledger-700 dark:bg-ink-950" /></label></>}
        <label className="text-[10px] font-medium text-ledger-500">User<select value={userId} onChange={(event) => setUserId(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All authorized users</option>{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select></label>
        <label className="text-[10px] font-medium text-ledger-500">Shift<select value={shift} onChange={(event) => setShift(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All shifts</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="night">Night</option><option value="full_day">Full day</option></select></label>
        <label className="text-[10px] font-medium text-ledger-500">Variance type<select value={varianceType} onChange={(event) => setVarianceType(event.target.value)} className="mt-1 h-9 w-full rounded border border-ledger-200 bg-white px-2 text-xs dark:border-ledger-700 dark:bg-ink-950"><option value="">All types</option><option value="balanced">Balanced</option><option value="shortage">Shortage</option><option value="excess">Excess</option></select></label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cards.map(({ label, value, icon: Icon, color }) => <article key={label} className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="flex items-center justify-between"><span className="text-xs text-ledger-500">{label}</span><Icon className={`h-4 w-4 ${color}`} /></div><p className="mt-2 text-xl font-bold text-[#17385d] dark:text-white">{value}</p></article>)}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        <ChartCard title="Daily Variance Trend" subtitle="Shortages and excesses shown separately by business date">
          {trendData.length ? <ResponsiveContainer width="100%" height={280}><LineChart data={trendData} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} tickFormatter={(value) => formatCurrencyAmount(Number(value), currency)} /><Tooltip formatter={(value, name) => [formatCurrencyAmount(Number(value), currency), name]} labelFormatter={(label, payload) => { const point = payload?.[0]?.payload; return `${label} · ${point?.branch ?? "All branches"} · ${point?.closings ?? 0} closing(s)`; }} /><Legend /><Line type="monotone" dataKey="shortage" name="Shortage" stroke="#e5484d" strokeWidth={2} dot={{ r: 3 }} /><Line type="monotone" dataKey="excess" name="Excess" stroke="#10a37f" strokeWidth={2} dot={{ r: 3 }} /></LineChart></ResponsiveContainer> : <EmptyState /> }
        </ChartCard>
        <ChartCard title="Branch Variance Comparison" subtitle="Operational comparison, not employee ranking">
          {branchData.length ? <ResponsiveContainer width="100%" height={280}><BarChart data={branchData} margin={{ top: 8, right: 8, left: 8, bottom: 34 }} onClick={(event) => { const point = event?.activePayload?.[0]?.payload; if (point) setBranchId(point.branchId); }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="branch" tick={{ fontSize: 9 }} angle={-20} textAnchor="end" interval={0} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(value, name) => [formatCurrencyAmount(Number(value), currency), name]} /><Legend /><Bar dataKey="shortage" name="Total shortage" fill="#e5484d" cursor="pointer" /><Bar dataKey="excess" name="Total excess" fill="#10a37f" cursor="pointer" /></BarChart></ResponsiveContainer> : <EmptyState />}
          <div className="mt-2 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-ledger-500"><tr><th className="py-2">Branch</th><th>Net variance</th><th>Closings</th></tr></thead><tbody>{branchData.map((row) => <tr key={row.branchId} className="border-t border-ledger-100 dark:border-ledger-700"><td className="py-2"><button type="button" onClick={() => setBranchId(row.branchId)} className="text-[#1675d1] hover:underline">{row.branch}</button></td><td className={row.net < 0 ? "text-red-600" : "text-emerald-700"}>{formatCurrencyAmount(row.net, currency)}</td><td>{row.closings}</td></tr>)}</tbody></table></div>
        </ChartCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AnalysisCard title="Cash Shortage Analysis" count={shortages.length} total={shortAmount} average={averageShortage} frequency={filtered.length ? shortages.length / filtered.length * 100 : 0} rows={shortByBranch} currency={currency} tone="red" />
        <AnalysisCard title="Cash Excess Analysis" count={excesses.length} total={excessAmount} average={averageExcess} frequency={filtered.length ? excesses.length / filtered.length * 100 : 0} rows={excessByBranch} currency={currency} tone="green" />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
        <ChartCard title="Frequent Variance Reasons" subtitle="Select a reason to inspect its closing records">
          {reasonData.length ? <div className="grid gap-2 sm:grid-cols-[200px_1fr]"><div className="h-[220px]"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={reasonData} dataKey="occurrences" nameKey="reason" innerRadius={48} outerRadius={82} onClick={(entry) => setSelectedReason(entry.reason)}>{reasonData.map((entry, index) => <Cell key={entry.reason} fill={COLORS[index % COLORS.length]} cursor="pointer" />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><div className="overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-ledger-500"><tr><th className="py-2">Reason</th><th>Occurrences</th><th>Total amount</th><th>% cases</th></tr></thead><tbody>{reasonData.map((row, index) => <tr key={row.reason} className={`border-t border-ledger-100 dark:border-ledger-700 ${selectedReason === row.reason ? "bg-blue-50 dark:bg-blue-950/30" : ""}`}><td className="py-2"><button type="button" onClick={() => setSelectedReason(selectedReason === row.reason ? "" : row.reason)} className="inline-flex items-center gap-1 hover:underline"><span className="h-2 w-2 rounded-full" style={{ background: COLORS[index % COLORS.length] }} />{row.reason}</button></td><td>{row.occurrences}</td><td>{formatCurrencyAmount(row.total, currency)}</td><td>{row.cases ? `${(row.occurrences / row.cases * 100).toFixed(1)}%` : "0%"}</td></tr>)}</tbody></table></div></div> : <EmptyState />}
        </ChartCard>
        <ChartCard title="Shortage and Excess Breakdown" subtitle="Occurrence count by shift and user">
          <div className="grid gap-4 md:grid-cols-2"><Breakdown title="Shortage by shift" rows={groupBy(shortages, (row) => shiftName(row.shift))} /><Breakdown title="Excess by shift" rows={groupBy(excesses, (row) => shiftName(row.shift))} /><Breakdown title="Shortage by user" rows={groupBy(shortages, (row) => userName(row.created_by))} /><Breakdown title="Excess by user" rows={groupBy(excesses, (row) => userName(row.created_by))} /></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2"><div className="h-48"><h4 className="mb-1 text-xs font-semibold">Shortage by branch</h4><ResponsiveContainer width="100%" height="100%"><BarChart data={shortByBranch}><XAxis dataKey="name" tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="closings" fill="#e5484d" /></BarChart></ResponsiveContainer></div><div className="h-48"><h4 className="mb-1 text-xs font-semibold">Excess by branch</h4><ResponsiveContainer width="100%" height="100%"><BarChart data={excessByBranch}><XAxis dataKey="name" tick={{ fontSize: 9 }} /><Tooltip /><Bar dataKey="closings" fill="#10a37f" /></BarChart></ResponsiveContainer></div></div>
        </ChartCard>
      </div>

      <ChartCard title={selectedReason ? `Closings: ${selectedReason}` : "Filtered Closing Records"} subtitle={`${filtered.length} record(s) in the selected analytics scope`}>
        <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-ledger-50 text-[10px] uppercase text-ledger-500 dark:bg-white/[0.03]"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">Branch</th><th className="px-3 py-2">User</th><th className="px-3 py-2">Shift</th><th className="px-3 py-2">Expected</th><th className="px-3 py-2">Actual</th><th className="px-3 py-2">Variance</th><th className="px-3 py-2">Reason</th><th /></tr></thead><tbody className="divide-y divide-ledger-100 dark:divide-ledger-700">{filtered.slice(0, 100).map((row) => <tr key={row.id}><td className="px-3 py-2">{row.closing_date}</td><td className="px-3 py-2">{branchName(row.location_id)}</td><td className="px-3 py-2">{userName(row.created_by)}</td><td className="px-3 py-2 capitalize">{shiftName(row.shift)}</td><td className="px-3 py-2">{formatCurrencyAmount(amount(row.expected_cash), currency)}</td><td className="px-3 py-2">{formatCurrencyAmount(amount(row.actual_cash), currency)}</td><td className={`px-3 py-2 font-semibold ${amount(row.variance) < 0 ? "text-red-600" : amount(row.variance) > 0 ? "text-emerald-700" : ""}`}>{formatCurrencyAmount(amount(row.variance), currency)}</td><td className="px-3 py-2">{row.variance_reason || "—"}</td><td className="px-3 py-2"><a href={`/banking/cash-closing?tab=history&closing_id=${encodeURIComponent(row.id)}`} className="text-[#1675d1] underline">Details</a></td></tr>)}</tbody></table></div>
      </ChartCard>
      {!filtered.length && <EmptyState />}
    </section>
  );
}

function groupBy(rows: Closing[], key: (row: Closing) => string) {
  const groups = new Map<string, number>();
  rows.forEach((row) => groups.set(key(row), (groups.get(key(row)) ?? 0) + 1));
  return [...groups].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 5);
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <article className="rounded-xl border border-[#dce8f2] bg-white p-4 shadow-sm dark:border-ledger-700 dark:bg-ink-900"><div className="mb-3"><h3 className="font-bold text-[#17385d] dark:text-white">{title}</h3>{subtitle && <p className="text-[11px] text-ledger-500">{subtitle}</p>}</div>{children}</article>;
}

function EmptyState() {
  return <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-ledger-200 text-xs text-ledger-500 dark:border-ledger-700">No closing data in this filtered range.</div>;
}

function Breakdown({ title, rows }: { title: string; rows: Array<{ name: string; count: number }> }) {
  return <div><h4 className="mb-2 text-xs font-semibold">{title}</h4>{rows.length ? <div className="space-y-2">{rows.map((row) => <div key={row.name} className="flex justify-between gap-2 text-[11px]"><span className="truncate">{row.name}</span><strong>{row.count}</strong></div>)}</div> : <p className="text-[11px] text-ledger-500">No records</p>}</div>;
}

function AnalysisCard({ title, count, total, average, frequency, rows, currency, tone }: { title: string; count: number; total: number; average: number; frequency: number; rows: Array<{ name: string; closings: number; amount: number }>; currency: CurrencyConfig; tone: "red" | "green" }) {
  const accent = tone === "red" ? "text-red-600 bg-red-50 dark:bg-red-950/30" : "text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30";
  return <ChartCard title={title} subtitle={`Breakdown across ${rows.length ? "accessible branches" : "no branches"}`}>
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">{[["Closings", String(count)], ["Total amount", formatCurrencyAmount(total, currency)], ["Average", formatCurrencyAmount(average, currency)], ["Frequency", `${frequency.toFixed(1)}%`]].map(([label, value]) => <div key={label} className={`rounded-lg p-3 ${accent}`}><p className="text-[10px] opacity-75">{label}</p><strong className="mt-1 block text-sm">{value}</strong></div>)}</div>
    <div className="mt-4 overflow-x-auto"><table className="w-full text-left text-[11px]"><thead className="text-ledger-500"><tr><th className="py-2">Branch</th><th>Occurrences</th><th>Amount</th></tr></thead><tbody>{rows.map((row) => <tr key={row.name} className="border-t border-ledger-100 dark:border-ledger-700"><td className="py-2">{row.name}</td><td>{row.closings}</td><td>{formatCurrencyAmount(row.amount, currency)}</td></tr>)}</tbody></table></div>
  </ChartCard>;
}
