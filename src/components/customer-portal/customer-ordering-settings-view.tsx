"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ACCOUNT_REQUIREMENT_LABEL, ACCOUNT_REQUIREMENT_DESCRIPTION } from "@/lib/customer-portal/format";
import { updatePortalSettings, type PortalSettings } from "@/app/(dashboard)/settings/customer-ordering/actions";
import type { CustomerAccountRequirement } from "@/types/database";

interface SettingsViewProps {
  initial: PortalSettings;
  portalUrl: string;
}

const ACCOUNT_OPTIONS: CustomerAccountRequirement[] = ["optional", "required", "guest_only"];

export function CustomerOrderingSettingsView({ initial, portalUrl }: SettingsViewProps) {
  const router = useRouter();
  const [settings, setSettings] = React.useState<PortalSettings>(initial);
  const [isPending, startTransition] = React.useTransition();
  const [notice, setNotice] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  function patch<K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  function save() {
    startTransition(async () => {
      const result = await updatePortalSettings(settings);
      if (!result.ok) {
        setNotice(result.error ?? "Something went wrong.");
        return;
      }
      setNotice("Settings saved");
      setTimeout(() => setNotice(null), 3000);
      router.refresh();
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-900 dark:text-white">Customer Ordering Settings</h1>
          <p className="mt-0.5 text-sm text-ledger-500 dark:text-ledger-400">Manage how customers can place orders and view prices.</p>
        </div>
        <Button variant="primary" size="md" onClick={save} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Changes
        </Button>
      </div>

      {notice && (
        <div className="rounded-md border border-signal/30 bg-signal-soft px-4 py-2.5 text-sm text-ink-900 dark:bg-signal/10 dark:text-white">{notice}</div>
      )}

      <Card accent="neutral">
        <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Storefront Link</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-2 rounded-md border border-ledger-100 bg-ledger-50/60 px-3 py-2 dark:border-ledger-700 dark:bg-white/[0.03]">
            <code className="flex-1 truncate text-sm text-ledger-600 dark:text-ledger-300">{portalUrl}</code>
            <button onClick={copyUrl} className="flex items-center gap-1 rounded-md border border-ledger-200 px-2 py-1 text-xs text-ledger-500 hover:bg-ledger-100 dark:border-ledger-700">
              {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          {!settings.isEnabled && <p className="mt-2 text-xs text-alert">Customer ordering is currently disabled — this link won&apos;t accept orders until you enable it below.</p>}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* General settings */}
        <Card accent="neutral">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">General Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Enable Customer Ordering"
              description="Allow customers to place orders through the customer ordering portal."
              checked={settings.isEnabled}
              onChange={(v) => patch("isEnabled", v)}
            />
            <ToggleRow
              label="Require Approval Before Processing"
              description="Orders must be reviewed and approved before processing. This can't be turned off — every order stays Pending until a staff member reviews it, regardless of this toggle."
              checked={settings.requireApprovalBeforeProcessing}
              onChange={(v) => patch("requireApprovalBeforeProcessing", v)}
              disabled
            />
            <ToggleRow
              label="Allow Customers to Select Delivery"
              description="Customers can choose their preferred delivery option."
              checked={settings.allowCustomerSelectDelivery}
              onChange={(v) => patch("allowCustomerSelectDelivery", v)}
            />
            <ToggleRow
              label="Allow Order Notes"
              description="Customers can add notes to their orders."
              checked={settings.allowOrderNotes}
              onChange={(v) => patch("allowOrderNotes", v)}
            />
          </CardContent>
        </Card>

        {/* Account requirement */}
        <Card accent="neutral">
          <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Account Requirement</CardTitle></CardHeader>
          <CardContent className="space-y-2 pt-0">
            {ACCOUNT_OPTIONS.map((opt) => (
              <button
                key={opt}
                onClick={() => patch("accountRequirement", opt)}
                className={cn(
                  "flex w-full items-start gap-3 rounded-md border p-3 text-left",
                  settings.accountRequirement === opt ? "border-signal bg-signal-soft dark:bg-signal/10" : "border-ledger-100 dark:border-ledger-700"
                )}
              >
                <span className={cn("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2", settings.accountRequirement === opt ? "border-signal" : "border-ledger-300")}>
                  {settings.accountRequirement === opt && <span className="h-2 w-2 rounded-full bg-signal" />}
                </span>
                <span>
                  <span className="block text-sm font-medium text-ink-900 dark:text-white">{ACCOUNT_REQUIREMENT_LABEL[opt]}{opt === "optional" && " (Recommended)"}</span>
                  <span className="block text-xs text-ledger-400">{ACCOUNT_REQUIREMENT_DESCRIPTION[opt]}</span>
                </span>
              </button>
            ))}
            <div className="mt-3 space-y-3 border-t border-ledger-100 pt-3 dark:border-ledger-700">
              <ToggleRow
                label="Allow customers to view order status"
                checked={settings.allowViewOrderStatus}
                onChange={(v) => patch("allowViewOrderStatus", v)}
              />
              <ToggleRow
                label="Allow customers to create account"
                checked={settings.allowCreateAccount}
                onChange={(v) => patch("allowCreateAccount", v)}
              />
              <ToggleRow
                label="Require email verification for new accounts"
                description="Not implemented yet — enabling this stores the preference but no verification email is sent."
                checked={settings.requireEmailVerification}
                onChange={(v) => patch("requireEmailVerification", v)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Price visibility */}
      <Card accent="amber">
        <CardHeader className="pb-2"><CardTitle className="normal-case tracking-normal text-[13px] font-semibold text-ink-900 dark:text-white">Price Visibility</CardTitle></CardHeader>
        <CardContent className="pt-0">
          <ToggleRow
            label="Show Prices to Customers"
            description="When off, customers can browse and order products without seeing prices — a staff member sets the final price when reviewing the order."
            checked={settings.showPricesToCustomers}
            onChange={(v) => patch("showPricesToCustomers", v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function ToggleRow({ label, description, checked, onChange, disabled }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <p className="text-sm font-medium text-ink-900 dark:text-white">{label}</p>
        {description && <p className="mt-0.5 text-xs text-ledger-400">{description}</p>}
      </div>
      <button
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn("relative h-5 w-9 shrink-0 rounded-full transition-colors", checked ? "bg-signal" : "bg-ledger-200 dark:bg-ledger-700", disabled && "opacity-60")}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform", checked ? "translate-x-4" : "translate-x-0.5")} />
      </button>
    </div>
  );
}