export default function EducationLoading() {
  return (
    <main aria-busy="true" aria-live="polite" className="mx-auto w-full max-w-[1500px] space-y-4 p-3 md:p-5">
      <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((item) => (
          <div key={item} className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-slate-100" />
      <span className="sr-only">Loading Think Education</span>
    </main>
  );
}
