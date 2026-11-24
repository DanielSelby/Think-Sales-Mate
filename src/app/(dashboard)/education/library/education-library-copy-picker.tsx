"use client";

import { useEffect, useState } from "react";

type AvailableCopy = { value: string; label: string };

export function EducationLibraryCopyPicker({ branchId }: { branchId: string }) {
  const [search, setSearch] = useState("");
  const [copies, setCopies] = useState<AvailableCopy[]>([]);
  const [selectedCopy, setSelectedCopy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const query = search.trim();
    if (query.length < 2) {
      setCopies([]);
      setSelectedCopy("");
      setError("");
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ search: query });
      if (branchId) params.set("branch", branchId);
      try {
        const response = await fetch(`/api/education/library/available-copies?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const result = await response.json() as { copies?: AvailableCopy[]; error?: string };
        if (!response.ok) throw new Error(result.error || "Could not search available copies.");
        setCopies(result.copies ?? []);
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") return;
        setCopies([]);
        setError(requestError instanceof Error ? requestError.message : "Could not search available copies.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);

    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [branchId, search]);

  return <div className="space-y-2">
    <label className="block text-sm font-medium text-slate-700" htmlFor="library-copy-search">Find an available copy
      <input
        id="library-copy-search"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setSelectedCopy("");
          setCopies([]);
        }}
        autoComplete="off"
        placeholder="Search title, author, ISBN, or category"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
      />
    </label>
    <select
      required
      name="copy_ref"
      value={selectedCopy}
      onChange={(event) => setSelectedCopy(event.target.value)}
      className="w-full rounded-lg border border-slate-300 px-3 py-2 font-normal disabled:bg-slate-50"
    >
      <option value="" disabled>{loading ? "Searching..." : "Select a matching copy"}</option>
      {copies.map((copy) => <option key={copy.value} value={copy.value}>{copy.label}</option>)}
    </select>
    {error && <p role="alert" className="text-xs text-rose-700">{error}</p>}
    {!loading && !error && search.trim().length >= 2 && copies.length === 0 && <p className="text-xs text-slate-500">No available copies match that search.</p>}
    {search.trim().length < 2 && <p className="text-xs text-slate-500">Enter at least two characters to find a copy.</p>}
  </div>;
}
