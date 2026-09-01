"use client";

import { X, ArrowRight, History, Laptop, Globe, CheckCircle2, AlertTriangle, XCircle, FileText, User, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditLogEntry } from "../types";

interface ActivityDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  log: AuditLogEntry | null;
}

export function ActivityDiffModal({
  isOpen,
  onClose,
  log
}: ActivityDiffModalProps) {
  if (!isOpen || !log) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/80 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-ink-900 dark:text-white">Activity Detail & Audit Diff</h2>
                <span className="font-mono text-[10px] bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 px-2 py-0.5 rounded font-bold">
                  {log.logId || log.id}
                </span>
              </div>
              <p className="text-xs text-ledger-400">{log.action} • {log.module}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          
          {/* Summary Metadata Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-xl border border-ledger-100 bg-slate-50/50 dark:border-ledger-800 dark:bg-slate-800/40 text-xs">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Actor</span>
              <p className="font-bold text-ink-900 dark:text-white mt-0.5">{log.userName}</p>
              <p className="text-[11px] text-ledger-400 truncate">{log.userEmail}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Timestamp</span>
              <p className="font-bold text-ink-900 dark:text-white mt-0.5">
                {new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
              <p className="text-[11px] text-ledger-400 font-mono">
                {new Date(log.timestamp).toLocaleDateString()}
              </p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Branch & Location</span>
              <p className="font-bold text-ink-900 dark:text-white mt-0.5">{log.branch}</p>
              <p className="text-[11px] text-ledger-400 font-mono">{log.ipAddress}</p>
            </div>

            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Device & Status</span>
              <p className="font-bold text-ink-900 dark:text-white mt-0.5 truncate">{log.device}</p>
              <div className="flex items-center gap-1 mt-0.5">
                {log.status === "success" ? (
                  <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                    <CheckCircle2 className="h-3 w-3" /> Success
                  </span>
                ) : log.status === "warning" ? (
                  <span className="text-[10px] font-bold text-amber-600 flex items-center gap-0.5">
                    <AlertTriangle className="h-3 w-3" /> Warning
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-red-600 flex items-center gap-0.5">
                    <XCircle className="h-3 w-3" /> Failed
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Description */}
          {log.details && (
            <div className="p-3 rounded-xl border border-ledger-100 bg-white dark:border-ledger-800 dark:bg-slate-900 text-xs">
              <span className="text-[10px] font-bold uppercase tracking-wider text-ledger-400">Audit Narrative</span>
              <p className="mt-1 text-ink-900 dark:text-white leading-relaxed">{log.details}</p>
            </div>
          )}

          {/* Before & After Changes Delta */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ledger-400">
                Before & After State Comparison
              </h3>
              <span className="text-[11px] text-ledger-400 font-mono">
                Record: {log.recordId || log.recordType || log.module}
              </span>
            </div>

            {log.changesDiff && log.changesDiff.length > 0 ? (
              <div className="rounded-xl border border-ledger-100 dark:border-ledger-800 overflow-hidden text-xs">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-ledger-100 dark:border-ledger-800 text-[10px] font-bold uppercase tracking-wider text-ledger-400">
                    <tr>
                      <th className="p-3 w-1/3">Field</th>
                      <th className="p-3 w-1/3 text-red-600 dark:text-red-400">Previous Value</th>
                      <th className="p-3 w-1/3 text-emerald-600 dark:text-emerald-400">New Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ledger-100 dark:divide-ledger-800">
                    {log.changesDiff.map((diff, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="p-3 font-semibold text-ink-900 dark:text-white">
                          {diff.label || diff.field}
                        </td>
                        <td className="p-3 font-mono text-red-700 bg-red-50/40 dark:bg-red-950/20 dark:text-red-300">
                          {String(diff.oldValue ?? "null")}
                        </td>
                        <td className="p-3 font-mono text-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/20 dark:text-emerald-300 font-bold">
                          {String(diff.newValue ?? "null")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-xl border border-red-200 bg-red-50/30 dark:border-red-900/60 dark:bg-red-950/20 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-red-600 dark:text-red-400">Old State / Value</span>
                  <p className="mt-1 font-mono font-semibold text-red-900 dark:text-red-200">
                    {log.oldValue || "Initial State"}
                  </p>
                </div>

                <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/60 dark:bg-emerald-950/20 text-xs">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">New State / Value</span>
                  <p className="mt-1 font-mono font-bold text-emerald-900 dark:text-emerald-200">
                    {log.newValue || log.action}
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/80 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/60">
          <span className="text-[11px] text-ledger-400 font-mono">
            Session ID: {log.sessionId || "N/A"}
          </span>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

      </div>
    </div>
  );
}
