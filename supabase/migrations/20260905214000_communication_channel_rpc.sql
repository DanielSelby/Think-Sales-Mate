create or replace function public.create_communication_channel(
  p_org_id uuid,
  p_name text,
  p_channel_type text,
  p_location_id uuid default null
)
returns setof public.communication_channels
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.communication_org_member(p_org_id, auth.uid()) then
    raise exception 'You are not an active member of this organization';
  end if;

  return query
    insert into public.communication_channels (
      org_id, name, channel_type, location_id, created_by
    )
    values (
      p_org_id, trim(p_name), p_channel_type, p_location_id, auth.uid()
    )
    returning *;
end;
$$;

revoke all on function public.create_communication_channel(uuid, text, text, uuid) from public;
grant execute on function public.create_communication_channel(uuid, text, text, uuid) to authenticated;
