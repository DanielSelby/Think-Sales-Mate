-- Diagnostic: see what's currently registered for this bucket
select policyname, roles, cmd, with_check
from pg_policies
where tablename = 'objects' and schemaname = 'storage'
and policyname like '%voice note%';

-- Fix: drop the anon-scoped policy and recreate it scoped to "public"
-- instead, which removes any ambiguity about which Postgres role the
-- Supabase client actually authenticates as for anonymous requests.
drop policy if exists "Anyone can upload voice notes" on storage.objects;

create policy "Anyone can upload voice notes"
on storage.objects for insert
to public
with check (bucket_id = 'customer-order-attachments');

-- Also broaden the read policy the same way, for consistency
drop policy if exists "Public can read voice notes" on storage.objects;

create policy "Public can read voice notes"
on storage.objects for select
to public
using (bucket_id = 'customer-order-attachments');