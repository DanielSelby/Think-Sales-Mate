begin;

create or replace function public.education_find_auth_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = ''
stable
as $$
  select auth_user.id
  from auth.users auth_user
  where lower(btrim(auth_user.email)) = lower(btrim(p_email))
  limit 1;
$$;

revoke all on function public.education_find_auth_user_id_by_email(text) from public, anon, authenticated;
grant execute on function public.education_find_auth_user_id_by_email(text) to service_role;

commit;
