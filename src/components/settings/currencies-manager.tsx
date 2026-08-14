"use client";

import { useState, useTransition } from "react";
import { Plus, Pencil, RefreshCw, MoreVertical, Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  createCurrency,
  updateCurrency,
  setDefaultCurrency,
  setBaseCurrency,
  deleteCurrency,
  updateCurrencySettings,
  refreshExchangeRates
} from "@/app/(dashboard)/settings/currencies/actions";

export interface CurrencyRow {
  id: string;
  code: string;
  name: string;
  symbol: string;
  exchangeRate: number;
  isActive: boolean;
  isDefault: boolean;
  isBase: boolean;
  lastUpdatedAt: string;
}

export interface CurrencySettingsData {
  exchangeRateSource: "manual" | "frankfurter";
  rateUpdateFrequency: "manual" | "hourly" | "daily" | "weekly";
  decimalPlaces: number;
  roundingMode: "none" | "nearest_1" | "nearest_5" | "nearest_10" | "nearest_100";
  multiCurrencyEnabled: boolean;
  homeCurrencyDisplay: boolean;
  exchangeRateOnTransaction: boolean;
  revaluationEnabled: boolean;
}

function formatRate(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 });
}

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
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`}
      />
    </button>
  );
}

export function CurrenciesManager({
  currencies,
  settings,
  canManage
}: {
  currencies: CurrencyRow[];
  settings: CurrencySettingsData;
  canManage: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRate, setEditRate] = useState("");
  const [localSettings, setLocalSettings] = useState(settings);

  const baseCurrency = currencies.find((c) => c.isBase);

  function persistSettings(patch: Partial<CurrencySettingsData>) {
    const next = { ...localSettings, ...patch };
    setLocalSettings(next);
    startTransition(async () => {
      const result = await updateCurrencySettings({
        exchangeRateSource: next.exchangeRateSource,
        rateUpdateFrequency: next.rateUpdateFrequency,
        decimalPlaces: next.decimalPlaces,
        roundingMode: next.roundingMode,
        multiCurrencyEnabled: next.multiCurrencyEnabled,
        homeCurrencyDisplay: next.homeCurrencyDisplay,
        exchangeRateOnTransaction: next.exchangeRateOnTransaction,
        revaluationEnabled: next.revaluationEnabled
      });
      if (result?.error) setError(result.error);
    });
  }

  function handleAdd(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createCurrency({
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        symbol: String(formData.get("symbol") ?? ""),
        exchangeRate: Number(formData.get("rate"))
      });
      if (result?.error) setError(result.error);
      else setShowAdd(false);
    });
  }

  function saveRate(id: string) {
    const rate = Number(editRate);
    if (Number.isNaN(rate) || rate <= 0) {
      setError("Enter a valid exchange rate.");
      return;
    }
    startTransition(async () => {
      const result = await updateCurrency(id, { exchangeRate: rate });
      if (result?.error) setError(result.error);
      setEditingId(null);
    });
  }

  function handleRefresh() {
    setError(null);
    startTransition(async () => {
      const result = await refreshExchangeRates();
      if (result?.error) setError(result.error);
    });
  }

  const previewAmountsBase = 58450;
  const previewRows = currencies.filter((c) => c.isActive);

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <p className="text-xs text-ledger-400">Settings &gt; Currencies</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink-900 dark:text-white">Currencies</h1>
        <p className="text-sm text-ledger-500 dark:text-ledger-400">Manage the currencies you use in your business.</p>
      </div>

      {error && (
        <p className="flex items-center justify-between rounded-md bg-alert-soft px-3 py-2 text-sm text-alert">
          {error}
          <button onClick={() => setError(null)} aria-label="Dismiss">
            <X className="h-3.5 w-3.5" />
          </button>
        </p>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Main: currency table */}
        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-card border border-ledger-100 bg-white shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ledger-100 p-5 dark:border-ledger-700">
              <div>
                <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Currencies</h2>
                <p className="text-xs text-ledger-400">{currencies.length} currencies configured</p>
              </div>
              {canManage && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isPending}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh rates
                  </Button>
                  <Button size="sm" onClick={() => setShowAdd((s) => !s)}>
                    <Plus className="h-3.5 w-3.5" />
                    Add currency
                  </Button>
                </div>
              )}
            </div>

            {showAdd && (
              <form action={handleAdd} className="grid grid-cols-2 gap-3 border-b border-ledger-100 p-5 sm:grid-cols-4 dark:border-ledger-700">
                <Input name="code" placeholder="Code (USD)" maxLength={3} required className="uppercase" />
                <Input name="name" placeholder="Name (US Dollar)" required />
                <Input name="symbol" placeholder="Symbol ($)" required />
                <Input name="rate" type="number" step="0.0001" min="0" placeholder="Rate to base" required />
                <div className="col-span-2 flex gap-2 sm:col-span-4">
                  <Button type="submit" size="sm" disabled={isPending}>
                    Save currency
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={() => setShowAdd(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-ledger-100 text-left text-xs font-medium uppercase tracking-wide text-ledger-400 dark:border-ledger-700">
                  <tr>
                    <th className="px-5 py-3">Currency</th>
                    <th className="px-2 py-3">Code</th>
                    <th className="px-2 py-3">Symbol</th>
                    <th className="px-2 py-3">Rate to {baseCurrency?.code ?? "base"}</th>
                    <th className="px-2 py-3">Status</th>
                    <th className="px-2 py-3">Default</th>
                    {canManage && <th className="px-2 py-3 text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {currencies.map((c) => (
                    <tr key={c.id} className="border-b border-ledger-50 last:border-0 dark:border-ledger-700/50">
                      <td className="px-5 py-3">
                        <span className="font-medium text-ink-900 dark:text-white">{c.name}</span>
                        {c.isBase && (
                          <span className="ml-2 rounded-full bg-signal-soft px-2 py-0.5 text-[10px] font-semibold text-signal">
                            Base currency
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3 font-mono text-ledger-600 dark:text-ledger-300">{c.code}</td>
                      <td className="px-2 py-3 text-ledger-600 dark:text-ledger-300">{c.symbol}</td>
                      <td className="px-2 py-3">
                        {editingId === c.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              autoFocus
                              type="number"
                              step="0.0001"
                              value={editRate}
                              onChange={(e) => setEditRate(e.target.value)}
                              className="h-8 w-24 rounded-md border border-ledger-200 bg-white px-2 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                            />
                            <Button size="sm" onClick={() => saveRate(c.id)}>
                              Save
                            </Button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              if (c.isBase || !canManage) return;
                              setEditingId(c.id);
                              setEditRate(String(c.exchangeRate));
                            }}
                            className={`figure ${c.isBase ? "text-ledger-400" : "text-ink-900 hover:underline dark:text-white"}`}
                          >
                            {formatRate(c.exchangeRate)}
                          </button>
                        )}
                        <p className="text-[11px] text-ledger-400">
                          Last updated {new Date(c.lastUpdatedAt).toLocaleString()}
                        </p>
                      </td>
                      <td className="px-2 py-3">
                        {canManage ? (
                          <Toggle
                            checked={c.isActive}
                            disabled={c.isBase}
                            onChange={(v) =>
                              startTransition(async () => {
                                const result = await updateCurrency(c.id, { isActive: v });
                                if (result?.error) setError(result.error);
                              })
                            }
                          />
                        ) : (
                          <span className={c.isActive ? "text-signal" : "text-ledger-400"}>
                            {c.isActive ? "Active" : "Inactive"}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-3">
                        <input
                          type="radio"
                          name="default-currency"
                          checked={c.isDefault}
                          disabled={!canManage}
                          onChange={() =>
                            startTransition(async () => {
                              const result = await setDefaultCurrency(c.id);
                              if (result?.error) setError(result.error);
                            })
                          }
                          className="h-4 w-4 accent-signal"
                        />
                      </td>
                      {canManage && (
                        <td className="px-2 py-3 text-right">
                          <div className="relative inline-block">
                            <button
                              onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)}
                              className="rounded-md p-1.5 text-ledger-400 hover:bg-ledger-100 dark:hover:bg-white/[0.06]"
                            >
                              <MoreVertical className="h-4 w-4" />
                            </button>
                            {openMenuId === c.id && (
                              <div className="absolute right-0 top-8 z-10 w-44 rounded-md border border-ledger-100 bg-white py-1 shadow-card-hover dark:border-ledger-700 dark:bg-ink-900">
                                {!c.isBase && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      startTransition(async () => {
                                        const result = await setBaseCurrency(c.id);
                                        if (result?.error) setError(result.error);
                                      });
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs text-ledger-600 hover:bg-ledger-50 dark:text-ledger-300 dark:hover:bg-white/[0.06]"
                                  >
                                    Make base currency
                                  </button>
                                )}
                                {!c.isBase && (
                                  <button
                                    onClick={() => {
                                      setOpenMenuId(null);
                                      if (!confirm(`Remove ${c.name}?`)) return;
                                      startTransition(async () => {
                                        const result = await deleteCurrency(c.id);
                                        if (result?.error) setError(result.error);
                                      });
                                    }}
                                    className="block w-full px-3 py-2 text-left text-xs text-alert hover:bg-alert-soft"
                                  >
                                    Remove
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Multi-currency settings */}
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h2 className="text-sm font-semibold text-ink-900 dark:text-white">Multi-currency settings</h2>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <SettingToggle
                label="Enable multi-currency"
                description="Allow transactions in multiple currencies"
                checked={localSettings.multiCurrencyEnabled}
                onChange={(v) => persistSettings({ multiCurrencyEnabled: v })}
                disabled={!canManage}
              />
              <SettingToggle
                label="Home currency display"
                description={`Show amounts in home currency (${baseCurrency?.code ?? "—"})`}
                checked={localSettings.homeCurrencyDisplay}
                onChange={(v) => persistSettings({ homeCurrencyDisplay: v })}
                disabled={!canManage}
              />
              <SettingToggle
                label="Exchange rate on transactions"
                description="Use exchange rate at transaction date"
                checked={localSettings.exchangeRateOnTransaction}
                onChange={(v) => persistSettings({ exchangeRateOnTransaction: v })}
                disabled={!canManage}
              />
              <SettingToggle
                label="Revaluation of balances"
                description="Revalue foreign currency balances"
                checked={localSettings.revaluationEnabled}
                onChange={(v) => persistSettings({ revaluationEnabled: v })}
                disabled={!canManage}
              />
            </div>

            <div className="mt-5 grid grid-cols-1 gap-4 border-t border-ledger-100 pt-5 sm:grid-cols-3 dark:border-ledger-700">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Decimal places</label>
                <select
                  value={localSettings.decimalPlaces}
                  disabled={!canManage}
                  onChange={(e) => persistSettings({ decimalPlaces: Number(e.target.value) })}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  {[0, 1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Rounding rule</label>
                <select
                  value={localSettings.roundingMode}
                  disabled={!canManage}
                  onChange={(e) => persistSettings({ roundingMode: e.target.value as CurrencySettingsData["roundingMode"] })}
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="none">No rounding</option>
                  <option value="nearest_1">Nearest 1</option>
                  <option value="nearest_5">Nearest 5</option>
                  <option value="nearest_10">Nearest 10</option>
                  <option value="nearest_100">Nearest 100</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Rate update frequency</label>
                <select
                  value={localSettings.rateUpdateFrequency}
                  disabled={!canManage}
                  onChange={(e) =>
                    persistSettings({ rateUpdateFrequency: e.target.value as CurrencySettingsData["rateUpdateFrequency"] })
                  }
                  className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
                >
                  <option value="manual">Manual only</option>
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-5">
          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Currency settings</h3>
            <div className="mt-3 space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Base currency</label>
              <div className="flex h-10 items-center rounded-md border border-ledger-200 bg-ledger-50 px-3 text-sm text-ledger-600 dark:border-ledger-700 dark:bg-white/[0.03] dark:text-ledger-300">
                {baseCurrency ? `${baseCurrency.name} (${baseCurrency.code})` : "Not set"}
              </div>
              <p className="text-[11px] text-ledger-400">All exchange rates are relative to the base currency.</p>
            </div>

            <div className="mt-4 space-y-1.5">
              <label className="text-xs font-medium text-ledger-500 dark:text-ledger-400">Exchange rate source</label>
              <select
                value={localSettings.exchangeRateSource}
                disabled={!canManage}
                onChange={(e) =>
                  persistSettings({ exchangeRateSource: e.target.value as CurrencySettingsData["exchangeRateSource"] })
                }
                className="h-10 w-full rounded-md border border-ledger-200 bg-white px-3 text-sm dark:border-ledger-700 dark:bg-ink-900 dark:text-white"
              >
                <option value="manual">Manual entry</option>
                <option value="frankfurter">Frankfurter.app (free, ECB rates)</option>
              </select>
              {localSettings.exchangeRateSource === "frankfurter" && (
                <p className="flex items-start gap-1 text-[11px] text-ledger-400">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Rates update daily on the European Central Bank's schedule — not real-time.
                </p>
              )}
            </div>

            <div className="mt-4 rounded-md bg-ledger-50 px-3 py-2 text-xs text-ledger-500 dark:bg-white/[0.04] dark:text-ledger-400">
              Last updated{" "}
              {currencies.length > 0
                ? new Date(Math.max(...currencies.map((c) => new Date(c.lastUpdatedAt).getTime()))).toLocaleString()
                : "—"}
            </div>
            <Button size="sm" className="mt-2 w-full" onClick={handleRefresh} disabled={isPending || !canManage}>
              <RefreshCw className="h-3.5 w-3.5" />
              Update now
            </Button>
          </div>

          <div className="rounded-card border border-ledger-100 bg-white p-5 shadow-card dark:border-ledger-700 dark:bg-ink-900">
            <h3 className="text-sm font-semibold text-ink-900 dark:text-white">Currency preview</h3>
            <div className="mt-3 overflow-hidden rounded-md border border-ledger-100 dark:border-ledger-700">
              <div className="border-b border-ledger-100 bg-ledger-50 px-3 py-2 text-xs font-medium text-ledger-500 dark:border-ledger-700 dark:bg-white/[0.03] dark:text-ledger-400">
                Sample: {formatRate(previewAmountsBase)} {baseCurrency?.code}
              </div>
              <ul className="divide-y divide-ledger-100 dark:divide-ledger-700/50">
                {previewRows.map((c) => (
                  <li
                    key={c.id}
                    className={`flex items-center justify-between px-3 py-2 text-xs ${c.isDefault ? "bg-signal-soft/40" : ""}`}
                  >
                    <span className="text-ledger-500 dark:text-ledger-400">Amount ({c.code})</span>
                    <span className="figure font-medium text-ink-900 dark:text-white">
                      {c.symbol}
                      {formatRate(c.isBase ? previewAmountsBase : previewAmountsBase * c.exchangeRate)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <p className="mt-2 text-[11px] text-ledger-400">Rates are for reference only.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled
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