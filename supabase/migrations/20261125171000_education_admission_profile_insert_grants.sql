begin;

grant insert (
  org_id,
  branch_id,
  application_number,
  applicant_first_name,
  applicant_last_name,
  applicant_email,
  applicant_phone,
  requested_class_id,
  applicant_other_names,
  applicant_date_of_birth,
  applicant_gender,
  applicant_address,
  guardian_first_name,
  guardian_last_name,
  guardian_email,
  guardian_phone,
  guardian_relationship
) on public.education_admissions to authenticated;

commit;
