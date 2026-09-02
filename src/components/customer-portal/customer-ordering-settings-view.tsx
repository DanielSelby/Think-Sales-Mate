"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Copy, Check, MapPin, ShieldCheck, Bell, DollarSign, FileText, CheckCircle2, MessageSquare, Mail } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updatePortalSettings, type PortalSettings } from "@/app/(dashboard)/settings/customer-ordering/actions";

interface SettingsViewProps {
  initial: PortalSettings;
  portalUrl: string;
}

export function CustomerOrderingSettingsView({ initial, portalUrl }: SettingsViewProps) {
  const router = useRouter();
  const [settings, setSettings] = React.useState<PortalSettings>(initial);
  const [isPending, startTransition] = React.useTransition();
  const [notice, setNotice] = React.useState<{ text: string; type: "success" | "error" } | null>(null);
  const [copied, setCopied] = React.useState(false);

  function patch<K extends keyof PortalSettings>(key: K, value: PortalSettings[K]) {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      // Keep accountRequirement synced with Require Customer Account & Allow Guest Orders
      if (key === "requireCustomerAccount" && value === true) {
        next.allowGuestOrders = false;
        next.accountRequirement = "required";
      } else if (key === "allowGuestOrders" && value === true && next.requireCustomerAccount) {
        next.requireCustomerAccount = false;
        next.accountRequirement = "optional";
      }
      return next;
    });
  }

  function save() {
    startTransition(async () => {
      const result = await updatePortalSettings(settings);
      if (!result.ok) {
        setNotice({ text: result.error ?? "Failed to save settings.", type: "error" });
        return;
      }
      setNotice({ text: "Customer ordering settings saved successfully.", type: "success" });
      setTimeout(() => setNotice(null), 3500);
      router.refresh();
    });
  }

  function copyUrl() {
    navigator.clipboard.writeText(portalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="space-y-6 max-w-6xl pb-16">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink-900 dark:text-white">Customer Ordering Settings</h1>
          <p className="mt-1 text-sm text-ledger-500 dark:text-ledger-400">Configure customer storefront checkout, branch assignment workflows, stock rules, and notification channels.</p>
        </div>
        <Button variant="primary" size="md" onClick={save} disabled={isPending} className="shadow-sm">
          {isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Check className="h-4 w-4 mr-1.5" />}
          Save Changes
        </Button>
      </div>

      {notice && (
        <div className={cn(
          "rounded-lg border px-4 py-3 text-sm flex items-center gap-2",
          notice.type === "success" 
            ? "border-signal/30 bg-signal-soft text-ink-900 dark:bg-signal/10 dark:text-white"
            : "border-alert/30 bg-alert-soft text-alert"
        )}>
          {notice.type === "success" ? <CheckCircle2 className="h-4 w-4 text-signal shrink-0" /> : null}
          <span>{notice.text}</span>
        </div>
      )}

      {/* Storefront Link Card */}
      <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
        <CardHeader className="pb-2">
          <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-2">
            Storefront URL
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-lg border border-ledger-100 bg-ledger-50/70 p-2 dark:border-ledger-700 dark:bg-white/[0.03]">
            <code className="flex-1 truncate font-mono text-xs sm:text-sm px-2 text-ledger-700 dark:text-ledger-300 select-all">{portalUrl}</code>
            <div className="flex items-center gap-2">
              <button
                onClick={copyUrl}
                type="button"
                className="flex items-center justify-center gap-1.5 rounded-md bg-white px-3 py-1.5 text-xs font-medium text-ledger-700 shadow-sm border border-ledger-200 hover:bg-ledger-50 dark:bg-ink-800 dark:border-ledger-600 dark:text-ledger-200"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-signal" /> : <Copy className="h-3.5 w-3.5" />}
                {copied ? "Copied Link" : "Copy Link"}
              </button>
              <a
                href={portalUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-md bg-signal px-3 py-1.5 text-xs font-medium text-white hover:bg-signal/90"
              >
                Open Portal
              </a>
            </div>
          </div>
          {!settings.isEnabled && (
            <p className="mt-2.5 text-xs font-medium text-amber-600 dark:text-amber-400">
              Customer ordering is currently disabled. Toggle &quot;Enable Customer Ordering&quot; below to accept orders through this link.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Branch / Location Selection Setting (Key requirement) */}
        <Card accent="signal" className="lg:col-span-2 border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-3">
            <CardTitle className="normal-case tracking-normal text-base font-semibold text-ink-900 dark:text-white flex items-center gap-2">
              <MapPin className="h-5 w-5 text-signal" />
              Branch / Location Assignment
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Allow Customer Location Selection"
              description="Controls whether customers choose a fulfillment branch during checkout or if admin assigns branches manually."
              checked={settings.allowCustomerLocationSelection}
              onChange={(v) => patch("allowCustomerLocationSelection", v)}
            />

            <div className="rounded-lg border border-ledger-100 bg-ledger-50/50 p-4 text-xs dark:border-ledger-700 dark:bg-white/[0.02] space-y-2">
              <p className="font-semibold text-ink-900 dark:text-white text-sm">How branch assignment works:</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                <div className={cn("p-3 rounded-md border", settings.allowCustomerLocationSelection ? "border-signal/50 bg-signal-soft/40 dark:bg-signal/10" : "border-ledger-200 bg-white/70 dark:bg-ink-800/50")}>
                  <p className="font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-signal" />
                    When Enabled:
                  </p>
                  <p className="mt-1 text-ledger-600 dark:text-ledger-300">
                    Customers select a branch (e.g., Main Branch, Kumasi Branch, Takoradi Branch, Tema Branch) at checkout. Order is automatically assigned to that branch and appears in both <strong>Branch Order Queue</strong> and <strong>Admin Order Queue</strong>. Branch staff can immediately process it.
                  </p>
                </div>
                <div className={cn("p-3 rounded-md border", !settings.allowCustomerLocationSelection ? "border-amber-400/50 bg-amber-50 dark:bg-amber-950/20" : "border-ledger-200 bg-white/70 dark:bg-ink-800/50")}>
                  <p className="font-semibold text-ink-900 dark:text-white flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    When Disabled:
                  </p>
                  <p className="mt-1 text-ledger-600 dark:text-ledger-300">
                    Customers cannot select a branch. Orders enter the <strong>Admin Order Queue as Unassigned</strong>. An Admin reviews the order and manually assigns a branch. After assignment, it becomes visible to that branch&apos;s queue.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customer Account & Guest Checkout */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-3">
            <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-ledger-500" />
              Customer Accounts &amp; Access
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Enable Customer Ordering"
              description="Master switch to activate or pause the customer ordering storefront."
              checked={settings.isEnabled}
              onChange={(v) => patch("isEnabled", v)}
            />
            <ToggleRow
              label="Use Active Hours"
              description="Automatically open and close this ordering link every day using the schedule below."
              checked={settings.scheduleEnabled}
              onChange={(v) => patch("scheduleEnabled", v)}
            />
            {settings.scheduleEnabled && (
              <div className="grid grid-cols-1 gap-3 rounded-lg border border-ledger-100 bg-ledger-50/50 p-3 dark:border-ledger-700 dark:bg-white/[0.02] sm:grid-cols-3">
                <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
                  Opens at
                  <input
                    type="time"
                    value={settings.activeFrom}
                    onChange={(event) => patch("activeFrom", event.target.value)}
                    className="mt-1 block w-full rounded-md border border-ledger-200 bg-white px-2 py-1.5 text-sm text-ink-900 dark:border-ledger-600 dark:bg-ink-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
                  Closes at
                  <input
                    type="time"
                    value={settings.activeUntil}
                    onChange={(event) => patch("activeUntil", event.target.value)}
                    className="mt-1 block w-full rounded-md border border-ledger-200 bg-white px-2 py-1.5 text-sm text-ink-900 dark:border-ledger-600 dark:bg-ink-800 dark:text-white"
                  />
                </label>
                <label className="text-xs font-medium text-ledger-600 dark:text-ledger-300">
                  Time zone
                  <input
                    type="text"
                    value={settings.scheduleTimezone}
                    onChange={(event) => patch("scheduleTimezone", event.target.value)}
                    placeholder="Africa/Accra"
                    className="mt-1 block w-full rounded-md border border-ledger-200 bg-white px-2 py-1.5 text-sm text-ink-900 dark:border-ledger-600 dark:bg-ink-800 dark:text-white"
                  />
                </label>
                <p className="text-xs text-ledger-500 dark:text-ledger-400 sm:col-span-3">
                  The portal is disabled outside these hours. Use an IANA time zone such as Africa/Accra or America/New_York.
                </p>
              </div>
            )}
            <ToggleRow
              label="Require Customer Account"
              description="Require customers to create or log in to an account before submitting orders."
              checked={settings.requireCustomerAccount}
              onChange={(v) => patch("requireCustomerAccount", v)}
            />
            <ToggleRow
              label="Allow Guest Orders"
              description="Allow visitors to place orders immediately with just their name, phone, and address without an account."
              checked={settings.allowGuestOrders}
              onChange={(v) => patch("allowGuestOrders", v)}
            />
            <ToggleRow
              label="Allow Customers to View Order Status"
              description="Provide customers with a live order tracking URL to monitor review, picking, and delivery stages."
              checked={settings.allowViewOrderStatus}
              onChange={(v) => patch("allowViewOrderStatus", v)}
            />
          </CardContent>
        </Card>

        {/* Order Details & Pricing Controls */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-3">
            <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-ledger-500" />
              Pricing, Notes &amp; Delivery
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Show Prices To Customers"
              description="When disabled, prices are hidden in the storefront. Staff sets or confirms pricing during order review."
              checked={settings.showPricesToCustomers}
              onChange={(v) => patch("showPricesToCustomers", v)}
            />
            <ToggleRow
              label="Allow Customer Notes"
              description="Allow customers to provide custom instructions or delivery notes during checkout."
              checked={settings.allowOrderNotes}
              onChange={(v) => patch("allowOrderNotes", v)}
            />
            <ToggleRow
              label="Allow Customer Delivery Selection"
              description="Let customers choose between Standard Delivery, Express Delivery, or In-store Pickup."
              checked={settings.allowCustomerSelectDelivery}
              onChange={(v) => patch("allowCustomerSelectDelivery", v)}
            />
          </CardContent>
        </Card>

        {/* Inventory & Stock Automation */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-3">
            <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-2">
              <FileText className="h-4 w-4 text-ledger-500" />
              Inventory &amp; Approval Logic
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Auto Reserve Stock On Approval"
              description="When an order is approved, automatically reserve branch inventory and deduct available quantities to prevent overselling."
              checked={settings.autoReserveStockOnApproval}
              onChange={(v) => patch("autoReserveStockOnApproval", v)}
            />
            <ToggleRow
              label="Require Approval Before Processing"
              description="Every incoming customer order enters 'Pending Review' / 'New' status until confirmed by an admin or branch manager."
              checked={settings.requireApprovalBeforeProcessing}
              onChange={(v) => patch("requireApprovalBeforeProcessing", v)}
              disabled
            />
          </CardContent>
        </Card>

        {/* Notification Channels */}
        <Card accent="neutral" className="border-ledger-200/80 dark:border-ledger-700/80">
          <CardHeader className="pb-3">
            <CardTitle className="normal-case tracking-normal text-sm font-semibold text-ink-900 dark:text-white flex items-center gap-2">
              <Bell className="h-4 w-4 text-ledger-500" />
              Notification Channels
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <ToggleRow
              label="Send Email Notifications"
              description="Send automated transactional emails for Order Received, Order Approved, Out for Delivery, and Delivered events."
              checked={settings.sendEmailNotifications}
              onChange={(v) => patch("sendEmailNotifications", v)}
            />
            <ToggleRow
              label="Send WhatsApp Notifications"
              description="Send real-time WhatsApp order tracking updates and notifications to customer phone numbers."
              checked={settings.sendWhatsAppNotifications}
              onChange={(v) => patch("sendWhatsAppNotifications", v)}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink-900 dark:text-white">{label}</p>
        {description && <p className="mt-0.5 text-xs text-ledger-500 dark:text-ledger-400 leading-relaxed">{description}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => !disabled && onChange(!checked)}
        disabled={disabled}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
          checked ? "bg-signal" : "bg-ledger-200 dark:bg-ledger-700",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <span
          className={cn(
            "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition duration-200 ease-in-out",
            checked ? "translate-x-5" : "translate-x-0"
          )}
        />
      </button>
    </div>
  );
}