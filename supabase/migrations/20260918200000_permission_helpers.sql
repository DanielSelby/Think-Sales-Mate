-- Central permission predicate for RLS policies.  Server actions remain the
-- primary enforcement point, while this prevents broad member-only policies
-- from bypassing an explicitly configured matrix.
create or replace function public.has_org_permission(
  target_org_id uuid,
  target_module text,
  target_action text
) returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.organization_members member
    left join public.organization_role_templates template
      on template.org_id = member.org_id
     and template.role_key = member.role::text
    where member.org_id = target_org_id
      and member.user_id = auth.uid()
      and member.status = 'active'
      and (
        member.role = 'owner'
        or coalesce(member.access_permissions -> 'permissions' -> target_module, '[]'::jsonb)
             ? target_action
        or (
          coalesce(member.access_permissions ->> 'role_key', member.role::text) = template.role_key
          and coalesce(template.permissions -> target_module, '[]'::jsonb) ? target_action
        )
      )
  );
$$;

grant execute on function public.has_org_permission(uuid, text, text) to authenticated;

drop policy if exists "expenses: authorized members can record" on public.expenses;
create policy "expenses: authorized members can record"
  on public.expenses for insert
  with check (
    recorded_by = auth.uid()
    and public.has_org_permission(org_id, 'expenses', 'create')
  );
