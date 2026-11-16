begin;

revoke update (student_number, status)
  on public.education_students
  from authenticated;

commit;
