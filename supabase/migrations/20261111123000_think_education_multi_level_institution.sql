alter table public.education_institution_settings
  drop constraint if exists education_institution_settings_institution_type_check;

alter table public.education_institution_settings
  add constraint education_institution_settings_institution_type_check
  check (institution_type in (
    'basic',
    'primary',
    'junior_high',
    'senior_high',
    'college',
    'university',
    'technical_vocational',
    'training',
    'multi_level',
    'other'
  ));
