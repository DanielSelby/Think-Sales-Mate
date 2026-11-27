begin;

alter table public.education_students
  add column if not exists nationality text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.education_students'::regclass
      and conname = 'education_students_nationality_check'
  ) then
    alter table public.education_students
      add constraint education_students_nationality_check
      check (nationality is null or char_length(btrim(nationality)) between 1 and 100);
  end if;
end;
$$;

commit;
