begin;

with admission_gender as (
  select distinct on (application.org_id, application.enrolled_student_id)
    application.org_id,
    application.enrolled_student_id,
    nullif(btrim(application.applicant_gender), '') as gender
  from public.education_admissions application
  where application.status = 'enrolled'
    and application.enrolled_student_id is not null
    and nullif(btrim(application.applicant_gender), '') is not null
  order by
    application.org_id,
    application.enrolled_student_id,
    application.applied_at desc,
    application.id desc
)
update public.education_students student
set gender = admission_gender.gender,
    updated_at = now()
from admission_gender
where student.org_id = admission_gender.org_id
  and student.id = admission_gender.enrolled_student_id
  and nullif(btrim(student.gender), '') is null;

commit;
