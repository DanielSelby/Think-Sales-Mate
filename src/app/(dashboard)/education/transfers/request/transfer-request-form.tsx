"use client";

import { useMemo, useState } from "react";
import { createEducationStudentTransfer } from "../../actions";

type Campus = { id: string; name: string };
type Student = {
  id: string;
  branch_id: string;
  student_number: string;
  first_name: string;
  last_name: string;
  other_names: string | null;
};

export function TransferRequestForm({
  campuses,
  students,
  today,
}: {
  campuses: Campus[];
  students: Student[];
  today: string;
}) {
  const [sourceBranchId, setSourceBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!sourceBranchId || !query) return [];
    return students.filter((student) => {
      if (student.branch_id !== sourceBranchId) return false;
      const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");
      return `${fullName} ${student.student_number}`.toLocaleLowerCase().includes(query);
    }).slice(0, 20);
  }, [search, sourceBranchId, students]);

  function chooseSource(branchId: string) {
    setSourceBranchId(branchId);
    setSearch("");
    setSelectedStudent(null);
    setIsOpen(false);
  }

  function updateSearch(value: string) {
    setSearch(value);
    setSelectedStudent(null);
    setIsOpen(true);
  }

  function selectStudent(student: Student) {
    setSelectedStudent(student);
    setSearch(`${[student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ")} · ${student.student_number}`);
    setIsOpen(false);
  }

  const inputClassName = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";

  return <form action={createEducationStudentTransfer} className="mt-5 grid gap-4 sm:grid-cols-2">
    <label className="text-sm font-medium text-slate-700">Source campus
      <select required name="source_branch_id" value={sourceBranchId} onChange={(event) => chooseSource(event.target.value)} className={inputClassName}>
        <option value="" disabled>Select source campus</option>
        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select>
    </label>

    <label className="relative text-sm font-medium text-slate-700">
      Student (search by name or number)
      <input
        type="search"
        value={search}
        onChange={(event) => updateSearch(event.target.value)}
        onFocus={() => setIsOpen(true)}
        onBlur={() => window.setTimeout(() => setIsOpen(false), 120)}
        disabled={!sourceBranchId}
        autoComplete="off"
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={isOpen && matches.length > 0}
        aria-controls="transfer-student-options"
        aria-label="Search active students by name or student number"
        placeholder={sourceBranchId ? "Type a name or student number" : "Choose the source campus first"}
        className={inputClassName}
      />
      <input type="hidden" name="student_number" value={selectedStudent?.student_number ?? ""} />
      {isOpen && search.trim() && sourceBranchId && <ul
        id="transfer-student-options"
        role="listbox"
        className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-xl"
      >
        {matches.length ? matches.map((student) => {
          const fullName = [student.first_name, student.other_names, student.last_name].filter(Boolean).join(" ");
          return <li key={student.id} role="option" aria-selected={selectedStudent?.id === student.id}>
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectStudent(student)}
              className="w-full px-3 py-2 text-left hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
            >
              <span className="block text-sm font-medium text-slate-900">{fullName}</span>
              <span className="block text-xs text-slate-500">{student.student_number}</span>
            </button>
          </li>;
        }) : <li className="px-3 py-3 text-sm text-slate-500">No active students found at this campus.</li>}
      </ul>}
      {selectedStudent && <span className="mt-1 block text-xs text-emerald-700">Selected: {selectedStudent.student_number}</span>}
      {!selectedStudent && search.trim() && <span className="mt-1 block text-xs text-slate-500">Choose a student from the results to continue.</span>}
    </label>

    <label className="text-sm font-medium text-slate-700">Effective date
      <input required type="date" name="effective_on" min={today} defaultValue={today} className={inputClassName} />
    </label>
    <label className="text-sm font-medium text-slate-700">Destination campus
      <select required name="destination_branch_id" defaultValue="" className={inputClassName}>
        <option value="" disabled>Select destination campus</option>
        {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
      </select>
    </label>
    <label className="text-sm font-medium text-slate-700 sm:col-span-2">Reason for transfer
      <textarea required name="reason" maxLength={500} rows={3} className={inputClassName} />
    </label>
    <div className="flex justify-end sm:col-span-2">
      <button type="submit" disabled={!selectedStudent} className="rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60">Submit transfer request</button>
    </div>
  </form>;
}
