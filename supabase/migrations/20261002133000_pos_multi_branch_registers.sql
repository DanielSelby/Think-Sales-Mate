begin;

drop index if exists public.pos_register_sessions_one_open_per_cashier;

create unique index if not exists pos_register_sessions_one_open_per_cashier_location
  on public.pos_register_sessions(org_id, cashier_id, location_id)
  where status = 'open';

create or replace function public.open_pos_register_sessions(
  p_org_id uuid,
  p_cashier_id uuid,
  p_cashier_name text,
  p_shift text,
  p_notes text,
  p_sessions jsonb
)
returns table (id uuid, location_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session jsonb;
  v_location_id uuid;
  v_opening_cash numeric(12,2);
begin
  if p_org_id is null or p_cashier_id is null or p_shift is null
    or p_shift not in ('morning', 'afternoon', 'night', 'full_day')
    or p_sessions is null
    or jsonb_typeof(p_sessions) <> 'array'
    or jsonb_array_length(p_sessions) = 0 then
    raise exception 'Invalid register session request.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_sessions) as requested(value)
    group by requested.value->>'location_id'
    having count(*) > 1
  ) then
    raise exception 'A branch may only be opened once in a register request.';
  end if;

  for v_session in select value from jsonb_array_elements(p_sessions)
  loop
    v_location_id := (v_session->>'location_id')::uuid;
    v_opening_cash := (v_session->>'opening_cash')::numeric;

    if v_opening_cash is null or v_opening_cash < 0
      or not exists (
        select 1
        from public.business_locations location
        where location.id = v_location_id
          and location.org_id = p_org_id
          and location.is_active = true
          and exists (
            select 1
            from public.organization_members member
            join public.organizations organization on organization.id = member.org_id
            where member.org_id = p_org_id
              and member.user_id = p_cashier_id
              and member.status = 'active'
              and (
                member.role = 'owner'
                or organization.created_by = p_cashier_id
                or member.branch_scope = 'all'
                or member.location_id = v_location_id
                or v_location_id = any(coalesce(member.secondary_location_ids, '{}'::uuid[]))
              )
          )
      ) then
      raise exception 'Invalid branch or opening float in register request.';
    end if;

    if exists (
      select 1 from public.pos_register_sessions existing
      where existing.org_id = p_org_id
        and existing.cashier_id = p_cashier_id
        and existing.location_id = v_location_id
        and existing.status = 'open'
    ) then
      raise exception 'An open register already exists for one of the requested branches.';
    end if;

    insert into public.pos_register_sessions (
      org_id, location_id, cashier_id, cashier_name, register_name,
      shift, opening_cash, notes
    ) values (
      p_org_id, v_location_id, p_cashier_id, p_cashier_name, 'POS-01',
      p_shift, v_opening_cash, nullif(btrim(p_notes), '')
    )
    returning pos_register_sessions.id, pos_register_sessions.location_id
    into id, location_id;

    return next;
  end loop;
end;
$$;

revoke all on function public.open_pos_register_sessions(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.open_pos_register_sessions(uuid, uuid, text, text, text, jsonb) to service_role;

commit;
