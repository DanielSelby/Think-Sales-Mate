export default function BankingLoading() {
  return (
    <main className="mx-auto max-w-7xl animate-pulse space-y-6" aria-label="Loading bank accounts">
      <div className="flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-48 rounded-lg bg-ledger-100 dark:bg-white/10" />
          <div className="h-4 w-80 max-w-[75vw] rounded-md bg-ledger-100 dark:bg-white/10" />
        </div>
        <div className="h-10 w-40 rounded-lg bg-ledger-100 dark:bg-white/10" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <div key={card} className="h-48 rounded-2xl border border-ledger-100 bg-white dark:border-slate-500 dark:bg-ink-900" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_330px]">
        <div className="h-80 rounded-2xl border border-ledger-100 bg-white dark:border-slate-500 dark:bg-ink-900" />
        <div className="space-y-4">
          <div className="h-48 rounded-2xl border border-ledger-100 bg-white dark:border-slate-500 dark:bg-ink-900" />
          <div className="h-36 rounded-2xl border border-ledger-100 bg-white dark:border-slate-500 dark:bg-ink-900" />
        </div>
      </div>
    </main>
  );
}
