-- Allow both participants to exchange WebRTC signaling metadata while keeping
-- the immutable call identity protected from client-side changes.
drop policy if exists "communication calls scoped members" on public.communication_calls;
create policy "communication calls scoped members"
  on public.communication_calls for all
  using (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  )
  with check (
    public.is_org_member(org_id)
    and (channel_id is null or public.communication_channel_visible(channel_id))
  );

create or replace function public.protect_communication_call_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.org_id is distinct from old.org_id
    or new.channel_id is distinct from old.channel_id
    or new.started_by is distinct from old.started_by
    or new.call_type is distinct from old.call_type
    or new.started_at is distinct from old.started_at then
    raise exception 'Call identity cannot be changed';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_communication_call_identity on public.communication_calls;
create trigger protect_communication_call_identity
before update on public.communication_calls
for each row execute function public.protect_communication_call_identity();

-- Merge signaling atomically so concurrent ICE candidates cannot overwrite
-- each other through client-side read/modify/write cycles.
create or replace function public.merge_communication_call_metadata(
  p_call_id uuid,
  p_patch jsonb default '{}'::jsonb,
  p_candidate_key text default null,
  p_candidate jsonb default null
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.communication_calls
  set metadata = case
    when p_candidate_key is not null and p_candidate is not null then
      jsonb_set(
        coalesce(metadata, '{}'::jsonb),
        array[p_candidate_key],
        coalesce(metadata -> p_candidate_key, '[]'::jsonb) || jsonb_build_array(p_candidate),
        true
      ) || coalesce(p_patch, '{}'::jsonb)
    else coalesce(metadata, '{}'::jsonb) || coalesce(p_patch, '{}'::jsonb)
  end
  where id = p_call_id;
end;
$$;
