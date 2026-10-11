begin;

create policy "profiles: members can read active org member profiles"
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_members as profile_member
      where profile_member.user_id = profiles.id
        and profile_member.status = 'active'
        and public.is_org_member(profile_member.org_id)
    )
  );

commit;
