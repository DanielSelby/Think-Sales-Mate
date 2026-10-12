export default function AccountLoading() {
  return (
    <main aria-label="Loading account details" className="w-full min-w-0 animate-pulse space-y-5">
      <div className="h-5 w-36 rounded bg-blue-100 dark:bg-slate-700" />
      <div className="h-9 w-64 rounded bg-ledger-100 dark:bg-slate-700" />
      <div className="h-28 rounded-2xl border border-blue-100 bg-blue-50/70 dark:border-slate-700 dark:bg-ink-900" />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.8fr)_minmax(280px,0.9fr)]">
        <div className="h-[420px] rounded-2xl border border-ledger-100 bg-white dark:border-slate-700 dark:bg-ink-900" />
        <div className="space-y-4"><div className="h-48 rounded-2xl border border-ledger-100 bg-white dark:border-slate-700 dark:bg-ink-900" /><div className="h-40 rounded-2xl border border-ledger-100 bg-white dark:border-slate-700 dark:bg-ink-900" /></div>
      </div>
    </main>
  );
}
