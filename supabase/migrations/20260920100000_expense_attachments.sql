create table if not exists public.expense_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  expense_id uuid not null references public.expenses(id) on delete cascade,
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_expense_attachments_expense
  on public.expense_attachments(org_id, expense_id, created_at desc);

alter table public.expense_attachments enable row level security;

drop policy if exists "expense attachments: members can read" on public.expense_attachments;
create policy "expense attachments: members can read"
  on public.expense_attachments for select
  using (public.is_org_member(org_id));

drop policy if exists "expense attachments: members can insert" on public.expense_attachments;
create policy "expense attachments: members can insert"
  on public.expense_attachments for insert
  with check (public.is_org_member(org_id) and uploaded_by = auth.uid());

insert into storage.buckets (id, name, public)
values ('expense-attachments', 'expense-attachments', false)
on conflict (id) do nothing;

drop policy if exists "expense attachments: upload" on storage.objects;
create policy "expense attachments: upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'expense-attachments'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "expense attachments: read" on storage.objects;
create policy "expense attachments: read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'expense-attachments'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );

drop policy if exists "expense attachments: delete" on storage.objects;
create policy "expense attachments: delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'expense-attachments'
    and public.is_org_member((storage.foldername(name))[1]::uuid)
  );
