"use client";

import { useState } from "react";
import { X, Shield, Lock, Clock, KeyRound, Smartphone, AlertTriangle, CheckCircle2, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveNotification?: (msg: string) => void;
}

export function SecuritySettingsModal({
  isOpen,
  onClose,
  onSaveNotification
}: SecuritySettingsModalProps) {
  const [inactivityMinutes, setInactivityMinutes] = useState("30");
  const [enforce2FA, setEnforce2FA] = useState(true);
  const [passwordMinLength, setPasswordMinLength] = useState("8");
  const [requireSpecialChar, setRequireSpecialChar] = useState(true);
  const [maxFailedAttempts, setMaxFailedAttempts] = useState("5");
  const [lockoutDurationMins, setLockoutDurationMins] = useState("15");
  const [saved, setSaved] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    setSaved(true);
    if (onSaveNotification) {
      onSaveNotification("Enterprise security policies updated successfully.");
    }
    setTimeout(() => {
      setSaved(false);
      onClose();
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Shield className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">Enterprise Security Policies</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Session timeout, 2FA enforcement, and access controls</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="max-h-[65vh] overflow-y-auto p-6 space-y-5">
          
          {/* Inactivity & Session Management */}
          <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/30 space-y-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
                Session Management & Inactivity Timeout
              </h3>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink-900 dark:text-white">Automatic Inactivity Logout</p>
                <p className="text-[11px] text-ledger-400">Automatically ends inactive sessions to prevent unauthorized access</p>
              </div>
              <select
                value={inactivityMinutes}
                onChange={(e) => setInactivityMinutes(e.target.value)}
                className="h-8 rounded-md border border-ledger-200 bg-white px-2.5 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
              >
                <option value="15">15 minutes</option>
                <option value="30">30 minutes (Recommended)</option>
                <option value="60">60 minutes</option>
                <option value="120">2 hours</option>
              </select>
            </div>
          </div>

          {/* Two-Factor Authentication Policy */}
          <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/30 space-y-3">
            <div className="flex items-center gap-2">
              <Smartphone className="h-4 w-4 text-emerald-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
                Two-Factor Authentication (2FA)
              </h3>
            </div>

            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={enforce2FA}
                onChange={(e) => setEnforce2FA(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <p className="text-xs font-semibold text-ink-900 dark:text-white">
                  Enforce 2FA for Administrators & Branch Managers
                </p>
                <p className="text-[11px] text-ledger-400">
                  Requires TOTP authenticator app or SMS code on every new device login.
                </p>
              </div>
            </label>
          </div>

          {/* Brute-force & Lockout Protection */}
          <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/30 space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-amber-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
                Failed Login Protection
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink-900 dark:text-white mb-1">
                  Max Failed Login Attempts
                </label>
                <select
                  value={maxFailedAttempts}
                  onChange={(e) => setMaxFailedAttempts(e.target.value)}
                  className="h-8 w-full rounded-md border border-ledger-200 bg-white px-2.5 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="3">3 attempts</option>
                  <option value="5">5 attempts (Default)</option>
                  <option value="10">10 attempts</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-ink-900 dark:text-white mb-1">
                  Lockout Cooldown
                </label>
                <select
                  value={lockoutDurationMins}
                  onChange={(e) => setLockoutDurationMins(e.target.value)}
                  className="h-8 w-full rounded-md border border-ledger-200 bg-white px-2.5 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="60">1 hour</option>
                </select>
              </div>
            </div>
          </div>

          {/* Password Complexity */}
          <div className="rounded-xl border border-ledger-100 bg-slate-50/50 p-4 dark:border-ledger-800 dark:bg-slate-800/30 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-4 w-4 text-purple-600" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink-900 dark:text-white">
                Password Complexity Requirements
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-ink-900 dark:text-white mb-1">
                  Minimum Characters
                </label>
                <select
                  value={passwordMinLength}
                  onChange={(e) => setPasswordMinLength(e.target.value)}
                  className="h-8 w-full rounded-md border border-ledger-200 bg-white px-2.5 text-xs dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                >
                  <option value="8">8 characters</option>
                  <option value="10">10 characters</option>
                  <option value="12">12 characters</option>
                </select>
              </div>

              <div className="flex items-center pt-5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={requireSpecialChar}
                    onChange={(e) => setRequireSpecialChar(e.target.checked)}
                    className="h-4 w-4 rounded border-ledger-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-[11px] font-medium text-ink-900 dark:text-white">
                    Require uppercase & symbols
                  </span>
                </label>
              </div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-ledger-100 bg-slate-50/75 px-6 py-3.5 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white">
            {saved ? "Saved!" : "Save Security Policies"}
          </Button>
        </div>

      </div>
    </div>
  );
}
