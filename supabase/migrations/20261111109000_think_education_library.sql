begin;

create table if not exists public.education_library_books (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  isbn text check (isbn is null or char_length(btrim(isbn)) between 1 and 32),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  author text not null check (char_length(btrim(author)) between 1 and 160),
  publisher text check (publisher is null or char_length(btrim(publisher)) <= 160),
  category text not null check (char_length(btrim(category)) between 1 and 80),
  publication_year smallint check (publication_year is null or publication_year between 1000 and 9999),
  status text not null default 'active' check (status in ('active', 'archived')),
  created_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, branch_id, id),
  foreign key (org_id, branch_id)
    references public.business_locations(org_id, id) on delete restrict
);

create unique index if not exists education_library_books_isbn_unique_idx
  on public.education_library_books (org_id, branch_id, lower(btrim(isbn)))
  where isbn is not null;
create index if not exists education_library_books_catalog_idx
  on public.education_library_books (org_id, branch_id, status, title);

create table if not exists public.education_library_copies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  book_id uuid not null,
  copy_number text not null check (char_length(btrim(copy_number)) between 1 and 40),
  status text not null default 'available' check (status in ('available', 'maintenance', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, branch_id, id),
  unique (org_id, branch_id, book_id, copy_number),
  foreign key (org_id, branch_id, book_id)
    references public.education_library_books(org_id, branch_id, id) on delete restrict
);

create index if not exists education_library_copies_book_status_idx
  on public.education_library_copies (org_id, branch_id, book_id, status);

create table if not exists public.education_library_loans (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  copy_id uuid not null,
  student_id uuid not null,
  loaned_on date not null default current_date,
  due_on date not null,
  returned_on date,
  renewal_count smallint not null default 0 check (renewal_count between 0 and 1),
  issued_by uuid not null references auth.users(id) on delete restrict default auth.uid(),
  returned_by uuid references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, branch_id, copy_id)
    references public.education_library_copies(org_id, branch_id, id) on delete restrict,
  foreign key (org_id, branch_id, student_id)
    references public.education_students(org_id, branch_id, id) on delete restrict,
  check (due_on >= loaned_on),
  check ((returned_on is null and returned_by is null) or (returned_on is not null and returned_by is not null))
);

create unique index if not exists education_library_one_open_loan_per_copy_idx
  on public.education_library_loans (org_id, copy_id)
  where returned_on is null;
create index if not exists education_library_loans_branch_due_idx
  on public.education_library_loans (org_id, branch_id, due_on)
  where returned_on is null;
create index if not exists education_library_loans_student_idx
  on public.education_library_loans (org_id, branch_id, student_id, loaned_on desc);

alter table public.education_library_books enable row level security;
alter table public.education_library_copies enable row level security;
alter table public.education_library_loans enable row level security;

create policy "education library books read"
  on public.education_library_books for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_library', 'view'));

create policy "education library copies read"
  on public.education_library_copies for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_library', 'view'));

create policy "education library loans read"
  on public.education_library_loans for select
  using (public.education_can_access_branch(org_id, branch_id, 'education_library', 'view'));

create or replace function public.education_library_create_book(
  p_org_id uuid,
  p_branch_id uuid,
  p_isbn text,
  p_title text,
  p_author text,
  p_publisher text,
  p_category text,
  p_publication_year smallint,
  p_copy_count integer
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  book_id uuid;
begin
  if auth.uid() is null
    or p_title is null or char_length(btrim(p_title)) not between 1 and 200
    or p_author is null or char_length(btrim(p_author)) not between 1 and 160
    or char_length(coalesce(p_isbn, '')) > 32
    or char_length(coalesce(p_publisher, '')) > 160
    or p_category is null or char_length(btrim(p_category)) not between 1 and 80
    or (p_publication_year is not null and p_publication_year not between 1000 and 9999)
    or p_copy_count is null or p_copy_count not between 1 and 500 then
    raise exception 'Library book details or copy count are invalid.'
      using errcode = '22023';
  end if;

  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_library', 'create') then
    raise exception 'You are not authorized to add library books at this campus.'
      using errcode = '42501';
  end if;

  insert into public.education_library_books (
    org_id, branch_id, isbn, title, author, publisher, category, publication_year, created_by
  ) values (
    p_org_id, p_branch_id, nullif(btrim(p_isbn), ''), btrim(p_title), btrim(p_author),
    nullif(btrim(p_publisher), ''), btrim(p_category), p_publication_year, auth.uid()
  ) returning id into book_id;

  insert into public.education_library_copies (org_id, branch_id, book_id, copy_number)
  select p_org_id, p_branch_id, book_id,
    'COPY-' || lpad(copy_index::text, 3, '0')
  from generate_series(1, p_copy_count) as copies(copy_index);

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_library_book_created', 'education_library_book', book_id,
    jsonb_build_object('branch_id', p_branch_id, 'title', btrim(p_title), 'copy_count', p_copy_count)
  );
  return book_id;
end;
$$;

create or replace function public.education_library_issue_copy(
  p_org_id uuid,
  p_branch_id uuid,
  p_copy_id uuid,
  p_student_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  copy_row public.education_library_copies%rowtype;
  student_row public.education_students%rowtype;
  active_loan_count integer;
  loan_id uuid;
begin
  if auth.uid() is null or p_copy_id is null or p_student_id is null then
    raise exception 'Select a copy and active student to issue a library loan.'
      using errcode = '22023';
  end if;
  if not public.education_can_access_branch(p_org_id, p_branch_id, 'education_library', 'create')
    or not public.education_can_access_branch(p_org_id, p_branch_id, 'education_students', 'view') then
    raise exception 'You are not authorized to issue library books at this campus.'
      using errcode = '42501';
  end if;

  select * into copy_row
  from public.education_library_copies
  where org_id = p_org_id and branch_id = p_branch_id and id = p_copy_id
  for update;
  if not found or copy_row.status <> 'available' then
    raise exception 'The selected copy is not available for loan.'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.education_library_books book
    where book.org_id = p_org_id and book.branch_id = p_branch_id
      and book.id = copy_row.book_id and book.status = 'active'
  ) then
    raise exception 'The active book or student was not found at this campus.'
      using errcode = 'P0002';
  end if;

  select * into student_row
  from public.education_students
  where org_id = p_org_id and branch_id = p_branch_id
    and id = p_student_id and status = 'active'
  for update;
  if not found then
    raise exception 'The active book or student was not found at this campus.'
      using errcode = 'P0002';
  end if;

  select count(*) into active_loan_count
  from public.education_library_loans loan
  where loan.org_id = p_org_id and loan.branch_id = p_branch_id
    and loan.student_id = p_student_id and loan.returned_on is null;
  if active_loan_count >= 5 or exists (
    select 1 from public.education_library_loans loan
    where loan.org_id = p_org_id and loan.branch_id = p_branch_id
      and loan.student_id = p_student_id and loan.returned_on is null
      and loan.due_on < current_date
  ) then
    raise exception 'The student has reached the loan limit or has overdue books.'
      using errcode = '22023';
  end if;

  insert into public.education_library_loans (
    org_id, branch_id, copy_id, student_id, loaned_on, due_on, issued_by
  ) values (
    p_org_id, p_branch_id, p_copy_id, p_student_id, current_date, current_date + 14, auth.uid()
  ) returning id into loan_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_library_copy_issued', 'education_library_loan', loan_id,
    jsonb_build_object('branch_id', p_branch_id, 'copy_id', p_copy_id, 'student_id', p_student_id, 'due_on', current_date + 14)
  );
  return loan_id;
end;
$$;

create or replace function public.education_library_renew_loan(
  p_org_id uuid,
  p_loan_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_row public.education_library_loans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to renew a library loan.'
      using errcode = '42501';
  end if;
  select * into loan_row
  from public.education_library_loans
  where org_id = p_org_id and id = p_loan_id
  for update;
  if not found then
    raise exception 'The library loan was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, loan_row.branch_id, 'education_library', 'edit') then
    raise exception 'You are not authorized to renew loans at this campus.'
      using errcode = '42501';
  end if;
  if loan_row.returned_on is not null or loan_row.renewal_count >= 1 or loan_row.due_on < current_date then
    raise exception 'This loan is returned, overdue, or has already been renewed.'
      using errcode = '22023';
  end if;

  update public.education_library_loans
  set due_on = due_on + 14, renewal_count = renewal_count + 1, updated_at = now()
  where org_id = p_org_id and id = p_loan_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_library_loan_renewed', 'education_library_loan', p_loan_id,
    jsonb_build_object('branch_id', loan_row.branch_id, 'previous_due_on', loan_row.due_on, 'new_due_on', loan_row.due_on + 14)
  );
  return true;
end;
$$;

create or replace function public.education_library_return_loan(
  p_org_id uuid,
  p_loan_id uuid
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  loan_row public.education_library_loans%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to return a library loan.'
      using errcode = '42501';
  end if;
  select * into loan_row
  from public.education_library_loans
  where org_id = p_org_id and id = p_loan_id
  for update;
  if not found then
    raise exception 'The library loan was not found.'
      using errcode = 'P0002';
  end if;
  if not public.education_can_access_branch(p_org_id, loan_row.branch_id, 'education_library', 'edit') then
    raise exception 'You are not authorized to return loans at this campus.'
      using errcode = '42501';
  end if;
  if loan_row.returned_on is not null then
    raise exception 'This library loan has already been returned.'
      using errcode = '22023';
  end if;

  update public.education_library_loans
  set returned_on = current_date, returned_by = auth.uid(), updated_at = now()
  where org_id = p_org_id and id = p_loan_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_library_copy_returned', 'education_library_loan', p_loan_id,
    jsonb_build_object('branch_id', loan_row.branch_id, 'copy_id', loan_row.copy_id, 'student_id', loan_row.student_id, 'returned_on', current_date)
  );
  return true;
end;
$$;

revoke all on function public.education_library_create_book(uuid, uuid, text, text, text, text, text, smallint, integer)
  from public, anon;
grant execute on function public.education_library_create_book(uuid, uuid, text, text, text, text, text, smallint, integer)
  to authenticated;
revoke all on function public.education_library_issue_copy(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.education_library_issue_copy(uuid, uuid, uuid, uuid) to authenticated;
revoke all on function public.education_library_renew_loan(uuid, uuid) from public, anon;
grant execute on function public.education_library_renew_loan(uuid, uuid) to authenticated;
revoke all on function public.education_library_return_loan(uuid, uuid) from public, anon;
grant execute on function public.education_library_return_loan(uuid, uuid) to authenticated;

grant select on public.education_library_books, public.education_library_copies, public.education_library_loans to authenticated;
revoke insert, update, delete on public.education_library_books, public.education_library_copies, public.education_library_loans from authenticated;
revoke all on public.education_library_books, public.education_library_copies, public.education_library_loans from anon;

commit;
