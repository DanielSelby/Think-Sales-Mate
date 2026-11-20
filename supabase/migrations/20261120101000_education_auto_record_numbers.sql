begin;

alter table public.education_admissions
  alter column application_number set default (
    'APP-' || to_char(current_date, 'YYYY') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

alter table public.education_students
  alter column student_number set default (
    'STU-' || to_char(current_date, 'YYYY') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

alter table public.education_staff
  alter column staff_number set default (
    'STF-' || to_char(current_date, 'YYYY') || '-'
    || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 16))
  );

commit;
