import { Loader2 } from "lucide-react";

export default function EducationLoading() {
  return (
    <main
      aria-busy="true"
      aria-live="polite"
      className="mx-auto flex min-h-[45vh] w-full max-w-[1500px] items-center justify-center p-6"
    >
      <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-white px-5 py-4 text-sm font-medium text-slate-700 shadow-sm">
        <Loader2 className="h-5 w-5 animate-spin text-blue-700" aria-hidden="true" />
        Loading Think Education…
      </div>
    </main>
  );
}
