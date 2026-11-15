begin;

create table if not exists public.education_accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid,
  code varchar(20) not null check (code ~ '^[A-Z0-9][A-Z0-9._/-]{1,19}$'),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  normal_balance text not null check (normal_balance in ('debit', 'credit')),
  parent_account_id uuid,
  description text check (description is null or char_length(description) <= 500),
  is_active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, code),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, parent_account_id)
    references public.education_accounting_accounts(org_id, id) on delete restrict,
  check (
    (account_type in ('asset', 'expense') and normal_balance = 'debit')
    or (account_type in ('liability', 'equity', 'income') and normal_balance = 'credit')
  )
);

create index if not exists education_accounting_accounts_scope_idx
  on public.education_accounting_accounts (org_id, branch_id, account_type, code);
create index if not exists education_accounting_accounts_parent_idx
  on public.education_accounting_accounts (org_id, parent_account_id)
  where parent_account_id is not null;

create table if not exists public.education_accounting_fiscal_years (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name),
  check (starts_on <= ends_on)
);

create index if not exists education_accounting_fiscal_years_dates_idx
  on public.education_accounting_fiscal_years (org_id, starts_on, ends_on);

create table if not exists public.education_accounting_periods (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  fiscal_year_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sequence_number smallint not null check (sequence_number between 1 and 120),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'open' check (status in ('open', 'closed')),
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, fiscal_year_id, sequence_number),
  unique (org_id, fiscal_year_id, starts_on),
  foreign key (org_id, fiscal_year_id)
    references public.education_accounting_fiscal_years(org_id, id) on delete restrict,
  check (starts_on <= ends_on),
  check (
    (status = 'open' and closed_by is null and closed_at is null)
    or (status = 'closed' and closed_by is not null and closed_at is not null)
  )
);

create index if not exists education_accounting_periods_dates_idx
  on public.education_accounting_periods (org_id, fiscal_year_id, starts_on, ends_on);

create or replace function public.education_validate_accounting_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_account public.education_accounting_accounts%rowtype;
  has_cycle boolean;
begin
  perform pg_advisory_xact_lock(hashtext(new.org_id::text));

  if new.parent_account_id is null then
    return new;
  end if;

  if new.parent_account_id = new.id then
    raise exception 'An account cannot be its own parent.'
      using errcode = '22023';
  end if;

  select * into parent_account
  from public.education_accounting_accounts
  where org_id = new.org_id and id = new.parent_account_id;
  if not found then
    raise exception 'The parent account does not exist in this institution.'
      using errcode = '23503';
  end if;
  if not parent_account.is_active then
    raise exception 'An inactive account cannot be selected as a parent.'
      using errcode = '22023';
  end if;
  if parent_account.account_type <> new.account_type then
    raise exception 'Parent and child accounts must use the same account type.'
      using errcode = '22023';
  end if;
  if parent_account.branch_id is not null
    and parent_account.branch_id is distinct from new.branch_id then
    raise exception 'A branch account can only have subaccounts at the same campus.'
      using errcode = '22023';
  end if;

  with recursive ancestors(id, parent_account_id) as (
    select id, parent_account_id
    from public.education_accounting_accounts
    where org_id = new.org_id and id = new.parent_account_id
    union all
    select account.id, account.parent_account_id
    from public.education_accounting_accounts account
    join ancestors on account.org_id = new.org_id and account.id = ancestors.parent_account_id
  )
  select exists (select 1 from ancestors where id = new.id) into has_cycle;

  if has_cycle then
    raise exception 'Account hierarchy cannot contain a cycle.'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

drop trigger if exists education_accounting_account_validate on public.education_accounting_accounts;
create trigger education_accounting_account_validate
  before insert or update of org_id, branch_id, account_type, parent_account_id
  on public.education_accounting_accounts
  for each row execute function public.education_validate_accounting_account();
revoke all on function public.education_validate_accounting_account() from public, anon, authenticated;

create or replace function public.education_audit_accounting_account()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.education_accounting_accounts%rowtype;
  action_name text;
begin
  if tg_op = 'INSERT' then
    account_row := new;
    action_name := 'education_account_created';
  else
    account_row := new;
    action_name := 'education_account_updated';
  end if;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    account_row.org_id,
    auth.uid(),
    action_name,
    'education_accounting_account',
    account_row.id,
    jsonb_build_object(
      'branch_id', account_row.branch_id,
      'code', account_row.code,
      'name', account_row.name,
      'account_type', account_row.account_type,
      'parent_account_id', account_row.parent_account_id,
      'is_active', account_row.is_active
    )
  );
  return new;
end;
$$;

drop trigger if exists education_accounting_account_audit on public.education_accounting_accounts;
create trigger education_accounting_account_audit
  after insert or update on public.education_accounting_accounts
  for each row execute function public.education_audit_accounting_account();
revoke all on function public.education_audit_accounting_account() from public, anon, authenticated;

create or replace function public.education_create_accounting_fiscal_year(
  p_org_id uuid,
  p_name text,
  p_starts_on date,
  p_ends_on date
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  fiscal_year_id uuid;
  period_cursor date;
  period_end date;
  period_sequence smallint := 0;
  period_count integer := 0;
begin
  if auth.uid() is null
    or p_name is null
    or char_length(btrim(p_name)) not between 1 and 80
    or p_starts_on is null
    or p_ends_on is null
    or p_starts_on > p_ends_on then
    raise exception 'Fiscal year details are invalid.'
      using errcode = '22023';
  end if;

  if not public.education_can_access_organization(p_org_id, 'education_finance', 'create') then
    raise exception 'Organization-wide Think Education accounting access is required to create fiscal years.'
      using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_org_id::text));

  if exists (
    select 1
    from public.education_accounting_fiscal_years fiscal_year
    where fiscal_year.org_id = p_org_id
      and fiscal_year.starts_on <= p_ends_on
      and fiscal_year.ends_on >= p_starts_on
  ) then
    raise exception 'Fiscal years cannot overlap.'
      using errcode = '22023';
  end if;

  insert into public.education_accounting_fiscal_years (org_id, name, starts_on, ends_on, created_by)
  values (p_org_id, btrim(p_name), p_starts_on, p_ends_on, auth.uid())
  returning id into fiscal_year_id;

  period_cursor := p_starts_on;
  while period_cursor <= p_ends_on loop
    period_sequence := period_sequence + 1;
    period_end := least(
      (date_trunc('month', period_cursor::timestamp) + interval '1 month - 1 day')::date,
      p_ends_on
    );
    insert into public.education_accounting_periods (
      org_id, fiscal_year_id, name, sequence_number, starts_on, ends_on
    ) values (
      p_org_id,
      fiscal_year_id,
      to_char(period_cursor, 'Mon YYYY'),
      period_sequence,
      period_cursor,
      period_end
    );
    period_count := period_count + 1;
    period_cursor := period_end + 1;
  end loop;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id,
    auth.uid(),
    'education_fiscal_year_created',
    'education_accounting_fiscal_year',
    fiscal_year_id,
    jsonb_build_object(
      'name', btrim(p_name),
      'starts_on', p_starts_on,
      'ends_on', p_ends_on,
      'period_count', period_count
    )
  );
  return fiscal_year_id;
end;
$$;

revoke all on function public.education_create_accounting_fiscal_year(uuid, text, date, date)
  from public, anon;
grant execute on function public.education_create_accounting_fiscal_year(uuid, text, date, date)
  to authenticated;

alter table public.education_accounting_accounts enable row level security;
alter table public.education_accounting_fiscal_years enable row level security;
alter table public.education_accounting_periods enable row level security;

drop policy if exists "education accounting accounts read" on public.education_accounting_accounts;
create policy "education accounting accounts read"
  on public.education_accounting_accounts for select
  using (
    (
      branch_id is null
      and public.education_user_has_any_branch_scope(org_id)
      and public.has_org_product_permission(org_id, 'think-education', 'education_finance', 'view')
    )
    or (
      branch_id is not null
      and public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view')
    )
  );

drop policy if exists "education accounting accounts create" on public.education_accounting_accounts;
create policy "education accounting accounts create"
  on public.education_accounting_accounts for insert
  with check (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_finance', 'create'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_finance', 'create'))
  );

drop policy if exists "education accounting accounts update" on public.education_accounting_accounts;
create policy "education accounting accounts update"
  on public.education_accounting_accounts for update
  using (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_finance', 'edit'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_finance', 'edit'))
  )
  with check (
    (branch_id is null and public.education_can_access_organization(org_id, 'education_finance', 'edit'))
    or (branch_id is not null and public.education_can_access_branch(org_id, branch_id, 'education_finance', 'edit'))
  );

drop policy if exists "education accounting fiscal years read" on public.education_accounting_fiscal_years;
create policy "education accounting fiscal years read"
  on public.education_accounting_fiscal_years for select
  using (public.education_can_access_organization(org_id, 'education_finance', 'view'));

drop policy if exists "education accounting periods read" on public.education_accounting_periods;
create policy "education accounting periods read"
  on public.education_accounting_periods for select
  using (public.education_can_access_organization(org_id, 'education_finance', 'view'));

revoke all on public.education_accounting_accounts from anon, authenticated;
revoke all on public.education_accounting_fiscal_years from anon, authenticated;
revoke all on public.education_accounting_periods from anon, authenticated;
grant select on public.education_accounting_accounts to authenticated;
grant insert (org_id, branch_id, code, name, account_type, normal_balance, parent_account_id, description)
  on public.education_accounting_accounts to authenticated;
grant update (code, name, parent_account_id, description, is_active, updated_at)
  on public.education_accounting_accounts to authenticated;
revoke delete on public.education_accounting_accounts from authenticated;
grant select on public.education_accounting_fiscal_years to authenticated;
revoke insert, update, delete on public.education_accounting_fiscal_years from authenticated;
grant select on public.education_accounting_periods to authenticated;
revoke insert, update, delete on public.education_accounting_periods from authenticated;

commit;
