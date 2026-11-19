"use client";

import { useState } from "react";
import { createEducationClass } from "../actions";

type CampusOption = { id: string; name: string };
type AcademicYearOption = { id: string; name: string };
type TeacherOption = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
};

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";

export function EducationClassForm({
  campuses,
  academicYears,
  teachers,
  canViewStaff,
}: {
  campuses: CampusOption[];
  academicYears: AcademicYearOption[];
  teachers: TeacherOption[];
  canViewStaff: boolean;
}) {
  const [branchId, setBranchId] = useState(campuses[0]?.id ?? "");
  const campusTeachers = teachers.filter((teacher) => teacher.branch_id === branchId);

  return (
    <form action={createEducationClass} className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700">Campus
        <select required name="branch_id" value={branchId} onChange={(event) => setBranchId(event.target.value)} className={fieldClass}>
          {campuses.map((campus) => <option key={campus.id} value={campus.id}>{campus.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Academic year
        <select required name="academic_year_id" className={fieldClass}>
          {academicYears.map((year) => <option key={year.id} value={year.id}>{year.name}</option>)}
        </select>
      </label>
      <label className="text-sm font-medium text-slate-700">Class name
        <input required name="name" maxLength={100} placeholder="Grade 1" className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Level
        <input name="level_name" maxLength={80} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Stream
        <input name="stream_name" maxLength={80} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Capacity
        <input name="capacity" type="number" min={1} step={1} className={fieldClass} />
      </label>
      {canViewStaff && <label className="text-sm font-medium text-slate-700">Class teacher (optional)
        <select name="class_teacher_id" defaultValue="" className={fieldClass}>
          <option value="">Unassigned</option>
          {campusTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>
          ))}
        </select>
        {campusTeachers.length === 0 && <span className="mt-1 block text-xs font-normal text-slate-500">No active teaching staff are available at this campus.</span>}
      </label>}
      <div className="sm:col-span-2">
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          Save class
        </button>
      </div>
    </form>
  );
}
