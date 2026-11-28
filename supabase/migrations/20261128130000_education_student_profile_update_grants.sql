begin;

grant update (nationality, home_address)
  on public.education_students to authenticated;

commit;
