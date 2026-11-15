begin;

create table if not exists public.education_accounting_bank_statements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  account_id uuid not null,
  period_starts_on date not null,
  period_ends_on date not null,
  opening_balance numeric(14, 2) not null,
  closing_balance numeric(14, 2) not null,
  status text not null default 'open' check (status in ('open', 'reconciled')),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  reconciled_by uuid references auth.users(id) on delete set null,
  reconciled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, account_id)
    references public.education_accounting_accounts(org_id, id) on delete restrict,
  check (period_starts_on <= period_ends_on),
  check (
    (status = 'open' and reconciled_by is null and reconciled_at is null)
    or (status = 'reconciled' and reconciled_by is not null and reconciled_at is not null)
  )
);

create table if not exists public.education_accounting_bank_statement_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  statement_id uuid not null,
  transaction_date date not null,
  reference text check (reference is null or char_length(reference) <= 120),
  description text not null check (char_length(btrim(description)) between 1 and 300),
  amount numeric(14, 2) not null check (amount <> 0),
  matched_journal_line_id uuid,
  matched_by uuid references auth.users(id) on delete set null,
  matched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, statement_id)
    references public.education_accounting_bank_statements(org_id, id) on delete cascade,
  foreign key (org_id, matched_journal_line_id)
    references public.education_accounting_journal_lines(org_id, id) on delete restrict,
  check (
    (matched_journal_line_id is null and matched_by is null and matched_at is null)
    or (matched_journal_line_id is not null and matched_by is not null and matched_at is not null)
  )
);

create unique index if not exists education_accounting_bank_statement_line_match_idx
  on public.education_accounting_bank_statement_lines (org_id, matched_journal_line_id)
  where matched_journal_line_id is not null;
create index if not exists education_accounting_bank_statements_scope_date_idx
  on public.education_accounting_bank_statements (org_id, branch_id, account_id, period_ends_on desc);
create index if not exists education_accounting_bank_statement_lines_statement_idx
  on public.education_accounting_bank_statement_lines (org_id, statement_id, transaction_date, id);

alter table public.education_accounting_bank_statements enable row level security;
alter table public.education_accounting_bank_statement_lines enable row level security;

drop policy if exists "education accounting bank statements read" on public.education_accounting_bank_statements;
create policy "education accounting bank statements read"
  on public.education_accounting_bank_statements for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_finance', 'view'));

drop policy if exists "education accounting bank statement lines read" on public.education_accounting_bank_statement_lines;
create policy "education accounting bank statement lines read"
  on public.education_accounting_bank_statement_lines for select
  using (
    exists (
      select 1
      from public.education_accounting_bank_statements statement
      where statement.org_id = education_accounting_bank_statement_lines.org_id
        and statement.id = education_accounting_bank_statement_lines.statement_id
        and public.education_can_access_branch(statement.org_id, statement.branch_id, 'education_finance', 'view')
    )
  );

revoke all on public.education_accounting_bank_statements from anon, authenticated;
revoke all on public.education_accounting_bank_statement_lines from anon, authenticated;
grant select on public.education_accounting_bank_statements to authenticated;
grant select on public.education_accounting_bank_statement_lines to authenticated;

create or replace function public.education_create_accounting_bank_statement(
  p_org_id uuid,
  p_branch_id uuid,
  p_account_id uuid,
  p_period_starts_on date,
  p_period_ends_on date,
  p_opening_balance numeric,
  p_closing_balance numeric,
  p_lines jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  account_row public.education_accounting_accounts%rowtype;
  statement_id uuid;
  line_count integer;
  lines_total numeric(14, 2);
  statement_line record;
  candidate_count integer;
  candidate_line_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_branch_id is null or p_account_id is null
    or p_period_starts_on is null or p_period_ends_on is null
    or p_period_starts_on > p_period_ends_on
    or p_opening_balance is null or p_closing_balance is null
    or abs(p_opening_balance) > 999999999999.99
    or abs(p_closing_balance) > 999999999999.99
    or p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Bank statement details are invalid.'
      using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_finance', 'create') then
    raise exception 'You are not authorized to import bank statements at this campus.'
      using errcode = '42501';
  end if;
  select * into account_row
  from public.education_accounting_accounts
  where org_id = p_org_id and id = p_account_id
  for share;
  if not found or not account_row.is_active or not account_row.is_cash_account
    or account_row.account_type <> 'asset'
    or (account_row.branch_id is not null and account_row.branch_id <> p_branch_id) then
    raise exception 'Select an active cash or bank account available to this campus.'
      using errcode = '22023';
  end if;

  select count(*), coalesce(sum(line.amount), 0)
  into line_count, lines_total
  from jsonb_to_recordset(p_lines) as line(
    transaction_date date,
    reference text,
    description text,
    amount numeric
  );
  if line_count < 1 or line_count > 10000
    or round(p_opening_balance + lines_total, 2) <> p_closing_balance then
    raise exception 'The statement must contain 1 to 10,000 rows and its opening balance plus transactions must equal its closing balance.'
      using errcode = '22023';
  end if;

  if exists (
    select 1 from public.education_accounting_bank_statements statement
    where statement.org_id = p_org_id
      and statement.branch_id = p_branch_id
      and statement.account_id = p_account_id
      and p_period_starts_on <= statement.period_ends_on
      and p_period_ends_on >= statement.period_starts_on
  ) then
    raise exception 'A statement already exists for an overlapping date range on this account.'
      using errcode = '23505';
  end if;

  insert into public.education_accounting_bank_statements (
    org_id, branch_id, account_id, period_starts_on, period_ends_on,
    opening_balance, closing_balance, created_by
  ) values (
    p_org_id, p_branch_id, p_account_id, p_period_starts_on, p_period_ends_on,
    p_opening_balance, p_closing_balance, auth.uid()
  ) returning id into statement_id;

  for statement_line in
    select *
    from jsonb_to_recordset(p_lines) as line(
      transaction_date date,
      reference text,
      description text,
      amount numeric
    )
  loop
    if statement_line.transaction_date is null
      or statement_line.transaction_date < p_period_starts_on
      or statement_line.transaction_date > p_period_ends_on
      or statement_line.amount is null
      or statement_line.amount = 0
      or abs(statement_line.amount) > 999999999999.99
      or statement_line.amount <> round(statement_line.amount, 2)
      or char_length(coalesce(statement_line.description, '')) not between 1 and 300
      or char_length(coalesce(statement_line.reference, '')) > 120 then
      raise exception 'A bank statement row is invalid or outside the statement dates.'
        using errcode = '22023';
    end if;

    insert into public.education_accounting_bank_statement_lines (
      org_id, statement_id, transaction_date, reference, description, amount
    ) values (
      p_org_id, statement_id, statement_line.transaction_date,
      nullif(btrim(statement_line.reference), ''), btrim(statement_line.description), statement_line.amount
    );
  end loop;

  for statement_line in
    select line.id, line.transaction_date, line.reference, line.amount
    from public.education_accounting_bank_statement_lines line
    where line.org_id = p_org_id and line.statement_id = statement_id
  loop
    select count(*), min(journal_line.id::text)::uuid
    into candidate_count, candidate_line_id
    from public.education_accounting_journal_lines journal_line
    join public.education_accounting_journals journal
      on journal.org_id = journal_line.org_id and journal.id = journal_line.journal_id
    where journal_line.org_id = p_org_id
      and journal_line.account_id = p_account_id
      and journal.status = 'posted'
      and journal.entry_date between p_period_starts_on and p_period_ends_on
      and journal_line.debit - journal_line.credit = statement_line.amount
      and (
        statement_line.reference is null
        or journal.reference = statement_line.reference
        or journal_line.description = statement_line.reference
      )
      and not exists (
        select 1 from public.education_accounting_bank_statement_lines matched
        where matched.org_id = p_org_id and matched.matched_journal_line_id = journal_line.id
      );
    if candidate_count = 1 then
      update public.education_accounting_bank_statement_lines
      set matched_journal_line_id = candidate_line_id, matched_by = auth.uid(), matched_at = now()
      where org_id = p_org_id and id = statement_line.id;
    end if;
  end loop;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_bank_statement_imported',
    'education_accounting_bank_statement', statement_id,
    jsonb_build_object(
      'branch_id', p_branch_id,
      'account_id', p_account_id,
      'period_starts_on', p_period_starts_on,
      'period_ends_on', p_period_ends_on,
      'line_count', line_count,
      'opening_balance', p_opening_balance,
      'closing_balance', p_closing_balance
    )
  );
  return statement_id;
end;
$$;

create or replace function public.education_match_accounting_bank_line(
  p_org_id uuid,
  p_statement_line_id uuid,
  p_journal_line_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  statement_line public.education_accounting_bank_statement_lines%rowtype;
  statement_row public.education_accounting_bank_statements%rowtype;
  journal_line public.education_accounting_journal_lines%rowtype;
  journal_row public.education_accounting_journals%rowtype;
begin
  select * into statement_line
  from public.education_accounting_bank_statement_lines
  where org_id = p_org_id and id = p_statement_line_id
  for update;
  if not found then
    raise exception 'The statement row was not found.'
      using errcode = 'P0002';
  end if;
  select * into statement_row
  from public.education_accounting_bank_statements
  where org_id = p_org_id and id = statement_line.statement_id
  for update;
  if not found or statement_row.status <> 'open' then
    raise exception 'Only open bank statements can be matched.'
      using errcode = '55000';
  end if;
  if not public.education_can_access_branch(p_org_id, statement_row.branch_id, 'education_finance', 'edit') then
    raise exception 'You are not authorized to match bank statement rows at this campus.'
      using errcode = '42501';
  end if;
  if statement_line.matched_journal_line_id is not null then
    raise exception 'This statement row is already matched.'
      using errcode = '22023';
  end if;

  select * into journal_line
  from public.education_accounting_journal_lines
  where org_id = p_org_id and id = p_journal_line_id;
  if not found then
    raise exception 'The journal line was not found.'
      using errcode = 'P0002';
  end if;
  select * into journal_row
  from public.education_accounting_journals
  where org_id = p_org_id and id = journal_line.journal_id;
  if not found or journal_row.status <> 'posted'
    or journal_row.entry_date < statement_row.period_starts_on
    or journal_row.entry_date > statement_row.period_ends_on
    or journal_line.account_id <> statement_row.account_id
    or journal_line.debit - journal_line.credit <> statement_line.amount
    or (journal_row.branch_id is not null and journal_row.branch_id <> statement_row.branch_id) then
    raise exception 'The selected journal line does not match this statement row and cash account.'
      using errcode = '22023';
  end if;

  update public.education_accounting_bank_statement_lines
  set matched_journal_line_id = journal_line.id, matched_by = auth.uid(), matched_at = now()
  where org_id = p_org_id and id = p_statement_line_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_bank_statement_line_matched',
    'education_accounting_bank_statement_line', p_statement_line_id,
    jsonb_build_object('statement_id', statement_row.id, 'journal_line_id', journal_line.id)
  );
  return true;
end;
$$;

create or replace function public.education_reconcile_accounting_bank_statement(
  p_org_id uuid,
  p_statement_id uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  statement_row public.education_accounting_bank_statements%rowtype;
  line_count integer;
  unmatched_count integer;
  book_open numeric(14, 2);
  book_period numeric(14, 2);
  outstanding_book numeric(14, 2);
begin
  if char_length(btrim(coalesce(p_reason, ''))) not between 3 and 500 then
    raise exception 'A reconciliation note of at least three characters is required.'
      using errcode = '22023';
  end if;
  select * into statement_row
  from public.education_accounting_bank_statements
  where org_id = p_org_id and id = p_statement_id
  for update;
  if not found then
    raise exception 'The bank statement was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, statement_row.branch_id, 'education_finance', 'approve') then
    raise exception 'Finance approval access at this campus is required to reconcile statements.'
      using errcode = '42501';
  end if;
  if statement_row.status <> 'open' then
    raise exception 'The bank statement is already reconciled.'
      using errcode = '55000';
  end if;
  select count(*), count(*) filter (where matched_journal_line_id is null)
  into line_count, unmatched_count
  from public.education_accounting_bank_statement_lines
  where org_id = p_org_id and statement_id = p_statement_id;
  if line_count = 0 or unmatched_count > 0 then
    raise exception 'Match every imported statement row before reconciliation.'
      using errcode = '22023';
  end if;

  select
    coalesce(sum(case when journal.entry_date < statement_row.period_starts_on then line.debit - line.credit else 0 end), 0),
    coalesce(sum(case when journal.entry_date between statement_row.period_starts_on and statement_row.period_ends_on then line.debit - line.credit else 0 end), 0),
    coalesce(sum(case
      when journal.entry_date between statement_row.period_starts_on and statement_row.period_ends_on
        and not exists (
          select 1 from public.education_accounting_bank_statement_lines matched
          where matched.org_id = p_org_id and matched.matched_journal_line_id = line.id
        )
      then line.debit - line.credit else 0 end), 0)
  into book_open, book_period, outstanding_book
  from public.education_accounting_journal_lines line
  join public.education_accounting_journals journal
    on journal.org_id = line.org_id and journal.id = line.journal_id
  where line.org_id = p_org_id
    and line.account_id = statement_row.account_id
    and journal.status = 'posted'
    and journal.entry_date <= statement_row.period_ends_on;

  if round(book_open + book_period, 2) <> round(statement_row.closing_balance + outstanding_book, 2) then
    raise exception 'The adjusted statement balance does not equal the posted ledger balance. Check opening balances and unmatched book entries.'
      using errcode = '22023';
  end if;

  update public.education_accounting_bank_statements
  set status = 'reconciled', reconciled_by = auth.uid(), reconciled_at = now()
  where org_id = p_org_id and id = p_statement_id;
  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_bank_statement_reconciled',
    'education_accounting_bank_statement', p_statement_id,
    jsonb_build_object(
      'branch_id', statement_row.branch_id,
      'account_id', statement_row.account_id,
      'period_starts_on', statement_row.period_starts_on,
      'period_ends_on', statement_row.period_ends_on,
      'reason', btrim(p_reason)
    )
  );
  return true;
end;
$$;

revoke all on function public.education_create_accounting_bank_statement(uuid, uuid, uuid, date, date, numeric, numeric, jsonb)
  from public, anon;
grant execute on function public.education_create_accounting_bank_statement(uuid, uuid, uuid, date, date, numeric, numeric, jsonb)
  to authenticated;
revoke all on function public.education_match_accounting_bank_line(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.education_match_accounting_bank_line(uuid, uuid, uuid)
  to authenticated;
revoke all on function public.education_reconcile_accounting_bank_statement(uuid, uuid, text)
  from public, anon;
grant execute on function public.education_reconcile_accounting_bank_statement(uuid, uuid, text)
  to authenticated;

commit;
