create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  model text not null check (length(model) between 1 and 100),
  status text not null default 'pending' check (status in ('pending', 'succeeded', 'failed')),
  input_tokens integer not null default 0 check (input_tokens >= 0),
  output_tokens integer not null default 0 check (output_tokens >= 0),
  latency_ms integer not null default 0 check (latency_ms >= 0),
  error_code text check (error_code is null or length(error_code) <= 50),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create index ai_usage_events_org_created_idx
  on public.ai_usage_events (org_id, created_at desc);
create index ai_usage_events_user_created_idx
  on public.ai_usage_events (org_id, user_id, created_at desc);

alter table public.ai_usage_events enable row level security;
revoke all on public.ai_usage_events from public, anon, authenticated;
grant select, insert, update on public.ai_usage_events to service_role;

create or replace function public.reserve_ai_usage_request(
  p_org_id uuid,
  p_user_id uuid,
  p_model text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_id uuid;
  user_requests_last_hour bigint;
  org_requests_today bigint;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can reserve AI usage.';
  end if;
  if p_org_id is null or p_user_id is null or p_model is null or length(p_model) not between 1 and 100 then
    raise exception 'Invalid AI usage reservation.';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('ai-org:' || p_org_id::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('ai-user:' || p_org_id::text || ':' || p_user_id::text, 0));

  select count(*) into user_requests_last_hour
  from public.ai_usage_events
  where org_id = p_org_id
    and user_id = p_user_id
    and created_at >= now() - interval '1 hour';

  select count(*) into org_requests_today
  from public.ai_usage_events
  where org_id = p_org_id
    and created_at >= date_trunc('day', now());

  if user_requests_last_hour >= 20 or org_requests_today >= 300 then
    return null;
  end if;

  insert into public.ai_usage_events (org_id, user_id, model)
  values (p_org_id, p_user_id, p_model)
  returning id into request_id;
  return request_id;
end;
$$;

revoke all on function public.reserve_ai_usage_request(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_ai_usage_request(uuid, uuid, text) to service_role;

create or replace function public.get_ai_usage_summary(p_org_id uuid)
returns table (
  total_requests bigint,
  successful_requests bigint,
  failed_requests bigint,
  input_tokens bigint,
  output_tokens bigint,
  average_latency_ms numeric,
  recent_errors jsonb
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Only the service role can read AI usage summaries.';
  end if;
  if p_org_id is null then
    raise exception 'An organization is required.';
  end if;

  return query
  select
    count(*)::bigint,
    count(*) filter (where status = 'succeeded')::bigint,
    count(*) filter (where status = 'failed')::bigint,
    coalesce(sum(ai_usage_events.input_tokens), 0)::bigint,
    coalesce(sum(ai_usage_events.output_tokens), 0)::bigint,
    coalesce(avg(ai_usage_events.latency_ms) filter (where status <> 'pending'), 0)::numeric,
    coalesce((
      select jsonb_object_agg(error_counts.error_code, error_counts.request_count)
      from (
        select error_code, count(*)::bigint as request_count
        from public.ai_usage_events
        where org_id = p_org_id
          and created_at >= now() - interval '30 days'
          and status = 'failed'
          and error_code is not null
        group by error_code
        order by count(*) desc
        limit 5
      ) error_counts
    ), '{}'::jsonb)
  from public.ai_usage_events
  where org_id = p_org_id
    and created_at >= now() - interval '30 days';
end;
$$;

revoke all on function public.get_ai_usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.get_ai_usage_summary(uuid) to service_role;
