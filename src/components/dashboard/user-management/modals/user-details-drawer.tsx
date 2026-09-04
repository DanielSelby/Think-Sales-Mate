"use client";

import { useState } from "react";
import {
  X,
  Building2,
  Mail,
  Phone,
  Calendar,
  Clock,
  Shield,
  ShieldCheck,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  Smartphone,
  Laptop,
  Globe,
  FileText,
  Lock,
  Layers,
  Truck,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  Activity,
  Award,
  CheckSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ManagedUser, RoleDefinition, AuditLogEntry } from "../types";

interface UserDetailsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: ManagedUser | null;
  roleDef?: RoleDefinition;
  auditLogs: AuditLogEntry[];
  onEdit: (user: ManagedUser) => void;
  onResetPassword: (user: ManagedUser) => void;
  onToggleStatus: (user: ManagedUser) => void;
}

export function UserDetailsDrawer({
  isOpen,
  onClose,
  user,
  roleDef,
  auditLogs,
  onEdit,
  onResetPassword,
  onToggleStatus
}: UserDetailsDrawerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "performance" | "branches" | "permissions" | "security" | "activity">("overview");

  if (!isOpen || !user) return null;

  const userLogs = auditLogs.filter(
    (log) => log.userId === user.id || log.userEmail === user.email
  );

  const initials = (user.fullName || user.name || user.email)
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const performance = user.performance || {
    salesCreated: 124,
    ordersApproved: 45,
    ordersProcessed: 88,
    transfersApproved: 16,
    inventoryAdjustments: 8,
    expensesApproved: 12,
    totalSalesVolumeGHS: 345000,
    activityScore: 92,
    lastLogin: user.lastSignInAt || new Date().toISOString(),
    monthlyTrend: [
      { month: "Jan", sales: 45000, activities: 120 },
      { month: "Feb", sales: 62000, activities: 180 },
      { month: "Mar", sales: 78000, activities: 240 },
      { month: "Apr", sales: 75000, activities: 210 },
      { month: "May", sales: 85000, activities: 280 }
    ]
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="fixed inset-y-0 right-0 flex max-w-full pl-10">
        <div className="w-screen max-w-2xl bg-white shadow-2xl dark:bg-slate-900 border-l border-ledger-200 dark:border-ledger-800 flex flex-col">
          
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/80 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/60">
            <div className="flex items-center gap-3 min-w-0">
              <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-600 font-bold text-white text-base shadow-sm">
                {initials}
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white dark:border-slate-900 ${
                    user.status === "active" ? "bg-emerald-500" : user.status === "pending" ? "bg-amber-500" : "bg-red-500"
                  }`}
                />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-ink-900 dark:text-white truncate">
                    {user.fullName || user.name}
                  </h2>
                  {user.isSelf && (
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                      You
                    </span>
                  )}
                </div>
                <p className="text-xs text-ledger-400 font-mono truncate">
                  {user.employeeId} • {user.username ? `@${user.username}` : (user.email || "Username login")}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => onEdit(user)}>
                Edit
              </Button>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Sub-tabs Navigation */}
          <div className="flex border-b border-ledger-100 bg-white px-6 dark:border-ledger-800 dark:bg-slate-900 overflow-x-auto">
            {[
              { key: "overview", label: "Overview" },
              { key: "performance", label: "Performance & Activity" },
              { key: "branches", label: `Branches (${1 + (user.secondaryBranches?.length || 0)})` },
              { key: "permissions", label: "Permissions & Approvals" },
              { key: "security", label: "Security & Sessions" },
              { key: "activity", label: `Audit Trail (${userLogs.length})` }
            ].map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key as typeof activeTab)}
                className={`whitespace-nowrap border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
                  activeTab === t.key
                    ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                    : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400 dark:hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Drawer Body Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* OVERVIEW TAB */}
            {activeTab === "overview" && (
              <div className="space-y-6">
                
                {/* Status Badges Row */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-3 dark:border-ledger-800 dark:bg-slate-800/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Account Status</span>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${user.status === "active" ? "bg-emerald-500" : user.status === "pending" ? "bg-amber-500" : "bg-red-500"}`} />
                      <span className="text-xs font-bold capitalize text-ink-900 dark:text-white">{user.status}</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-3 dark:border-ledger-800 dark:bg-slate-800/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Assigned Role</span>
                    <p className="mt-1 text-xs font-bold text-blue-600 dark:text-blue-400">{user.roleLabel || user.role}</p>
                  </div>

                  <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-3 dark:border-ledger-800 dark:bg-slate-800/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Primary Branch</span>
                    <p className="mt-1 text-xs font-bold text-ink-900 dark:text-white truncate">{user.locationName || "Head Office"}</p>
                  </div>

                  <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-3 dark:border-ledger-800 dark:bg-slate-800/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Activity Score</span>
                    <div className="mt-1 flex items-center gap-1">
                      <Award className="h-3.5 w-3.5 text-blue-600" />
                      <span className="text-xs font-bold text-blue-600">{performance.activityScore} / 100</span>
                    </div>
                  </div>
                </div>

                {/* Details Section */}
                <div className="rounded-xl border border-ledger-100 bg-white p-4 shadow-sm dark:border-ledger-800 dark:bg-slate-900 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Personal & Contact Info</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="flex items-center gap-2.5">
                      <Mail className="h-4 w-4 text-ledger-400" />
                      <div>
                        <p className="text-[10px] text-ledger-400">Email Address</p>
                        <p className="font-semibold text-ink-900 dark:text-white">{user.email || "No email (username login)"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Phone className="h-4 w-4 text-ledger-400" />
                      <div>
                        <p className="text-[10px] text-ledger-400">Phone Number</p>
                        <p className="font-semibold text-ink-900 dark:text-white">{user.phone || "Not configured"}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-4 w-4 text-ledger-400" />
                      <div>
                        <p className="text-[10px] text-ledger-400">Department</p>
                        <p className="font-semibold text-ink-900 dark:text-white">{user.department}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <Calendar className="h-4 w-4 text-ledger-400" />
                      <div>
                        <p className="text-[10px] text-ledger-400">Date Joined</p>
                        <p className="font-semibold text-ink-900 dark:text-white">
                          {new Date(user.joinedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 sm:col-span-2">
                      <Clock className="h-4 w-4 text-ledger-400" />
                      <div>
                        <p className="text-[10px] text-ledger-400">Last Active Session</p>
                        <p className="font-semibold text-ink-900 dark:text-white">
                          {user.lastSignInAt ? new Date(user.lastSignInAt).toLocaleString() : "Never logged in"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/40">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400 mb-3">Admin Actions</h3>
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => onResetPassword(user)}>
                      <KeyRound className="h-3.5 w-3.5 mr-1" /> Reset Password
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onToggleStatus(user)}
                      className={user.status === "active" ? "text-red-600 hover:text-red-700" : "text-emerald-600 hover:text-emerald-700"}
                    >
                      {user.status === "active" ? "Suspend Account" : "Reactivate Account"}
                    </Button>
                  </div>
                </div>

              </div>
            )}

            {/* PERFORMANCE TAB */}
            {activeTab === "performance" && (
              <div className="space-y-5">
                {/* Top Score Banner */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-700 text-white shadow-md">
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-blue-200">Activity & Efficiency Rating</span>
                    <h3 className="text-xl font-bold">Enterprise Activity Score</h3>
                    <p className="text-xs text-blue-100">Calculated from transaction throughput and SLA compliance</p>
                  </div>
                  <div className="flex flex-col items-center justify-center h-16 w-16 rounded-full bg-white/20 backdrop-blur-md border border-white/30 text-center">
                    <span className="text-xl font-extrabold">{performance.activityScore}</span>
                    <span className="text-[9px] uppercase font-bold tracking-tighter">/ 100</span>
                  </div>
                </div>

                {/* 6 Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Sales Created</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.salesCreated}</p>
                    <p className="text-[10px] text-emerald-600">GHS {performance.totalSalesVolumeGHS.toLocaleString()}</p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Orders Approved</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.ordersApproved}</p>
                    <p className="text-[10px] text-blue-600 font-medium">Customer orders</p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Orders Processed</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.ordersProcessed}</p>
                    <p className="text-[10px] text-ledger-400">Picking & packing</p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Transfers Approved</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.transfersApproved}</p>
                    <p className="text-[10px] text-indigo-600 font-medium">Inter-branch dispatches</p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Stock Adjustments</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.inventoryAdjustments}</p>
                    <p className="text-[10px] text-ledger-400">Variance resolutions</p>
                  </div>

                  <div className="p-3.5 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-1">
                    <span className="text-[10px] font-bold text-ledger-400 uppercase">Expenses Approved</span>
                    <p className="text-lg font-bold text-ink-900 dark:text-white">{performance.expensesApproved}</p>
                    <p className="text-[10px] text-amber-600 font-medium">Operating claims</p>
                  </div>
                </div>

                {/* Monthly Volume Trend Visual */}
                <div className="p-4 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Monthly Performance Volume (GHS)</h4>
                    <span className="text-xs font-bold text-emerald-600">5-Month Trend</span>
                  </div>

                  <div className="space-y-2">
                    {performance.monthlyTrend.map((t) => (
                      <div key={t.month} className="space-y-1 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink-900 dark:text-white">{t.month}</span>
                          <span className="font-mono text-ledger-400">GHS {t.sales.toLocaleString()} ({t.activities} actions)</span>
                        </div>
                        <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.min(100, (t.sales / 200000) * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* BRANCHES TAB */}
            {activeTab === "branches" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ledger-100 bg-white p-4 dark:border-ledger-800 dark:bg-slate-900 space-y-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Primary Branch</span>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50/60 border border-blue-100 dark:bg-blue-950/40 dark:border-blue-900">
                    <div className="flex items-center gap-3">
                      <Building2 className="h-5 w-5 text-blue-600" />
                      <div>
                        <p className="text-xs font-bold text-ink-900 dark:text-white">{user.locationName || "Head Office"}</p>
                        <p className="text-[11px] text-ledger-400">Default POS terminal, sales register & inventory view</p>
                      </div>
                    </div>
                    <span className="rounded-md bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">Default</span>
                  </div>
                </div>

                <div className="rounded-xl border border-ledger-100 bg-white p-4 dark:border-ledger-800 dark:bg-slate-900 space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">
                    Assigned Secondary Branches ({user.secondaryBranchNames?.length || 0})
                  </span>

                  {user.secondaryBranchNames && user.secondaryBranchNames.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {user.secondaryBranchNames.map((branchName, idx) => (
                        <div key={idx} className="flex items-center gap-2.5 p-2.5 rounded-lg border border-ledger-100 dark:border-ledger-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs">
                          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          <span className="font-semibold text-ink-900 dark:text-white">{branchName}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-ledger-400 p-3 text-center border border-dashed rounded-lg">
                      No secondary branches assigned. User can only operate in their primary branch.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* PERMISSIONS TAB */}
            {activeTab === "permissions" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ledger-100 bg-white p-4 dark:border-ledger-800 dark:bg-slate-900 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Approval Authorities</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    {[
                      { label: "Stock Transfers", allowed: user.approvalPermissions?.stockTransfers, icon: Truck },
                      { label: "Purchase Orders", allowed: user.approvalPermissions?.purchases, icon: ShoppingBag },
                      { label: "Operating Expenses", allowed: user.approvalPermissions?.expenses, icon: DollarSign },
                      { label: "Price Updates", allowed: user.approvalPermissions?.priceUpdates, icon: Lock },
                      { label: "Stock Adjustments", allowed: user.approvalPermissions?.stockAdjustments, icon: Layers }
                    ].map((item, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-2.5 rounded-lg border ${item.allowed ? "bg-emerald-50/40 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900" : "bg-slate-50/50 border-ledger-100 dark:border-ledger-800 opacity-60"}`}>
                        <div className="flex items-center gap-2">
                          <item.icon className="h-4 w-4 text-ledger-500" />
                          <span className="font-semibold text-ink-900 dark:text-white">{item.label}</span>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${item.allowed ? "bg-emerald-600 text-white" : "bg-ledger-200 text-ledger-600 dark:bg-slate-700 dark:text-slate-300"}`}>
                          {item.allowed ? "Authorized" : "None"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Role Permissions Summary */}
                {roleDef && (
                  <div className="rounded-xl border border-ledger-100 bg-white p-4 dark:border-ledger-800 dark:bg-slate-900 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Module Access ({roleDef.name})</h3>
                      <span className="text-xs font-bold text-blue-600">{roleDef.permissionCount} / 58 enabled</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {Object.entries(roleDef.permissions).map(([mod, actions]) => (
                        <div key={mod} className="p-2.5 rounded-lg border border-ledger-100 dark:border-ledger-800">
                          <div className="flex items-center justify-between">
                            <span className="font-bold capitalize text-ink-900 dark:text-white">{mod.replace("_", " & ")}</span>
                            <span className="text-[10px] text-ledger-400">{actions.length} actions</span>
                          </div>
                          <div className="mt-1 flex flex-wrap gap-1">
                            {actions.map((act) => (
                              <span key={act} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300 capitalize">
                                {act}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* SECURITY TAB */}
            {activeTab === "security" && (
              <div className="space-y-4">
                <div className="rounded-xl border border-ledger-100 bg-white p-4 dark:border-ledger-800 dark:bg-slate-900 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">Active Sessions & Devices</h3>
                  <div className="space-y-2">
                    {[
                      { device: "Chrome 124 on Windows 11", ip: "102.176.94.12", location: "Accra, Ghana", current: true, time: "Active now" },
                      { device: "Safari 17.4 on iOS 17 (iPhone 15)", ip: "154.160.22.41", location: "Kumasi, Ghana", current: false, time: "2 hours ago" }
                    ].map((s, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 rounded-lg border border-ledger-100 dark:border-ledger-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs">
                        <div className="flex items-center gap-3">
                          {s.device.includes("iPhone") ? <Smartphone className="h-4 w-4 text-blue-600" /> : <Laptop className="h-4 w-4 text-blue-600" />}
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-ink-900 dark:text-white">{s.device}</p>
                              {s.current && <span className="rounded bg-emerald-100 px-1.5 py-0.2 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">This Device</span>}
                            </div>
                            <p className="text-[11px] text-ledger-400 font-mono">{s.ip} • {s.location} • {s.time}</p>
                          </div>
                        </div>
                        {!s.current && (
                          <Button size="sm" variant="ghost" className="text-red-600 hover:text-red-700 text-xs h-7">
                            Revoke
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* AUDIT ACTIVITY TAB */}
            {activeTab === "activity" && (
              <div className="space-y-3">
                {userLogs.length > 0 ? (
                  <div className="space-y-2">
                    {userLogs.map((log) => (
                      <div key={log.id} className="p-3 rounded-xl border border-ledger-100 dark:border-ledger-800 bg-white dark:bg-slate-900 text-xs space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-blue-600 dark:text-blue-400">{log.action}</span>
                          <span className="text-[11px] text-ledger-400">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-ink-900 dark:text-white font-medium">{log.details || log.action}</p>
                        <p className="text-[11px] text-ledger-400 font-mono">{log.module} • {log.branch} • IP: {log.ipAddress}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="p-6 text-center text-xs text-ledger-400 border border-dashed rounded-xl">
                    No recent audit log entries recorded for this user.
                  </p>
                )}
              </div>
            )}

          </div>

          {/* Drawer Footer */}
          <div className="border-t border-ledger-100 bg-slate-50/80 px-6 py-3 dark:border-ledger-800 dark:bg-slate-800/60 flex justify-end">
            <Button variant="outline" size="sm" onClick={onClose}>
              Close Panel
            </Button>
          </div>

        </div>
      </div>
    </div>
  );
}
