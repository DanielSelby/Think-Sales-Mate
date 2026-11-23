export default function StudentProfileLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-[1500px] space-y-5 p-4 md:p-6 xl:p-8">
      <div className="h-5 w-24 animate-pulse rounded bg-slate-200" />
      <section className="h-32 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      <nav className="flex gap-2 overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
        {[0, 1, 2, 3, 4, 5].map((item) => (
          <div key={item} className="h-9 w-24 shrink-0 animate-pulse rounded-lg bg-slate-100" />
        ))}
      </nav>
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </section>
      <span className="sr-only">Loading student profile</span>
    </main>
  );
}
