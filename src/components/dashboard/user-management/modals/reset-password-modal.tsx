"use client";

import { useState } from "react";
import { X, KeyRound, Mail, Lock, CheckCircle2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ManagedUser } from "../types";

interface ResetPasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: ManagedUser | null;
  onConfirmReset: (userId: string, mode: "email" | "temporary", tempPassword?: string) => void;
}

export function ResetPasswordModal({
  isOpen,
  onClose,
  user,
  onConfirmReset
}: ResetPasswordModalProps) {
  const [resetMode, setResetMode] = useState<"email" | "temporary">("email");
  const [tempPassword, setTempPassword] = useState("ThinkSales@2025!");
  const [copied, setCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  if (!isOpen || !user) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(tempPassword);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleReset = () => {
    setIsSubmitting(true);
    setTimeout(() => {
      onConfirmReset(user.id, resetMode, resetMode === "temporary" ? tempPassword : undefined);
      setIsSubmitting(false);
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1200);
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Reset Password</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">{user.fullName || user.email}</p>
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
        <div className="p-6 space-y-4">
          {success ? (
            <div className="py-6 text-center space-y-2">
              <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
              <p className="text-sm font-bold text-ink-900 dark:text-white">Password Reset Successful</p>
              <p className="text-xs text-ledger-400">
                {resetMode === "email"
                  ? `A secure password reset link has been dispatched to ${user.email}.`
                  : "Temporary credentials configured. User will be forced to change password upon next login."}
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setResetMode("email")}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    resetMode === "email"
                      ? "border-blue-600 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-ledger-200 text-ledger-500 hover:bg-slate-50 dark:border-ledger-700 dark:text-ledger-400"
                  }`}
                >
                  <Mail className="h-4 w-4" />
                  <span>Email Reset Link</span>
                </button>

                <button
                  type="button"
                  onClick={() => setResetMode("temporary")}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-xl border text-xs font-semibold transition-all ${
                    resetMode === "temporary"
                      ? "border-blue-600 bg-blue-50/50 text-blue-700 dark:border-blue-500 dark:bg-blue-950/40 dark:text-blue-300"
                      : "border-ledger-200 text-ledger-500 hover:bg-slate-50 dark:border-ledger-700 dark:text-ledger-400"
                  }`}
                >
                  <Lock className="h-4 w-4" />
                  <span>Set Temp Password</span>
                </button>
              </div>

              {resetMode === "email" ? (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-ledger-500 dark:text-ledger-400 border border-ledger-100 dark:border-ledger-800">
                  Sends an encrypted 24-hour verification link to <span className="font-semibold text-ink-900 dark:text-white font-mono">{user.email}</span>.
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white">
                    Temporary One-Time Password
                  </label>
                  <div className="flex items-center gap-2">
                    <Input
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      className="h-9 text-xs font-mono font-semibold"
                    />
                    <Button type="button" size="sm" variant="outline" onClick={handleCopy} className="h-9 shrink-0">
                      <Copy className="h-3.5 w-3.5 mr-1" /> {copied ? "Copied!" : "Copy"}
                    </Button>
                  </div>
                  <p className="text-[11px] text-ledger-400">
                    User will be forced to change this password immediately after logging in.
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        {!success && (
          <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={isSubmitting}
              onClick={handleReset}
              className="bg-amber-600 hover:bg-amber-700 text-white"
            >
              {isSubmitting ? "Processing..." : "Confirm Reset"}
            </Button>
          </div>
        )}

      </div>
    </div>
  );
}
