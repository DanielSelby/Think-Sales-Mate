begin;

alter table public.employees
  add constraint employees_org_id_id_key unique (org_id, id);

alter table public.education_staff
  add column hrm_employee_id uuid;

alter table public.education_staff
  add constraint education_staff_hrm_employee_fkey
  foreign key (org_id, hrm_employee_id)
  references public.employees (org_id, id)
  on delete restrict;

create unique index education_staff_hrm_employee_unique_idx
  on public.education_staff (org_id, hrm_employee_id)
  where hrm_employee_id is not null;

create or replace function public.education_staff_link_hrm_employee(
  p_org_id uuid,
  p_staff_id uuid,
  p_employee_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  staff_row public.education_staff%rowtype;
begin
  if auth.uid() is null or p_org_id is null or p_staff_id is null then
    raise exception 'A signed-in user, organization, and staff record are required.'
      using errcode = '22023';
  end if;

  select staff.* into staff_row
  from public.education_staff staff
  where staff.org_id = p_org_id
    and staff.id = p_staff_id
  for update;
  if not found then
    raise exception 'The Education staff record was not found.'
      using errcode = 'P0002';
  end if;

  if not public.education_can_access_branch(
    p_org_id, staff_row.branch_id, 'education_staff', 'edit'
  ) then
    raise exception 'You cannot edit this Education staff record.'
      using errcode = '42501';
  end if;

  if not (
    public.has_org_product_permission(p_org_id, 'thinksales-erp', 'hrm_payroll', 'edit')
    or public.has_org_product_permission(p_org_id, 'restaurant', 'hrm_payroll', 'edit')
  ) then
    raise exception 'You need HRM employee edit permission to manage this link.'
      using errcode = '42501';
  end if;

  if staff_row.hrm_employee_id is not null
    and p_employee_id is not null
    and staff_row.hrm_employee_id <> p_employee_id then
    raise exception 'Unlink the current HRM employee before assigning a different one.'
      using errcode = '23505';
  end if;

  if p_employee_id is not null and not exists (
    select 1
    from public.employees employee
    where employee.org_id = p_org_id
      and employee.id = p_employee_id
  ) then
    raise exception 'The HRM employee record was not found in this organization.'
      using errcode = 'P0002';
  end if;

  update public.education_staff
  set hrm_employee_id = p_employee_id,
      updated_at = now()
  where org_id = p_org_id
    and id = p_staff_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    case when p_employee_id is null then 'education_staff_hrm_unlinked' else 'education_staff_hrm_linked' end,
    'education_staff',
    p_staff_id,
    jsonb_build_object(
      'branch_id', staff_row.branch_id,
      'previous_employee_id', staff_row.hrm_employee_id,
      'employee_id', p_employee_id
    )
  );

  return true;
end;
$$;

revoke all on function public.education_staff_link_hrm_employee(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.education_staff_link_hrm_employee(uuid, uuid, uuid)
  to authenticated;

commit;
