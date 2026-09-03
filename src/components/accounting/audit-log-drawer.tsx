"use client";

import React from "react";
import { X, Shield, Clock, User, Building2, Globe } from "lucide-react";
import { useAccountingStore } from "@/lib/accounting/accounting-store";

interface AuditLogDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function AuditLogDrawer({ open, onClose }: AuditLogDrawerProps) {
  const { auditLogs } = useAccountingStore();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-md bg-white p-6 shadow-2xl dark:bg-slate-900 h-full flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-blue-600" />
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Accounting Audit Trail
              </h3>
              <p className="text-[11px] text-slate-400">Enterprise activity and compliance logs</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 flex-1 overflow-y-auto space-y-3 pr-1 text-xs">
          {auditLogs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5 dark:border-slate-800 dark:bg-slate-800/40"
            >
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-blue-700 dark:bg-blue-950/60 dark:text-blue-300">
                  {log.action}
                </span>
                <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                  <Clock className="h-3 w-3" />
                  {new Date(log.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              <p className="mt-2 font-medium text-slate-800 dark:text-slate-200">
                {log.details}
              </p>

              <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] text-slate-400 border-t border-slate-100/80 pt-2 dark:border-slate-800/80">
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3 text-slate-400" />
                  {log.userName}
                </span>
                <span className="flex items-center gap-1">
                  <Building2 className="h-3 w-3 text-slate-400" />
                  {log.branchName}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
