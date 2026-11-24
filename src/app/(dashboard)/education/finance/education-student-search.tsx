"use client";

import { useEffect, useRef, useState } from "react";

type StudentOption = {
  id: string;
  student_number: string;
  first_name: string;
  last_name: string;
};

export function EducationStudentSearch({ branchId }: { branchId: string }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StudentOption | null>(null);
  const [results, setResults] = useState<StudentOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const search = query.trim();
    if (selected || search.length < 2) {
      setResults([]);
      setLoading(false);
      setError("");
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError("");
    const timer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams({ branch: branchId, search });
        const response = await fetch(`/api/education/finance/students?${params}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        const payload = await response.json() as { students?: StudentOption[]; error?: string };
        if (controller.signal.aborted) return;
        if (!response.ok) throw new Error(payload.error || "Could not search for students.");
        setResults(payload.students ?? []);
      } catch (searchError) {
        if (searchError instanceof DOMException && searchError.name === "AbortError") return;
        setError(searchError instanceof Error ? searchError.message : "Could not search for students.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [branchId, query, selected]);

  const selectStudent = (student: StudentOption) => {
    setSelected(student);
    setQuery(`${student.first_name} ${student.last_name} · ${student.student_number}`);
    setResults([]);
    inputRef.current?.setCustomValidity("");
  };

  return (
    <div>
      <input type="hidden" name="student_id" value={selected?.id ?? ""} />
      <input
        ref={inputRef}
        required
        autoComplete="off"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelected(null);
          event.currentTarget.setCustomValidity("Choose a student from the search results.");
        }}
        onInvalid={(event) => {
          if (!selected) event.currentTarget.setCustomValidity("Choose a student from the search results.");
        }}
        placeholder="Search by name or student number"
        aria-label="Search for a student"
        aria-autocomplete="list"
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal"
      />
      {query.trim().length < 2 && !selected && <p className="mt-1 text-xs text-slate-500">Enter at least two characters to search.</p>}
      {loading && <p role="status" className="mt-1 text-xs text-slate-500">Searching students…</p>}
      {error && <p role="alert" className="mt-1 text-xs text-rose-700">{error}</p>}
      {!loading && !error && query.trim().length >= 2 && !selected && results.length === 0 && <p className="mt-1 text-xs text-slate-500">No matching active students.</p>}
      {results.length > 0 && !selected && <ul aria-label="Student search results" className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
        {results.map((student) => <li key={student.id}>
          <button
            type="button"
            className="w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
            onClick={() => selectStudent(student)}
          >
            {student.first_name} {student.last_name} · {student.student_number}
          </button>
        </li>)}
      </ul>}
      {results.length === 25 && !selected && <p className="mt-1 text-xs text-slate-500">Showing the first 25 matches. Add more characters to narrow the results.</p>}
    </div>
  );
}
