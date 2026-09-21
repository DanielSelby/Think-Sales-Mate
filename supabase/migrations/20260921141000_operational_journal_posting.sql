begin;

create unique index if not exists idx_journal_entries_source_once
  on public.journal_entries(org_id, source_module, source_id)
  where source_id is not null;

create or replace function public.post_operational_journal(
  p_org_id uuid,
  p_entry_date date,
  p_location_id uuid,
  p_description text,
  p_reference text,
  p_source_module text,
  p_source_id text,
  p_lines jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_journal_id uuid;
  v_entry_number text;
  v_total_debit numeric(14,2);
  v_total_credit numeric(14,2);
begin
  if not public.is_org_member(p_org_id) then
    raise exception 'You are not a member of this organization';
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) < 2 then
    raise exception 'A journal entry requires at least two lines';
  end if;

  select id into v_journal_id
  from public.journal_entries
  where org_id = p_org_id
    and source_module = p_source_module
    and source_id = p_source_id
  limit 1;

  if v_journal_id is not null then
    return v_journal_id;
  end if;

  select coalesce(sum((line->>'debit')::numeric), 0),
         coalesce(sum((line->>'credit')::numeric), 0)
    into v_total_debit, v_total_credit
  from jsonb_array_elements(p_lines) line;

  if v_total_debit <= 0 or abs(v_total_debit - v_total_credit) > 0.01 then
    raise exception 'Journal entry is not balanced';
  end if;

  v_entry_number := 'JE-' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');

  insert into public.journal_entries (
    org_id, entry_number, entry_date, location_id, reference, description,
    status, total_debit, total_credit, source_module, source_id, is_auto,
    created_by, posted_by, posted_at
  ) values (
    p_org_id, v_entry_number, p_entry_date, p_location_id, p_reference,
    p_description, 'posted', v_total_debit, v_total_credit, p_source_module,
    p_source_id, true, p_created_by, p_created_by, now()
  )
  returning id into v_journal_id;

  insert into public.journal_entry_lines (
    journal_id, org_id, account_id, description, debit, credit, location_id
  )
  select
    v_journal_id,
    p_org_id,
    (line->>'account_id')::uuid,
    nullif(line->>'description', ''),
    coalesce((line->>'debit')::numeric, 0),
    coalesce((line->>'credit')::numeric, 0),
    p_location_id
  from jsonb_array_elements(p_lines) line;

  return v_journal_id;
end;
$$;

revoke all on function public.post_operational_journal(uuid, date, uuid, text, text, text, text, jsonb, uuid) from public;
grant execute on function public.post_operational_journal(uuid, date, uuid, text, text, text, text, jsonb, uuid) to authenticated;

commit;
