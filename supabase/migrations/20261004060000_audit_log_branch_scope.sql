begin;

-- Audit events without branch metadata are organization-wide and remain
-- visible only to members with all-branch access.
drop policy if exists "audit_logs: branch scope" on public.audit_logs;
create policy "audit_logs: branch scope"
  on public.audit_logs as restrictive for select
  using (
    public.has_org_role(org_id, 'owner')
    or exists (
      select 1
      from public.organization_members as member
      where member.org_id = audit_logs.org_id
        and member.user_id = auth.uid()
        and member.status = 'active'
        and (
          member.branch_scope = 'all'
          or lower(coalesce(member.access_permissions ->> 'role_key', '')) in ('owner', 'super_admin')
          or coalesce(metadata ->> 'branch_id', metadata ->> 'location_id') = member.location_id::text
          or exists (
            select 1
            from unnest(member.secondary_location_ids) as assigned_location(location_id)
            where assigned_location.location_id::text =
              coalesce(metadata ->> 'branch_id', metadata ->> 'location_id')
          )
        )
    )
  );

commit;
