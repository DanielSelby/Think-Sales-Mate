"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SUPPLIER_CATEGORIES, PAYMENT_TERMS_OPTIONS } from "@/lib/suppliers/format";
import { createSupplier } from "@/app/(dashboard)/purchases/suppliers/actions";

interface AddSupplierDialogProps {
  open: boolean;
  onClose: () => void;
  currency: string;
  onCreated: (name: string) => void;
}

export function AddSupplierDialog({ open, onClose, currency, onCreated }: AddSupplierDialogProps) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [name, setName] = React.useState("");
  const [contactPerson, setContactPerson] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [paymentTerms, setPaymentTerms] = React.useState<string>(PAYMENT_TERMS_OPTIONS[3]);
  const [address, setAddress] = React.useState("");

  function reset() {
    setName(""); setContactPerson(""); setPhone(""); setEmail("");
    setCategory(""); setCountry(""); setPaymentTerms(PAYMENT_TERMS_OPTIONS[3]); setAddress("");
    setError(null);
  }

  function submit() {
    if (!name.trim()) {
      setError("Supplier name is required.");
      return;
    }
    startTransition(async () => {
      const result = await createSupplier({
        name,
        contactPerson: contactPerson || null,
        phone: phone || null,
        email: email || null,
        category: category || null,
        country: country || null,
        paymentTerms: paymentTerms || null,
        currency,
        address: address || null,
      });
      if (!result.ok) {
        setError(result.error ?? "Something went wrong.");
        return;
      }
      onCreated(name);
      reset();
      onClose();
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onClose={() => (isPending ? null : onClose())}
      title="Add Supplier"
      description="Suppliers can be selected from any purchase order once added."
      className="max-w-lg"
    >
      <div className="space-y-3">
        <Field label="Supplier Name" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Melcom Ghana Ltd" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Contact Person">
            <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} />
          </Field>
          <Field label="Phone">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </Field>
        </div>
        <Field label="Email">
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Category">
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Select category</option>
              {SUPPLIER_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Country">
            <Input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="e.g. Ghana" />
          </Field>
        </div>
        <Field label="Payment Terms">
          <Select value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
            {PAYMENT_TERMS_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </Select>
        </Field>
        <Field label="Address">
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="flex w-full rounded-md border border-ledger-200 bg-white px-3 py-2 text-sm text-ink-900 placeholder:text-ledger-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal/40 focus-visible:border-signal dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
          />
        </Field>

        {error && <p className="text-sm text-alert">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" size="md" onClick={() => { reset(); onClose(); }} disabled={isPending}>Cancel</Button>
          <Button variant="primary" size="md" onClick={submit} disabled={isPending}>
            {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Add Supplier
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-ledger-500">
        {label} {required && <span className="text-alert">*</span>}
      </span>
      {children}
    </label>
  );
}