"use client";

import { useState, useTransition } from "react";
import { Save, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { saveGeneralSettings, resetGeneralSettings, type GeneralSettingsRow } from "@/app/(dashboard)/settings/general/actions";

const TIMEZONES = [
  "UTC",
  "Africa/Accra",
  "Africa/Lagos",
  "Africa/Nairobi",
  "Africa/Johannesburg",
  "Africa/Cairo",
  "Europe/London",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Kolkata",
];

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "French" },
  { code: "sw", label: "Swahili" },
  { code: "ar", label: "Arabic" },
  { code: "pt", label: "Portuguese" },
];

const DATE_FORMATS = ["MMM DD, YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD", "DD-MM-YYYY"];

const LANDING_PAGES = [
  { value: "/dashboard", label: "Dashboard" },
  { value: "/sales", label: "Sales" },
  { value: "/pos", label: "POS" },
  { value: "/inventory", label: "Inventory" },
  { value: "/reports", label: "Reports" },
];

const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${checked ? "bg-signal" : "bg-ledger-200 dark:bg-white/[0.1]"}`}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
    </button>
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
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-ledger-100 p-3 dark:border-ledger-700">
      <div>
        <p className="text-sm font-medium text-ink-900 dark:text-white">{label}</p>
        <p className="text-xs text-ledger-400">{description}</p>
      </div>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

export function GeneralSettingsForm({
  businessName,
  currentCurrency,
  settings,
  multiCurrencyEnabled,
  canManage,
}: {
  businessName: string;
  currentCurrency: string;
  settings: GeneralSettingsRow | null;
  multiCurrencyEnabled: boolean;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [name, setName] = useState(businessName);
  const [shortName, setShortName] = useState(settings?.business_short_name ?? "");
  const [currency, setCurrency] = useState(currentCurrency);
  const [language, setLanguage] = useState(settings?.default_language ?? "en");
  const [timezone, setTimezone] = useState(settings?.timezone ?? "UTC");
  const [dateFormat, setDateFormat] = useState(settings?.date_format ?? "MMM DD, YYYY");
  const [timeFormat, setTimeFormat] = useState<"12h" | "24h">(settings?.time_format ?? "12h");
  const [fyMonth, setFyMonth] = useState((settings?.financial_year_start ?? "01-01").split("-")[0]);
  const [fyDay, setFyDay] = useState((settings?.financial_year_start ?? "01-01").split("-")[1]);
  const [taxRate, setTaxRate] = useState(String(settings?.default_tax_rate ?? 0));
  const [multiCurrency, setMultiCurrency] = useState(multiCurrencyEnabled);
  const [barcodeScanning, setBarcodeScanning] = useState(settings?.enable_barcode_scanning ?? false);
  const [notifications, setNotifications] = useState(settings?.enable_notifications ?? true);
  const [emailAlerts, setEmailAlerts] = useState(settings?.enable_email_alerts ?? true);
  const [sessionTimeout, setSessionTimeout] = useState(String(settings?.session_timeout_minutes ?? 30));
  const [autoLogout, setAutoLogout] = useState(String(settings?.auto_logout_minutes ?? 30));
  const [landingPage, setLandingPage] = useState(settings?.default_landing_page ?? "/dashboard");

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await saveGeneralSettings({
        businessName: name,
        businessShortName: shortName,
        defaultCurrency: currency,
        defaultLanguage: language,
        timezone,
        dateFormat,
        timeFormat,
        financialYearStart: `${fyMonth}-${fyDay}`,
        defaultTaxRate: Number(taxRate),
        enableMultiCurrency: multiCurrency,
        enableBarcodeScanning: barcodeScanning,
        enableNotifications: notifications,
        enableEmailAlerts: emailAlerts,
        sessionTimeoutMinutes: Number(sessionTimeout),
        autoLogoutMinutes: Number(autoLogout),
        defaultLandingPage: landingPage,
      });
      if (result?.error) setError(result.error);
      else setSaved(true);
    });
  }

  function handleReset() {
    if (!confirm("Reset general settings to their defaults? Business name and currency are not affected.")) return;
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const result = await resetGeneralSettings();
      if (result?.error) return setError(result.error);
      setShortName("");
      setLanguage("en");
      setTimezone("UTC");
      setDateFormat("MMM DD, YYYY");
      setTimeFormat("12h");
      setFyMonth("01");
      setFyDay("01");
      setTaxRate("0");
      setBarcodeScanning(false);
      setNotifications(true);
      setEmailAlerts(true);
      setSessionTimeout("30");
      setAutoLogout("30");
      setLandingPage("/dashboard");
      setSaved(true);
    });
  }

  const cardClass =
    "rounded-card border border-ledger-100 bg-white p-5 shadow-card transition-shadow hover:shadow-card-hover dark:border-ledger-700 dark:bg-ink-900";
  const selectClass =
    "h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm disabled:opacity-60 dark:border-ledger-700 dark:bg-ink-900 dark:text-white";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-ledger-400">Settings &gt; General Settings</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">General Settings</h1>
          <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage your business preferences and system configurations.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset} disabled={isPending}>
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to Default
            </Button>
            <Button onClick={handleSave} disabled={isPending}>
              <Save className="h-3.5 w-3.5" />
              {isPending ? "Saving…" : "Save Settings"}
            </Button>
          </div>
        )}
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button type="button" onClick={() => setError(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}
      {saved && <p className="rounded-md bg-signal-soft px-3 py-2 text-sm text-signal">Settings saved.</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Business identity</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">
                Business name <span className="text-alert">*</span>
              </label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!canManage} required />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Business short name</label>
              <Input value={shortName} onChange={(e) => setShortName(e.target.value)} disabled={!canManage} placeholder="e.g. TSP" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Default currency</label>
              <select value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={!canManage} className={selectClass}>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Default language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!canManage} className={selectClass}>
                {LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Regional &amp; formatting</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Time zone</label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!canManage} className={selectClass}>
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Date format</label>
              <select value={dateFormat} onChange={(e) => setDateFormat(e.target.value)} disabled={!canManage} className={selectClass}>
                {DATE_FORMATS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Time format</label>
              <select value={timeFormat} onChange={(e) => setTimeFormat(e.target.value as "12h" | "24h")} disabled={!canManage} className={selectClass}>
                <option value="12h">12-hour</option>
                <option value="24h">24-hour</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Financial year start — month</label>
              <select value={fyMonth} onChange={(e) => setFyMonth(e.target.value)} disabled={!canManage} className={selectClass}>
                {MONTHS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Financial year start — day</label>
              <Input
                type="number"
                min={1}
                max={31}
                value={fyDay}
                onChange={(e) => setFyDay(e.target.value.padStart(2, "0"))}
                disabled={!canManage}
              />
            </div>
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Financial defaults</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Default tax rate</label>
              <div className="flex items-center rounded-md border border-ledger-200 dark:border-ledger-700">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.1"
                  value={taxRate}
                  onChange={(e) => setTaxRate(e.target.value)}
                  disabled={!canManage}
                  className="h-10 w-full rounded-l-md border-none bg-white px-3 text-sm disabled:opacity-60 dark:bg-ink-900 dark:text-white"
                />
                <span className="px-3 text-sm text-ledger-400">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Default dashboard landing page</label>
              <select value={landingPage} onChange={(e) => setLandingPage(e.target.value)} disabled={!canManage} className={selectClass}>
                {LANDING_PAGES.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <ToggleRow
              label="Enable multi-currency"
              description="Allow transactions in multiple currencies (managed on Settings > Currencies)"
              checked={multiCurrency}
              onChange={setMultiCurrency}
              disabled={!canManage}
            />
          </div>
        </div>

        <div className={cardClass}>
          <h2 className="text-sm font-semibold text-ink-900 dark:text-white">System &amp; security</h2>
          <div className="mt-4 space-y-3">
            <ToggleRow
              label="Enable barcode scanning"
              description="Allow scanning barcodes in POS and inventory screens"
              checked={barcodeScanning}
              onChange={setBarcodeScanning}
              disabled={!canManage}
            />
            <ToggleRow
              label="Enable notifications"
              description="Receive important alerts and notifications"
              checked={notifications}
              onChange={setNotifications}
              disabled={!canManage}
            />
            <ToggleRow
              label="Enable email alerts"
              description="Send important alerts by email"
              checked={emailAlerts}
              onChange={setEmailAlerts}
              disabled={!canManage}
            />
            <div className="grid grid-cols-1 gap-4 pt-1 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">System session timeout (minutes)</label>
                <Input type="number" min={1} value={sessionTimeout} onChange={(e) => setSessionTimeout(e.target.value)} disabled={!canManage} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Auto logout duration (minutes)</label>
                <Input type="number" min={1} value={autoLogout} onChange={(e) => setAutoLogout(e.target.value)} disabled={!canManage} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}