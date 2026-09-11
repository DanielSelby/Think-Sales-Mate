"use client";

import { Download, FileClock, ShieldAlert, Settings2, UserRound } from "lucide-react";
import { Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type VisualRecord = {
  id: string;
  actor_name: string;
  action: string;
  entity_type: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

function isFailed(record: VisualRecord) {
  return /failed|rejected|denied|error/i.test(record.action) || record.metadata.status === "failed";
}

function category(record: VisualRecord) {
  const value = `${record.action} ${record.entity_type}`.toLowerCase();
  if (/login|logout|password|security|permission|session/.test(value)) return "security";
  if (/create|add|update|edit|delete|remove|adjust|transfer|price|cost|purchase|sale/.test(`${value} ${JSON.stringify(record.metadata)}`)) return "data";
  return "user";
}

export function AuditVisuals({ records }: { records: VisualRecord[] }) {
  const trend = Array.from({ length: 14 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (13 - index));
    const key = date.toISOString().slice(0, 10);
    const day = records.filter((record) => record.created_at.slice(0, 10) === key);
    return {
      label: date.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
      user: day.filter((record) => category(record) === "user").length,
      changes: day.filter((record) => category(record) === "data").length,
      security: day.filter((record) => category(record) === "security").length,
    };
  });
  const modules = [...new Set(records.map((record) => record.metadata.module as string || record.entity_type))]
    .map((name) => ({ name, value: records.filter((record) => (record.metadata.module as string || record.entity_type) === name).length }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 6);
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#06b6d4", "#94a3b8"];
  const recent = records.slice(0, 5);
  const failed = records.filter(isFailed).length;
  const topModule = modules[0];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-5">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div><h2 className="font-semibold text-slate-900">Audit Activity Trend</h2><p className="text-xs text-slate-500">User actions, data changes and security events over the last 14 days.</p></div>
            <span className="hidden gap-3 text-[11px] text-slate-500 sm:flex"><span className="text-emerald-600">● User Actions</span><span className="text-blue-600">● Data Changes</span><span className="text-violet-600">● Security Events</span></span>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Line type="monotone" dataKey="user" name="User Actions" stroke="#10b981" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="changes" name="Data Changes" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                <Line type="monotone" dataKey="security" name="Security Events" stroke="#8b5cf6" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-900">Activity by Module</h2><p className="text-xs text-slate-500">Distribution of recorded events across your organization.</p></div></div>
          <div className="flex flex-wrap items-center gap-5">
            <div className="h-52 w-52"><ResponsiveContainer><PieChart><Pie data={modules} dataKey="value" nameKey="name" innerRadius={54} outerRadius={78} paddingAngle={3}>{modules.map((module, index) => <Cell key={module.name} fill={colors[index % colors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
            <div className="min-w-[220px] flex-1 space-y-3">{modules.map((module, index) => <div key={module.name} className="flex items-center justify-between text-xs"><span className="flex items-center gap-2"><i className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colors[index % colors.length] }} />{module.name}</span><strong>{module.value} <span className="font-normal text-slate-400">{records.length ? `${Math.round(module.value / records.length * 100)}%` : "0%"}</span></strong></div>)}</div>
          </div>
        </div>
      </div>
      <aside className="space-y-5">
        <div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-900">Quick Actions</h2><div className="mt-3 space-y-2"><button type="button" onClick={() => window.print()} className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50"><Download className="h-4 w-4" /> Export / Print Audit Report</button><button type="button" className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50"><FileClock className="h-4 w-4" /> View Audit Logs</button><button type="button" className="flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs font-semibold hover:bg-slate-50"><Settings2 className="h-4 w-4" /> Configure Audit Settings</button></div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-900">Recent Activity</h2><div className="mt-3 space-y-3">{recent.map((record) => <div key={record.id} className="flex gap-2 border-b pb-3 last:border-0 last:pb-0"><span className={`mt-0.5 rounded-lg p-1.5 ${isFailed(record) ? "bg-red-50 text-red-600" : category(record) === "security" ? "bg-violet-50 text-violet-600" : "bg-emerald-50 text-emerald-600"}`}>{category(record) === "security" ? <ShieldAlert className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}</span><div className="min-w-0"><p className="truncate text-xs font-semibold">{record.action} · {record.entity_type}</p><p className="text-[11px] text-slate-500">{record.actor_name} · {new Date(record.created_at).toLocaleString()}</p></div></div>)}{!recent.length && <p className="text-xs text-slate-500">No recent activity recorded.</p>}</div></div>
        <div className="rounded-xl border bg-white p-4 shadow-sm"><h2 className="font-semibold text-slate-900">Audit Insights</h2><div className="mt-3 space-y-2 text-xs text-slate-600">{topModule && <p>• {topModule.name} has the highest activity volume ({Math.round(topModule.value / Math.max(1, records.length) * 100)}% of events).</p>}{failed > 0 && <p>• {failed} failed event{failed === 1 ? "" : "s"} require review.</p>}{!topModule && failed === 0 && <p>No significant audit insight available for the selected period.</p>}</div></div>
      </aside>
    </div>
  );
}
