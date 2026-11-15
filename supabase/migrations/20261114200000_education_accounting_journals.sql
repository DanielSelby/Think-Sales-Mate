begin;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'education_accounting_periods_org_year_id_key'
      and conrelid = 'public.education_accounting_periods'::regclass
  ) then
    alter table public.education_accounting_periods
      add constraint education_accounting_periods_org_year_id_key
      unique (org_id, fiscal_year_id, id);
  end if;
end;
$$;

create table if not exists public.education_accounting_journal_sequences (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  last_number bigint not null check (last_number > 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.education_accounting_journals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  journal_number bigint not null check (journal_number > 0),
  branch_id uuid,
  fiscal_year_id uuid not null,
  period_id uuid not null,
  entry_date date not null,
  reference text check (reference is null or char_length(btrim(reference)) <= 120),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  source_module text not null default 'manual' check (source_module = 'manual'),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  total_debit numeric(14, 2) not null default 0 check (total_debit >= 0),
  total_credit numeric(14, 2) not null default 0 check (total_credit >= 0),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, journal_number),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, fiscal_year_id)
    references public.education_accounting_fiscal_years(org_id, id) on delete restrict,
  foreign key (org_id, fiscal_year_id, period_id)
    references public.education_accounting_periods(org_id, fiscal_year_id, id) on delete restrict,
  check (
    (status = 'draft' and posted_by is null and posted_at is null)
    or (status = 'posted' and posted_by is not null and posted_at is not null)
  )
);

create index if not exists education_accounting_journals_scope_date_idx
  on public.education_accounting_journals (org_id, branch_id, entry_date desc, journal_number desc);
create index if not exists education_accounting_journals_period_status_idx
  on public.education_accounting_journals (org_id, fiscal_year_id, period_id, status);

create table if not exists public.education_accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  journal_id uuid not null,
  line_number smallint not null check (line_number between 1 and 200),
  account_id uuid not null,
  description text check (description is null or char_length(btrim(description)) <= 300),
  debit numeric(14, 2) not null default 0 check (debit >= 0),
  credit numeric(14, 2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, journal_id, line_number),
  foreign key (org_id, journal_id)
    references public.education_accounting_journals(org_id, id) on delete restrict,
  foreign key (org_id, account_id)
    references public.education_accounting_accounts(org_id, id) on delete restrict,
  check ((debit > 0 and credit = 0) or (credit > 0 and debit = 0))
);

create index if not exists education_accounting_journal_lines_journal_idx
  on public.education_accounting_journal_lines (org_id, journal_id, line_number);
create index if not exists education_accounting_journal_lines_account_idx
  on public.education_accounting_journal_lines (org_id, account_id, journal_id);

create or replace function public.education_guard_accounting_journal_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.status <> 'draft' then
    raise exception 'Posted journals are immutable.'
      using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (
    new.org_id is distinct from old.org_id
    or new.journal_number is distinct from old.journal_number
    or new.branch_id is distinct from old.branch_id
    or new.fiscal_year_id is distinct from old.fiscal_year_id
    or new.period_id is distinct from old.period_id
    or new.created_by is distinct from old.created_by
  ) then
    raise exception 'Journal identity and campus scope cannot be changed.'
      using errcode = '22023';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists education_accounting_journal_mutation_guard on public.education_accounting_journals;
create trigger education_accounting_journal_mutation_guard
  before update or delete on public.education_accounting_journals
  for each row execute function public.education_guard_accounting_journal_mutation();
revoke all on function public.education_guard_accounting_journal_mutation() from public, anon, authenticated;

create or replace function public.education_guard_accounting_journal_line_mutation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_org_id uuid;
  target_journal_id uuid;
  journal_status text;
begin
  if tg_op = 'DELETE' then
    target_org_id := old.org_id;
    target_journal_id := old.journal_id;
  else
    target_org_id := new.org_id;
    target_journal_id := new.journal_id;
  end if;

  select journal.status into journal_status
  from public.education_accounting_journals journal
  where journal.org_id = target_org_id and journal.id = target_journal_id;
  if journal_status is distinct from 'draft' then
    raise exception 'Journal lines can only be changed while the journal is a draft.'
      using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists education_accounting_journal_line_mutation_guard on public.education_accounting_journal_lines;
create trigger education_accounting_journal_line_mutation_guard
  before insert or update or delete on public.education_accounting_journal_lines
  for each row execute function public.education_guard_accounting_journal_line_mutation();
revoke all on function public.education_guard_accounting_journal_line_mutation() from public, anon, authenticated;

create or replace function public.education_save_accounting_journal(
  p_org_id uuid,
  p_journal_id uuid,
  p_branch_id uuid,
  p_fiscal_year_id uuid,
  p_period_id uuid,
  p_entry_date date,
  p_reference text,
  p_description text,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  existing_journal public.education_accounting_journals%rowtype;
  target_year public.education_accounting_fiscal_years%rowtype;
  target_period public.education_accounting_periods%rowtype;
  line_record record;
  target_journal_id uuid;
  journal_number_value bigint;
  line_count integer;
  distinct_line_accounts integer;
  valid_line_accounts integer;
  total_debit_value numeric(14, 2) := 0;
  total_credit_value numeric(14, 2) := 0;
  line_index smallint := 0;
begin
  if auth.uid() is null
    or p_org_id is null
    or p_entry_date is null
    or p_description is null
    or char_length(btrim(p_description)) not between 1 and 300
    or char_length(coalesce(p_reference, '')) > 120
    or p_lines is null
    or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Journal details are invalid.'
      using errcode = '22023';
  end if;

  line_count := jsonb_array_length(p_lines);
  if line_count < 2 or line_count > 200 then
    raise exception 'A journal must contain between 2 and 200 lines.'
      using errcode = '22023';
  end if;

  if p_journal_id is null then
    if p_branch_id is null then
      if not public.education_can_access_organization(p_org_id, 'education_finance', 'create') then
        raise exception 'Organization-wide Think Education accounting access is required.'
          using errcode = '42501';
      end if;
    elsif not public.education_can_access_branch(p_org_id, p_branch_id, 'education_finance', 'create') then
      raise exception 'You are not authorized to create journals at this campus.'
        using errcode = '42501';
    end if;
    if not exists (
      select 1
      from public.education_campuses campus
      where campus.org_id = p_org_id
        and campus.branch_id = p_branch_id
        and campus.status = 'active'
    ) and p_branch_id is not null then
      raise exception 'The selected campus is not active in Think Education.'
        using errcode = '22023';
    end if;
  else
    select * into existing_journal
    from public.education_accounting_journals
    where org_id = p_org_id and id = p_journal_id
    for update;
    if not found or existing_journal.status <> 'draft' then
      raise exception 'Only existing draft journals can be edited.'
        using errcode = '55000';
    end if;
    if existing_journal.branch_id is distinct from p_branch_id
      or existing_journal.fiscal_year_id is distinct from p_fiscal_year_id
      or existing_journal.period_id is distinct from p_period_id then
      raise exception 'Journal campus and fiscal period cannot be changed after creation.'
        using errcode = '22023';
    end if;
    if p_branch_id is null then
      if not public.education_can_access_organization(p_org_id, 'education_finance', 'edit') then
        raise exception 'Organization-wide Think Education accounting access is required.'
          using errcode = '42501';
      end if;
    elsif not public.education_can_access_branch(p_org_id, p_branch_id, 'education_finance', 'edit') then
      raise exception 'You are not authorized to edit journals at this campus.'
        using errcode = '42501';
    end if;
  end if;

  select * into target_year
  from public.education_accounting_fiscal_years
  where org_id = p_org_id and id = p_fiscal_year_id;
  select * into target_period
  from public.education_accounting_periods
  where org_id = p_org_id and id = p_period_id and fiscal_year_id = p_fiscal_year_id;
  if not found
    or target_year.id is null
    or target_year.status <> 'open'
    or target_period.status <> 'open'
    or p_entry_date < target_period.starts_on
    or p_entry_date > target_period.ends_on
    or p_entry_date < target_year.starts_on
    or p_entry_date > target_year.ends_on then
    raise exception 'The journal date must fall within an open accounting period and fiscal year.'
      using errcode = '22023';
  end if;

  select count(distinct (line.value ->> 'account_id')::uuid)
  into distinct_line_accounts
  from jsonb_array_elements(p_lines) as line(value);
  if distinct_line_accounts < 2 then
    raise exception 'A journal must use at least two different accounts.'
      using errcode = '22023';
  end if;

  select count(distinct account.id)
  into valid_line_accounts
  from jsonb_array_elements(p_lines) as line(value)
  join public.education_accounting_accounts account
    on account.org_id = p_org_id
    and account.id = (line.value ->> 'account_id')::uuid
    and account.is_active
    and (account.branch_id is null or account.branch_id = p_branch_id)
    and (p_branch_id is not null or account.branch_id is null);
  if distinct_line_accounts <> valid_line_accounts then
    raise exception 'Every journal line must use an active account available to the selected campus.'
      using errcode = '22023';
  end if;

  for line_record in
    select *
    from jsonb_to_recordset(p_lines) as line(
      account_id uuid,
      debit numeric,
      credit numeric,
      description text
    )
  loop
    if line_record.account_id is null
      or line_record.debit is null
      or line_record.credit is null
      or line_record.debit < 0
      or line_record.credit < 0
      or line_record.debit > 999999999999.99
      or line_record.credit > 999999999999.99
      or line_record.debit <> round(line_record.debit, 2)
      or line_record.credit <> round(line_record.credit, 2)
      or (line_record.debit > 0 and line_record.credit > 0)
      or (line_record.debit = 0 and line_record.credit = 0)
      or char_length(coalesce(line_record.description, '')) > 300 then
      raise exception 'Each journal line needs an active account and one positive, two-decimal debit or credit amount.'
        using errcode = '22023';
    end if;
    total_debit_value := total_debit_value + line_record.debit;
    total_credit_value := total_credit_value + line_record.credit;
  end loop;

  if total_debit_value > 999999999999.99 or total_credit_value > 999999999999.99 then
    raise exception 'Journal totals exceed the supported amount.'
      using errcode = '22003';
  end if;

  if p_journal_id is null then
    insert into public.education_accounting_journal_sequences as seq (org_id, last_number)
    values (p_org_id, 1)
    on conflict (org_id) do update
      set last_number = seq.last_number + 1,
          updated_at = now()
    returning last_number into journal_number_value;

    insert into public.education_accounting_journals (
      org_id, journal_number, branch_id, fiscal_year_id, period_id, entry_date,
      reference, description, total_debit, total_credit, created_by
    ) values (
      p_org_id, journal_number_value, p_branch_id, p_fiscal_year_id, p_period_id, p_entry_date,
      nullif(btrim(p_reference), ''), btrim(p_description), total_debit_value, total_credit_value, auth.uid()
    ) returning id into target_journal_id;
  else
    target_journal_id := p_journal_id;
    journal_number_value := existing_journal.journal_number;
    update public.education_accounting_journals
    set entry_date = p_entry_date,
        reference = nullif(btrim(p_reference), ''),
        description = btrim(p_description),
        total_debit = total_debit_value,
        total_credit = total_credit_value,
        updated_at = now()
    where org_id = p_org_id and id = target_journal_id;

    delete from public.education_accounting_journal_lines line
    where line.org_id = p_org_id and line.journal_id = target_journal_id;
  end if;

  for line_record in
    select *
    from jsonb_to_recordset(p_lines) as line(
      account_id uuid,
      debit numeric,
      credit numeric,
      description text
    )
  loop
    line_index := line_index + 1;
    insert into public.education_accounting_journal_lines (
      org_id, journal_id, line_number, account_id, description, debit, credit
    ) values (
      p_org_id,
      target_journal_id,
      line_index,
      line_record.account_id,
      nullif(btrim(line_record.description), ''),
      line_record.debit,
      line_record.credit
    );
  end loop;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    case when p_journal_id is null then 'education_journal_draft_created' else 'education_journal_draft_updated' end,
    'education_accounting_journal',
    target_journal_id,
    jsonb_build_object(
      'journal_number', journal_number_value,
      'branch_id', p_branch_id,
      'entry_date', p_entry_date,
      'total_debit', total_debit_value,
      'total_credit', total_credit_value,
      'line_count', line_count
    )
  );
  return target_journal_id;
end;
$$;

create or replace function public.education_post_accounting_journal(
  p_org_id uuid,
  p_journal_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  journal_row public.education_accounting_journals%rowtype;
  line_count integer;
  distinct_line_accounts integer;
  total_debit_value numeric(14, 2);
  total_credit_value numeric(14, 2);
  valid_line_accounts integer;
begin
  select * into journal_row
  from public.education_accounting_journals
  where org_id = p_org_id and id = p_journal_id
  for update;
  if not found or journal_row.status <> 'draft' then
    raise exception 'Only draft journals can be posted.'
      using errcode = '55000';
  end if;

  if journal_row.branch_id is null then
    if not public.education_can_access_organization(p_org_id, 'education_finance', 'approve') then
      raise exception 'Organization-wide Think Education accounting approval is required.'
        using errcode = '42501';
    end if;
  elsif not public.education_can_access_branch(p_org_id, journal_row.branch_id, 'education_finance', 'approve') then
    raise exception 'You are not authorized to post journals at this campus.'
      using errcode = '42501';
  end if;

  select count(*), coalesce(sum(line.debit), 0), coalesce(sum(line.credit), 0)
  into line_count, total_debit_value, total_credit_value
  from public.education_accounting_journal_lines line
  where line.org_id = p_org_id and line.journal_id = p_journal_id;
  if line_count < 2
    or total_debit_value <= 0
    or total_debit_value <> total_credit_value
    or total_debit_value <> journal_row.total_debit
    or total_credit_value <> journal_row.total_credit then
    raise exception 'Journal debits and credits must balance before posting.'
      using errcode = '22023';
  end if;

  perform account.id
  from public.education_accounting_accounts account
  join (
    select distinct line.account_id
    from public.education_accounting_journal_lines line
    where line.org_id = p_org_id and line.journal_id = p_journal_id
  ) journal_accounts on journal_accounts.account_id = account.id
  where account.org_id = p_org_id
  order by account.id
  for share of account;

  select count(distinct line.account_id), count(distinct account.id)
  into distinct_line_accounts, valid_line_accounts
  from public.education_accounting_journal_lines line
  join public.education_accounting_accounts account
    on account.org_id = line.org_id and account.id = line.account_id
  where line.org_id = p_org_id
    and line.journal_id = p_journal_id
    and account.is_active
    and (account.branch_id is null or account.branch_id = journal_row.branch_id)
    and (journal_row.branch_id is not null or account.branch_id is null);
  if distinct_line_accounts < 2 or valid_line_accounts <> distinct_line_accounts then
    raise exception 'Every journal line must use an active account available to the journal campus.'
      using errcode = '22023';
  end if;

  perform fiscal.id
  from public.education_accounting_fiscal_years fiscal
  join public.education_accounting_periods period_row
    on period_row.org_id = fiscal.org_id and period_row.fiscal_year_id = fiscal.id
  where fiscal.org_id = p_org_id
    and fiscal.id = journal_row.fiscal_year_id
    and period_row.id = journal_row.period_id
  for share of fiscal, period_row;

  if not exists (
    select 1
    from public.education_accounting_fiscal_years year
    join public.education_accounting_periods period
      on period.org_id = year.org_id and period.fiscal_year_id = year.id
    where year.org_id = p_org_id
      and year.id = journal_row.fiscal_year_id
      and period.id = journal_row.period_id
      and year.status = 'open'
      and period.status = 'open'
      and journal_row.entry_date between period.starts_on and period.ends_on
      and journal_row.entry_date between year.starts_on and year.ends_on
  ) then
    raise exception 'The journal period is closed or does not include the entry date.'
      using errcode = '22023';
  end if;

  update public.education_accounting_journals
  set status = 'posted',
      posted_by = auth.uid(),
      posted_at = now(),
      updated_at = now()
  where org_id = p_org_id and id = p_journal_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'education_journal_posted',
    'education_accounting_journal',
    p_journal_id,
    jsonb_build_object(
      'journal_number', journal_row.journal_number,
      'branch_id', journal_row.branch_id,
      'entry_date', journal_row.entry_date,
      'total_debit', total_debit_value,
      'total_credit', total_credit_value,
      'line_count', line_count
    )
  );
  return true;
end;
$$;

revoke all on function public.education_save_accounting_journal(uuid, uuid, uuid, uuid, uuid, date, text, text, jsonb)
  from public, anon;
grant execute on function public.education_save_accounting_journal(uuid, uuid, uuid, uuid, uuid, date, text, text, jsonb)
  to authenticated;
revoke all on function public.education_post_accounting_journal(uuid, uuid)
  from public, anon;
grant execute on function public.education_post_accounting_journal(uuid, uuid)
  to authenticated;

alter table public.education_accounting_journals enable row level security;
alter table public.education_accounting_journal_lines enable row level security;
alter table public.education_accounting_journal_sequences enable row level security;

drop policy if exists "education accounting fiscal years read" on public.education_accounting_fiscal_years;
create policy "education accounting fiscal years read"
  on public.education_accounting_fiscal_years for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and public.has_org_product_permission(org_id, 'think-education', 'education_finance', 'view')
  );

drop policy if exists "education accounting periods read" on public.education_accounting_periods;
create policy "education accounting periods read"
  on public.education_accounting_periods for select
  using (
    public.education_user_has_any_branch_scope(org_id)
    and public.has_org_product_permission(org_id, 'think-education', 'education_finance', 'view')
  );

drop policy if exists "education accounting journals read" on public.education_accounting_journals;
create policy "education accounting journals read"
  on public.education_accounting_journals for select
  using (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_finance', 'view'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view'))
  );

drop policy if exists "education accounting journal lines read" on public.education_accounting_journal_lines;
create policy "education accounting journal lines read"
  on public.education_accounting_journal_lines for select
  using (
    exists (
      select 1
      from public.education_accounting_journals journal
      where journal.org_id = education_accounting_journal_lines.org_id
        and journal.id = education_accounting_journal_lines.journal_id
        and (
          (journal.branch_id is null and public.education_can_access_organization(journal.org_id, 'education_finance', 'view'))
          or (journal.branch_id is not null and public.education_can_access_branch(journal.org_id, journal.branch_id, 'education_finance', 'view'))
        )
    )
  );

revoke all on public.education_accounting_journal_sequences from anon, authenticated;
revoke all on public.education_accounting_journals from anon, authenticated;
revoke all on public.education_accounting_journal_lines from anon, authenticated;
grant select on public.education_accounting_journals to authenticated;
grant select on public.education_accounting_journal_lines to authenticated;

commit;
