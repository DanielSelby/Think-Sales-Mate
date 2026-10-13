import { Card, CardContent } from "@/components/ui/card";

export default function PosSalesListLoading() {
  return (
    <main className="mx-auto max-w-[1600px] space-y-6 pb-10" aria-label="Loading POS sales">
      <div className="space-y-2">
        <div className="h-3 w-28 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
        <div className="h-8 w-56 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
      </div>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Card key={index}><CardContent className="space-y-3 p-5">
            <div className="h-3 w-36 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
            <div className="h-7 w-28 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
            <div className="h-3 w-44 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
          </CardContent></Card>
        ))}
      </section>
      <Card><CardContent className="space-y-3 p-5">
        <div className="h-10 animate-pulse rounded bg-ledger-100 dark:bg-ink-800" />
        <div className="h-72 animate-pulse rounded bg-ledger-50 dark:bg-ink-800/60" />
      </CardContent></Card>
    </main>
  );
}
