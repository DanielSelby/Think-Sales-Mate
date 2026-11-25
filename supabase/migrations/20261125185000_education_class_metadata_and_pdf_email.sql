begin;

alter table public.education_classes
  add column if not exists class_code text,
  add column if not exists curriculum_stage text,
  add column if not exists medium text;

alter table public.education_classes
  add constraint education_classes_class_code_length
    check (class_code is null or char_length(class_code) <= 40),
  add constraint education_classes_curriculum_stage_length
    check (curriculum_stage is null or char_length(curriculum_stage) <= 80),
  add constraint education_classes_medium_length
    check (medium is null or char_length(medium) <= 80);

create unique index if not exists education_classes_class_code_unique
  on public.education_classes (org_id, branch_id, academic_year_id, lower(btrim(class_code)))
  where class_code is not null and btrim(class_code) <> '';

grant insert (
  org_id,
  branch_id,
  academic_year_id,
  class_teacher_id,
  name,
  class_code,
  level_name,
  stream_name,
  curriculum_stage,
  medium,
  capacity
) on public.education_classes to authenticated;

grant update (
  name,
  class_code,
  level_name,
  stream_name,
  curriculum_stage,
  medium,
  class_teacher_id,
  capacity,
  status,
  updated_at
) on public.education_classes to authenticated;

commit;
