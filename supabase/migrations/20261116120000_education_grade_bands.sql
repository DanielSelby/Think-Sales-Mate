alter table public.education_results
  add column if not exists grade_override text;

update public.education_results
set grade_override = grade
where grade is not null
  and grade_override is null;

create table if not exists public.education_grade_bands (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  label text not null,
  minimum_percentage numeric(5, 2) not null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, minimum_percentage),
  check (length(btrim(label)) between 1 and 10),
  check (minimum_percentage between 0 and 100)
);

alter table public.education_grade_bands enable row level security;

create policy "education grade bands read"
  on public.education_grade_bands for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and (
      public.has_org_product_permission(org_id, 'think-education', 'education_results', 'view')
      or public.has_org_product_permission(org_id, 'think-education', 'education_academics', 'view')
    )
  );
create policy "education grade bands create"
  on public.education_grade_bands for insert
  with check (public.education_can_access_organization(org_id, 'education_academics', 'create'));
create policy "education grade bands update"
  on public.education_grade_bands for update
  using (public.education_can_access_organization(org_id, 'education_academics', 'edit'))
  with check (public.education_can_access_organization(org_id, 'education_academics', 'edit'));
create policy "education grade bands delete"
  on public.education_grade_bands for delete
  using (public.education_can_access_organization(org_id, 'education_academics', 'edit'));

revoke all on public.education_grade_bands from anon;
grant select, insert, update, delete on public.education_grade_bands to authenticated;
revoke insert on public.education_grade_bands from authenticated;
grant insert (org_id, label, minimum_percentage) on public.education_grade_bands to authenticated;
revoke update on public.education_grade_bands from authenticated;
grant update (label, minimum_percentage, updated_by, updated_at)
  on public.education_grade_bands to authenticated;

create or replace function public.education_protect_result_scores()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status <> 'draft' and (
    new.score is distinct from old.score
    or new.maximum_score is distinct from old.maximum_score
    or new.grade is distinct from old.grade
    or new.grade_override is distinct from old.grade_override
  ) then
    raise exception 'Only draft results can be corrected.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists education_results_draft_score_guard on public.education_results;
create trigger education_results_draft_score_guard
  before update on public.education_results
  for each row execute function public.education_protect_result_scores();

revoke all on function public.education_protect_result_scores() from public, anon, authenticated;
