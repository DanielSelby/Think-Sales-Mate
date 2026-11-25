"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { createPortal } from "react-dom";
import { createEducationClass } from "../actions";
import { updateEducationClass } from "./class-actions";

type CampusOption = { id: string; name: string };
type AcademicYearOption = { id: string; name: string };
type TeacherOption = {
  id: string;
  branch_id: string;
  first_name: string;
  last_name: string;
};
type ExistingClass = {
  id: string;
  branch_id: string;
  academic_year_id: string;
  name: string;
  class_code: string | null;
  level_name: string | null;
  stream_name: string | null;
  curriculum_stage: string | null;
  medium: string | null;
  class_teacher_id: string | null;
  capacity: number | null;
  status: string;
};

const fieldClass = "mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-normal";

export function EducationClassModal({
  campuses,
  academicYears,
  teachers,
  canViewStaff,
  classroom,
  trigger,
}: {
  campuses: CampusOption[];
  academicYears: AcademicYearOption[];
  teachers: TeacherOption[];
  canViewStaff: boolean;
  classroom?: ExistingClass;
  trigger?: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen]);

  return <>
    {trigger ? <span className="inline-flex" onClick={() => setIsOpen(true)}>{trigger}</span> : <button
      type="button"
      onClick={() => setIsOpen(true)}
      className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
    >
      <Plus className="h-4 w-4" /> {classroom ? "Edit class" : "Add Class"}
    </button>}
    {isOpen && createPortal(<div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setIsOpen(false);
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="education-class-modal-title"
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
              <h2 id="education-class-modal-title" className="font-semibold text-slate-950">{classroom ? "Edit class" : "Add class"}</h2>
              <p className="mt-1 text-sm text-slate-500">{classroom ? "Update this class without changing its campus or academic year." : "Create a class group in a campus and academic year you can access."}</p>
          </div>
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label={classroom ? "Close edit class form" : "Close add class form"}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="overflow-y-auto p-5">
          <EducationClassForm
            campuses={campuses}
            academicYears={academicYears}
            teachers={teachers}
            canViewStaff={canViewStaff}
            classroom={classroom}
          />
        </div>
      </section>
    </div>, document.body)}
  </>;
}

export function EducationClassForm({
  campuses,
  academicYears,
  teachers,
  canViewStaff,
  classroom,
}: {
  campuses: CampusOption[];
  academicYears: AcademicYearOption[];
  teachers: TeacherOption[];
  canViewStaff: boolean;
  classroom?: ExistingClass;
}) {
  const [branchId, setBranchId] = useState(classroom?.branch_id ?? campuses[0]?.id ?? "");
  const campusTeachers = teachers.filter((teacher) => teacher.branch_id === branchId);

  return (
    <form action={classroom ? updateEducationClass : createEducationClass} className="mt-4 grid gap-3 sm:grid-cols-2">
      {classroom ? <>
        <input type="hidden" name="class_id" value={classroom.id} />
        <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          Campus: {campuses.find((campus) => campus.id === classroom.branch_id)?.name ?? "Assigned campus"}
          <br />
          Academic year: {academicYears.find((year) => year.id === classroom.academic_year_id)?.name ?? "Assigned year"}
        </p>
      </> : <>
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
      </>}
      <label className="text-sm font-medium text-slate-700">Class name
        <input required name="name" maxLength={100} defaultValue={classroom?.name ?? ""} placeholder="Grade 1" className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Class code
        <input name="class_code" maxLength={40} defaultValue={classroom?.class_code ?? ""} placeholder="G1-A" className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Level
        <input name="level_name" maxLength={80} defaultValue={classroom?.level_name ?? ""} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Stream
        <input name="stream_name" maxLength={80} defaultValue={classroom?.stream_name ?? ""} className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Curriculum stage
        <input name="curriculum_stage" maxLength={80} defaultValue={classroom?.curriculum_stage ?? ""} placeholder="Primary" className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Medium
        <input name="medium" maxLength={80} defaultValue={classroom?.medium ?? ""} placeholder="English" className={fieldClass} />
      </label>
      <label className="text-sm font-medium text-slate-700">Capacity
        <input name="capacity" type="number" min={1} step={1} defaultValue={classroom?.capacity ?? ""} className={fieldClass} />
      </label>
      {canViewStaff && <label className="text-sm font-medium text-slate-700">Class teacher (optional)
        <select name="class_teacher_id" defaultValue={classroom?.class_teacher_id ?? ""} className={fieldClass}>
          <option value="">Unassigned</option>
          {classroom?.class_teacher_id && !campusTeachers.some((teacher) => teacher.id === classroom.class_teacher_id) && <option value={classroom.class_teacher_id}>Previously assigned teacher</option>}
          {campusTeachers.map((teacher) => (
            <option key={teacher.id} value={teacher.id}>{teacher.first_name} {teacher.last_name}</option>
          ))}
        </select>
        {campusTeachers.length === 0 && <span className="mt-1 block text-xs font-normal text-slate-500">No active teaching staff are available at this campus.</span>}
      </label>}
      {!canViewStaff && classroom && <input type="hidden" name="class_teacher_id" value={classroom.class_teacher_id ?? ""} />}
      {classroom && <label className="text-sm font-medium text-slate-700">Status
        <select name="status" defaultValue={classroom.status === "active" ? "active" : "inactive"} className={fieldClass}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </label>}
      <div className="sm:col-span-2">
        <button type="submit" className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-800">
          {classroom ? "Save changes" : "Save class"}
        </button>
      </div>
    </form>
  );
}
