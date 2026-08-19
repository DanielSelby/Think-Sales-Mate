"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddContactDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: (contact: {
    name: string;
    email: string | null;
    phone: string | null;
  }) => void;
}

export function AddContactDialog({
  open,
  onClose,
  onSave,
}: AddContactDialogProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (!name.trim()) return;

    onSave({
      name: name.trim(),
      email: email.trim() || null,
      phone: phone.trim() || null,
    });

    setName("");
    setEmail("");
    setPhone("");
  }

  function handleClose() {
    setName("");
    setEmail("");
    setPhone("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-ledger-100 bg-white shadow-xl dark:border-ledger-700 dark:bg-ink-900">
        
        <div className="flex items-center justify-between border-b border-ledger-100 px-5 py-4 dark:border-ledger-700">
          <div>
            <h2 className="text-base font-semibold text-ink-900 dark:text-white">
              Add Contact
            </h2>
            <p className="mt-0.5 text-xs text-ledger-500 dark:text-ledger-400">
              Add a new customer to this sale.
            </p>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="rounded-md p-1.5 text-ledger-400 hover:bg-ledger-50 hover:text-ink-900 dark:hover:bg-white/[0.06] dark:hover:text-white"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
              Name <span className="text-alert">*</span>
            </label>

            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Customer name"
              autoFocus
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
              Phone
            </label>

            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Phone number"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
              Email
            </label>

            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email address"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-ledger-100 pt-4 dark:border-ledger-700">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={!name.trim()}
              className="bg-emerald-700 text-white hover:bg-emerald-800"
            >
              Add Contact
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}