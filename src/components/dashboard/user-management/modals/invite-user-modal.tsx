"use client";

import { useState } from "react";
import { X, Mail, Send, CheckCircle2, Clock, RotateCw, Trash2, Building2, Shield, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { InvitationRecord, RoleDefinition, UserBranch } from "../types";

interface InviteUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  roles: RoleDefinition[];
  branches: UserBranch[];
  invitations: InvitationRecord[];
  onSendInvite: (invite: { name: string; email: string; role: string; branchId: string }) => void;
  onResendInvite: (inviteId: string) => void;
  onRevokeInvite: (inviteId: string) => void;
}

export function InviteUserModal({
  isOpen,
  onClose,
  roles,
  branches,
  invitations,
  onSendInvite,
  onResendInvite,
  onRevokeInvite
}: InviteUserModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("sales_officer");
  const [branchId, setBranchId] = useState(branches[0]?.id || "b-head");
  const [activeTab, setActiveTab] = useState<"invite" | "history">("invite");
  const [isSending, setIsSending] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !name) return;

    setIsSending(true);
    setTimeout(() => {
      onSendInvite({ name, email, role, branchId });
      setIsSending(false);
      setName("");
      setEmail("");
      setActiveTab("history");
    }, 400);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl overflow-hidden rounded-2xl border border-ledger-200 bg-white shadow-2xl dark:border-ledger-700 dark:bg-slate-900 flex flex-col max-h-[85vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ledger-100 bg-slate-50/75 px-6 py-4 dark:border-ledger-800 dark:bg-slate-800/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-900 dark:text-white">User Invitation System</h2>
              <p className="text-xs text-ledger-500 dark:text-ledger-400">Send account activation invitations and track confirmation status</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ledger-400 hover:bg-slate-100 hover:text-ink-900 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex border-b border-ledger-100 bg-white px-6 dark:border-ledger-800 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab("invite")}
            className={`border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
              activeTab === "invite"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400"
            }`}
          >
            Send New Invitation
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={`border-b-2 px-4 py-3 text-xs font-semibold transition-all ${
              activeTab === "history"
                ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                : "border-transparent text-ledger-500 hover:text-ink-900 dark:text-ledger-400"
            }`}
          >
            Track Pending & Expired Invites ({invitations.length})
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {activeTab === "invite" ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                    Full Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Kwabena Darko"
                    className="h-9 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <Input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                    Assign Role <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                  >
                    {roles.map((r) => (
                      <option key={r.key || r.id} value={r.key || r.id}>
                        {r.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink-900 dark:text-white mb-1">
                    Primary Branch <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={branchId}
                    onChange={(e) => setBranchId(e.target.value)}
                    className="h-9 w-full rounded-md border border-ledger-200 bg-white px-3 text-xs font-semibold dark:border-ledger-700 dark:bg-slate-900 dark:text-white"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-ledger-100 bg-blue-50/40 dark:border-ledger-800 dark:bg-blue-950/20 text-xs text-ledger-600 dark:text-slate-300 space-y-1">
                <p className="font-bold text-blue-700 dark:text-blue-300">How activation works:</p>
                <p>
                  The invited user will receive an email containing a secure 7-day single-use activation link to configure their password and set up 2FA.
                </p>
              </div>

              <div className="flex justify-end pt-2">
                <Button type="submit" disabled={isSending} className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold">
                  <Send className="h-3.5 w-3.5 mr-1.5" />
                  {isSending ? "Sending Invitation..." : "Send Invitation"}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              {invitations.length === 0 ? (
                <p className="p-8 text-center text-xs text-ledger-400 border border-dashed rounded-xl">
                  No invitations recorded.
                </p>
              ) : (
                <div className="divide-y divide-ledger-100 dark:divide-ledger-800 rounded-xl border border-ledger-100 dark:border-ledger-800 overflow-hidden text-xs">
                  {invitations.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-ink-900 dark:text-white">{inv.name}</p>
                          <span
                            className={`px-2 py-0.2 rounded-full text-[10px] font-bold ${
                              inv.status === "pending"
                                ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                                : inv.status === "accepted"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
                            }`}
                          >
                            {inv.status.toUpperCase()}
                          </span>
                        </div>
                        <p className="text-[11px] text-ledger-400 font-mono mt-0.5">
                          {inv.email} • {inv.roleLabel} • {inv.branchName}
                        </p>
                        <p className="text-[10px] text-ledger-400 mt-0.5">
                          Invited on {new Date(inv.invitedAt).toLocaleDateString()} (Expires: {new Date(inv.expiresAt).toLocaleDateString()})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {inv.status !== "accepted" && (
                          <Button size="sm" variant="outline" onClick={() => onResendInvite(inv.id)} className="h-7 text-xs">
                            <RotateCw className="h-3 w-3 mr-1" /> Resend
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => onRevokeInvite(inv.id)} className="h-7 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-ledger-100 bg-slate-50/75 px-6 py-3 dark:border-ledger-800 dark:bg-slate-800/50">
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>

      </div>
    </div>
  );
}
