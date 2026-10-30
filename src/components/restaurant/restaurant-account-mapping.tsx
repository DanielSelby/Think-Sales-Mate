"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { saveRestaurantAccountMappings } from "@/app/(dashboard)/accounting/actions";
import type { AccountingAccount } from "@/types/accounting";
import type { BankAccountItem } from "@/types/accounting";

export type RestaurantAccountMapping = {
  cash_account_id: string | null;
  card_account_id: string | null;
  mobile_money_account_id: string | null;
  other_account_id: string | null;
  sales_revenue_account_id: string | null;
  refunds_account_id: string | null;
  tips_liability_account_id: string | null;
  ingredient_inventory_account_id: string | null;
  ingredient_payable_account_id: string | null;
  ingredient_payment_account_id: string | null;
  cash_bank_account_id: string | null;
  card_bank_account_id: string | null;
  mobile_money_bank_account_id: string | null;
  other_bank_account_id: string | null;
};

const fields = [
  ["cashAccountId", "Cash tender", "asset", "cash_account_id"],
  ["cardAccountId", "Card tender", "asset", "card_account_id"],
  ["mobileMoneyAccountId", "Mobile money tender", "asset", "mobile_money_account_id"],
  ["otherAccountId", "Other tender", "asset", "other_account_id"],
  ["salesRevenueAccountId", "Restaurant sales", "revenue", "sales_revenue_account_id"],
  ["refundsAccountId", "Restaurant refunds", "revenue", "refunds_account_id"],
  ["tipsLiabilityAccountId", "Tips payable", "liability", "tips_liability_account_id"],
] as const;

export function RestaurantAccountMappingPanel({
  accounts,
  mapping,
  canEdit,
  bankAccounts,
  canEditBankMappings,
}: {
  accounts: AccountingAccount[];
  mapping: RestaurantAccountMapping | null;
  canEdit: boolean;
  bankAccounts: BankAccountItem[];
  canEditBankMappings: boolean;
}) {
  const [values, setValues] = useState({
    cashAccountId: mapping?.cash_account_id ?? "",
    cardAccountId: mapping?.card_account_id ?? "",
    mobileMoneyAccountId: mapping?.mobile_money_account_id ?? "",
    otherAccountId: mapping?.other_account_id ?? "",
    salesRevenueAccountId: mapping?.sales_revenue_account_id ?? "",
    refundsAccountId: mapping?.refunds_account_id ?? "",
    tipsLiabilityAccountId: mapping?.tips_liability_account_id ?? "",
    ingredientInventoryAccountId: mapping?.ingredient_inventory_account_id ?? "",
    ingredientPayableAccountId: mapping?.ingredient_payable_account_id ?? "",
    ingredientPaymentAccountId: mapping?.ingredient_payment_account_id ?? "",
    cashBankAccountId: mapping?.cash_bank_account_id ?? "",
    cardBankAccountId: mapping?.card_bank_account_id ?? "",
    mobileMoneyBankAccountId: mapping?.mobile_money_bank_account_id ?? "",
    otherBankAccountId: mapping?.other_bank_account_id ?? "",
  });
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const isComplete = fields.every(([key]) => Boolean(values[key]));

  function save() {
    setMessage("");
    startTransition(async () => {
      const result = await saveRestaurantAccountMappings(values);
      setMessage(result.ok ? "Restaurant account mappings saved." : result.error ?? "Could not save mappings.");
    });
  }

  return <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-ink-900">
    <div>
      <h2 className="font-bold text-slate-900 dark:text-white">Restaurant General Ledger mappings</h2>
      <p className="mt-1 text-xs text-slate-500">When configured, new Restaurant payments and refunds post balanced journals. Existing payments are not backfilled. Use organization-wide accounts. There are no separate tax or processor-fee lines; amounts post to the selected sales and tender accounts.</p>
    </div>
    <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Restaurant ingredient purchasing</h3>
      <p className="mt-1 text-xs text-slate-500">Optional. Configure inventory and payable accounts to post received purchases, and a payment account to record settlements. Restaurant ingredient stock remains separate from ERP product inventory.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {([
          ["ingredientInventoryAccountId", "Ingredient inventory", "asset"],
          ["ingredientPayableAccountId", "Ingredient supplier payable", "liability"],
        ] as const).map(([key, label, type]) => <label key={key} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
          <select
            disabled={!canEdit || isPending}
            value={values[key]}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-ink-800 dark:text-white"
          >
            <option value="">Not configured</option>
            {accounts.filter((account) => account.type === type && account.status === "active" && account.branch === "All Locations")
              .map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
          </select>
        </label>)}
      </div>
      <label className="mt-3 block max-w-xl text-xs font-semibold text-slate-700 dark:text-slate-300">
        Supplier payment account
        <select
          disabled={!canEdit || isPending}
          value={values.ingredientPaymentAccountId}
          onChange={(event) => setValues((current) => ({ ...current, ingredientPaymentAccountId: event.target.value }))}
          className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-ink-800 dark:text-white"
        >
          <option value="">Not configured</option>
          {accounts.filter((account) => account.type === "asset" && account.status === "active" && account.branch === "All Locations")
            .map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
        </select>
      </label>
    </div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {fields.map(([key, label, type]) => {
        const options = accounts.filter((account) => account.type === type && account.status === "active" && account.branch === "All Locations");
        return <label key={key} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
          <select
            disabled={!canEdit || isPending}
            value={values[key]}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-ink-800 dark:text-white"
          >
            <option value="">Select account</option>
            {options.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
          </select>
        </label>;
      })}
    </div>
    {canEditBankMappings && <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700">
      <h3 className="text-sm font-bold text-slate-900 dark:text-white">Bank Accounts balance tracking</h3>
      <p className="mt-1 text-xs text-slate-500">Each mapped payment creates a deposit; refunds create a withdrawal and are rejected if the mapped balance is insufficient. Leave a tender unassigned to keep it out of Bank Accounts.</p>
      <Link href="/banking" className="mt-2 inline-block text-xs font-semibold text-blue-600">Manage Bank Accounts</Link>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ["cashBankAccountId", "Cash till"],
          ["cardBankAccountId", "Card settlement"],
          ["mobileMoneyBankAccountId", "Mobile money"],
          ["otherBankAccountId", "Other tender"],
        ] as const).map(([key, label]) => <label key={key} className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {label}
          <select
            disabled={!canEdit || isPending}
            value={values[key]}
            onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
            className="mt-1 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-600 dark:bg-ink-800 dark:text-white"
          >
            <option value="">Do not track in Bank Accounts</option>
            {bankAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
          </select>
        </label>)}
      </div>
    </div>}
    {!canEditBankMappings && (mapping?.cash_bank_account_id || mapping?.card_bank_account_id || mapping?.mobile_money_bank_account_id || mapping?.other_bank_account_id)
      && <p className="mt-3 text-xs text-slate-500">Bank Account tracking is configured; only users with Bank Accounts edit access can change those mappings.</p>}
    {canEdit && <div className="mt-3 flex flex-wrap items-center gap-3">
      <button type="button" disabled={isPending || !isComplete} onClick={save} className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-slate-900">
        {isPending ? "Saving..." : "Save mappings"}
      </button>
      <span role="status" className="text-xs text-slate-500">{message}</span>
    </div>}
    {!canEdit && <p className="mt-3 text-xs text-slate-500">You can view mappings but cannot change them.</p>}
  </section>;
}
