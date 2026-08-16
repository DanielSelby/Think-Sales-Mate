-- Fixes: "insert or update on table held_sales violates foreign key
-- constraint held_sales_created_by_fkey" (and the same latent risk on
-- sale_return_items, expense_categories, attendance, leave_requests —
-- every table with created_by uuid references public.profiles(id)).
--
-- Root cause: those columns reference profiles(id), which is populated by
-- the on_auth_user_created trigger (see 0001_core_schema.sql) — but any
-- auth.users row created before that trigger existed (or via a path that
-- somehow didn't fire it) has no matching profiles row, so the very first
-- insert that references profiles(id) for that user fails the FK check.

begin;

-- 1. Backfill: give every existing auth user a profile row if they don't
--    already have one.
insert into public.profiles (id, full_name)
select u.id, u.raw_user_meta_data ->> 'full_name'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

-- 2. Harden the trigger function itself so it can never fail/skip a user
--    again — "on conflict do nothing" makes it safe even if it somehow
--    fires twice for the same id.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

-- 3. profiles only ever had SELECT/UPDATE policies (see 0001_core_schema.sql)
--    — there was no INSERT policy at all. That's fine for the trigger above
--    (it runs `security definer`, which bypasses RLS), but the app also has
--    a client-side self-heal (ensureProfile in pos/actions.ts) that upserts
--    a missing profile using the regular anon-key + user-session client,
--    which IS subject to RLS. Without this, that self-heal silently no-ops
--    via RLS in exactly the case it exists to fix.
create policy "profiles: user inserts own row"
  on public.profiles for insert
  with check (id = auth.uid());

commit;