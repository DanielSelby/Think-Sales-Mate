

"use client";

import { useState } from "react";
import {
  X,
  IdCard,
  Users,
  Smartphone,
  Phone,
  Mail,
  User,
  ChevronDown,
  Info,
  Banknote,
  MapPin,
  Globe,
  Building2,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
}: {
  open: boolean;
  onClose: () => void;
  onSave: (contact: {
    name: string;
    contactType: "individual" | "business";
    contactId: string | null;
    phone: string;
    alternatePhone: string | null;
    landline: string | null;
    email: string | null;
  }) => Promise<{ ok: boolean; error?: string }>;
}) {

  const [contactType, setContactType] = useState<"individual" | "business">("individual");
  const [contactId, setContactId] = useState("");
  const [customerGroup, setCustomerGroup] = useState("none");

  // Individual
  const [prefix, setPrefix] = useState("");
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");

  // Business
  const [businessName, setBusinessName] = useState("");

  const [mobile, setMobile] = useState("");
  const [alternatePhone, setAlternatePhone] = useState("");
  const [landline, setLandline] = useState("");
  const [email, setEmail] = useState("");
  const [assignedTo, setAssignedTo] = useState("");
  const [more, setMore] = useState(false);

  // "More Information" fields below aren't backed by any column on the
  // customers table yet — captured here but not sent to addCustomer.
  const [taxNumber, setTaxNumber] = useState("");
  const [openingBalance, setOpeningBalance] = useState("0");
  const [payTerm, setPayTerm] = useState("");
  const [payTermUnit, setPayTermUnit] = useState("Please Select");
  const [creditLimit, setCreditLimit] = useState("");
  const [addressLine1, setAddressLine1] = useState("");
  const [addressLine2, setAddressLine2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [customField1, setCustomField1] = useState("");
  const [customField2, setCustomField2] = useState("");
  const [customField3, setCustomField3] = useState("");
  const [customField4, setCustomField4] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  function reset() {
    setContactType("individual");
    setContactId("");
    setCustomerGroup("none");
    setPrefix("");
    setFirstName("");
    setMiddleName("");
    setLastName("");
    setDob("");
    setBusinessName("");
    setMobile("");
    setAlternatePhone("");
    setLandline("");
    setEmail("");
    setAssignedTo("");
    setMore(false);
    setTaxNumber("");
    setOpeningBalance("0");
    setPayTerm("");
    setPayTermUnit("Please Select");
    setCreditLimit("");
    setAddressLine1("");
    setAddressLine2("");
    setCity("");
    setState("");
    setCountry("");
    setZipCode("");
    setCustomField1("");
    setCustomField2("");
    setCustomField3("");
    setCustomField4("");
    setErr(null);
  }

  async function handleSave() {
    const name =
      contactType === "business"
        ? businessName.trim()
        : [prefix.trim(), firstName.trim(), middleName.trim(), lastName.trim()].filter(Boolean).join(" ");

    if (contactType === "business" && !businessName.trim()) {
      setErr("Business Name is required.");
      return;
    }
    if (contactType === "individual" && !firstName.trim()) {
      setErr("First Name is required.");
      return;
    }
    if (!mobile.trim()) {
      setErr("Mobile is required.");
      return;
    }

    setErr(null);
    setSaving(true);
    const result = await onSave({
      name,
      contactType,
      contactId: contactId || null,
      phone: mobile,
      alternatePhone: alternatePhone || null,
      landline: landline || null,
      email: email || null,
    });
    setSaving(false);
    if (!result.ok) {
      setErr(result.error ?? "Couldn't save contact.");
      return;
    }
    reset();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-card bg-white p-6 shadow-card-hover dark:bg-ink-900">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-ink-900 dark:text-white">Add a new contact</h3>
          <button
            type="button"
            onClick={() => {
              onClose();
              reset();
            }}
            className="text-ledger-400 hover:text-ink-900 dark:hover:text-white"
          >
            ✕
          </button>
        </div>

        {err && <p className="mt-3 rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">{err}</p>}

        <div className="mt-5 flex items-center gap-5">
          <label className="flex items-center gap-1.5 text-sm text-ledger-700 dark:text-ledger-300">
            <input type="radio" checked={contactType === "individual"} onChange={() => setContactType("individual")} /> Individual
          </label>
          <label className="flex items-center gap-1.5 text-sm text-ledger-700 dark:text-ledger-300">
            <input type="radio" checked={contactType === "business"} onChange={() => setContactType("business")} /> Business
          </label>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Contact ID:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <IdCard className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
                placeholder="Contact ID"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
            <p className="text-xs text-ledger-400">Leave empty to autogenerate</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Customer Group:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Users className="h-4 w-4 shrink-0 text-ledger-400" />
              <select
                value={customerGroup}
                onChange={(e) => setCustomerGroup(e.target.value)}
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
              >
                <option value="none">None</option>
              </select>
            </div>
          </div>
        </div>

        {contactType === "individual" ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Prefix:</label>
              <Input value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="Mr / Mrs / Miss" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">First Name:*</label>
              <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First Name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Middle name:</label>
              <Input value={middleName} onChange={(e) => setMiddleName(e.target.value)} placeholder="Middle name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Last Name:</label>
              <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last Name" />
            </div>
          </div>
        ) : (
          <div className="mt-4 max-w-sm space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Business Name:*</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Building2 className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Business Name"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Mobile:*</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Smartphone className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="Mobile"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Alternate contact number:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Phone className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={alternatePhone}
                onChange={(e) => setAlternatePhone(e.target.value)}
                placeholder="Alternate contact nur"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Landline:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Phone className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={landline}
                onChange={(e) => setLandline(e.target.value)}
                placeholder="Landline"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Email:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <Mail className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
              />
            </div>
          </div>
        </div>

        {contactType === "individual" ? (
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Date of birth:</label>
              <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                <Calendar className="h-4 w-4 shrink-0 text-ledger-400" />
                <input
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Assigned to:</label>
              <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                <User className="h-4 w-4 shrink-0 text-ledger-400" />
                <input
                  value={assignedTo}
                  onChange={(e) => setAssignedTo(e.target.value)}
                  className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="mt-4 max-w-xs space-y-1.5">
            <label className="text-sm font-semibold text-ink-900 dark:text-white">Assigned to:</label>
            <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
              <User className="h-4 w-4 shrink-0 text-ledger-400" />
              <input
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
              />
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-center border-t border-ledger-100 pt-5 dark:border-ledger-700">
          <button
            type="button"
            onClick={() => setMore((v) => !v)}
            className="flex items-center gap-1.5 rounded-md bg-indigo-500 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-600"
          >
            More Informations <ChevronDown className={cn("h-4 w-4 transition-transform", more && "rotate-180")} />
          </button>
        </div>

        {more && (
          <div className="mt-5 space-y-5 border-t border-ledger-100 pt-5 dark:border-ledger-700">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Tax number:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <Info className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input
                    value={taxNumber}
                    onChange={(e) => setTaxNumber(e.target.value)}
                    placeholder="Tax number"
                    className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Opening Balance:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <Banknote className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input
                    type="number"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="flex items-center gap-1 text-sm font-semibold text-ink-900 dark:text-white">
                  Pay term: <Info className="h-3.5 w-3.5 text-signal" />
                </label>
                <div className="flex gap-2">
                  <input
                    value={payTerm}
                    onChange={(e) => setPayTerm(e.target.value)}
                    placeholder="Pay term"
                    className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  />
                  <select
                    value={payTermUnit}
                    onChange={(e) => setPayTermUnit(e.target.value)}
                    className="h-10 shrink-0 rounded-md border border-ledger-200 bg-white px-2 text-sm text-ink-900 dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                  >
                    <option>Please Select</option>
                    <option>Days</option>
                    <option>Months</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="max-w-xs space-y-1.5">
              <label className="text-sm font-semibold text-ink-900 dark:text-white">Credit Limit:</label>
              <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                <Banknote className="h-4 w-4 shrink-0 text-ledger-400" />
                <input
                  type="number"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none dark:text-white"
                />
              </div>
              <p className="text-xs text-ledger-400">Keep blank for no limit</p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Address line 1:</label>
                <Input value={addressLine1} onChange={(e) => setAddressLine1(e.target.value)} placeholder="Address line 1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Address line 2:</label>
                <Input value={addressLine2} onChange={(e) => setAddressLine2(e.target.value)} placeholder="Address line 2" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">City:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <MapPin className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">State:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <MapPin className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input value={state} onChange={(e) => setState(e.target.value)} placeholder="State" className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Country:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <Globe className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Country" className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Zip Code:</label>
                <div className="flex items-center gap-2 rounded-md border border-ledger-200 px-3 dark:border-ledger-700">
                  <MapPin className="h-4 w-4 shrink-0 text-ledger-400" />
                  <input value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="Zip/Postal Code" className="h-10 w-full border-0 bg-transparent text-sm text-ink-900 outline-none placeholder:text-ledger-400 dark:text-white" />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Custom Field 1:</label>
                <Input value={customField1} onChange={(e) => setCustomField1(e.target.value)} placeholder="Custom Field 1" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Custom Field 2:</label>
                <Input value={customField2} onChange={(e) => setCustomField2(e.target.value)} placeholder="Custom Field 2" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Custom Field 3:</label>
                <Input value={customField3} onChange={(e) => setCustomField3(e.target.value)} placeholder="Custom Field 3" />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-semibold text-ink-900 dark:text-white">Custom Field 4:</label>
                <Input value={customField4} onChange={(e) => setCustomField4(e.target.value)} placeholder="Custom Field 4" />
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2 border-t border-ledger-100 pt-4 dark:border-ledger-700">
          <Button type="button" variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              onClose();
              reset();
            }}
          >
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}