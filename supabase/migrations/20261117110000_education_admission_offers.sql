create table if not exists public.education_admission_offers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  branch_id uuid not null,
  admission_id uuid not null,
  offer_number integer not null check (offer_number > 0),
  expires_on date not null,
  terms text not null default '' check (char_length(btrim(terms)) <= 2000),
  status text not null default 'offered'
    check (status in ('offered', 'accepted', 'declined', 'expired', 'withdrawn')),
  issued_by uuid not null references auth.users(id) on delete restrict,
  issued_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (org_id, id),
  unique (org_id, admission_id, offer_number),
  foreign key (org_id, admission_id)
    references public.education_admissions(org_id, id) on delete restrict
);

create unique index if not exists education_admission_offers_one_open_idx
  on public.education_admission_offers (org_id, admission_id)
  where status = 'offered';
create index if not exists education_admission_offers_branch_issued_idx
  on public.education_admission_offers (org_id, branch_id, issued_at desc);

alter table public.education_admission_offers enable row level security;

create policy "education admission offers read"
  on public.education_admission_offers for select
  using (
    exists (
      select 1
      from public.education_admissions application
      where application.org_id = education_admission_offers.org_id
        and application.id = education_admission_offers.admission_id
        and public.education_can_access_branch(
          application.org_id, application.branch_id, 'education_admissions', 'view'
        )
    )
  );

revoke all on public.education_admission_offers from anon, authenticated;
grant select on public.education_admission_offers to authenticated;

create or replace function public.education_issue_admission_offer(
  p_org_id uuid,
  p_admission_id uuid,
  p_expires_on date,
  p_terms text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  admission_row public.education_admissions%rowtype;
  open_offer public.education_admission_offers%rowtype;
  next_offer_number integer;
  offer_id uuid;
begin
  if auth.uid() is null or p_org_id is null or p_admission_id is null
    or p_expires_on is null or p_expires_on < current_date
    or p_expires_on > current_date + 365
    or char_length(btrim(coalesce(p_terms, ''))) > 2000 then
    raise exception 'Admission offer details are invalid.'
      using errcode = '22023';
  end if;

  select * into admission_row
  from public.education_admissions
  where org_id = p_org_id and id = p_admission_id
  for update;
  if not found then
    raise exception 'The application was not found.'
      using errcode = 'P0002';
  end if;
  if admission_row.status <> 'under_review' then
    raise exception 'Offers can only be issued to applications under review.'
      using errcode = '22023';
  end if;
  if not public.education_can_access_branch(
      p_org_id, admission_row.branch_id, 'education_admissions', 'edit'
    )
    or not public.education_can_access_branch(
      p_org_id, admission_row.branch_id, 'education_admissions', 'approve'
    ) then
    raise exception 'You cannot issue admission offers at this campus.'
      using errcode = '42501';
  end if;

  select * into open_offer
  from public.education_admission_offers
  where org_id = p_org_id and admission_id = p_admission_id and status = 'offered'
  for update;
  if found then
    if open_offer.expires_on >= current_date then
      raise exception 'An unexpired offer already exists for this application.'
        using errcode = '22023';
    end if;
    update public.education_admission_offers
    set status = 'expired',
        responded_at = now()
    where id = open_offer.id;
  end if;

  select coalesce(max(offer_number), 0) + 1 into next_offer_number
  from public.education_admission_offers
  where org_id = p_org_id and admission_id = p_admission_id;

  insert into public.education_admission_offers (
    org_id, branch_id, admission_id, offer_number, expires_on, terms, issued_by
  ) values (
    p_org_id, admission_row.branch_id, p_admission_id, next_offer_number,
    p_expires_on, btrim(coalesce(p_terms, '')), auth.uid()
  ) returning id into offer_id;

  insert into public.audit_logs (org_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    p_org_id, auth.uid(), 'education_admission_offer_issued',
    'education_admission', p_admission_id,
    jsonb_build_object(
      'branch_id', admission_row.branch_id,
      'offer_id', offer_id,
      'offer_number', next_offer_number,
      'expires_on', p_expires_on
    )
  );

  return offer_id;
end;
$$;

create or replace function public.education_guard_admission_offer_transition()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  offer_row public.education_admission_offers%rowtype;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then
    return new;
  end if;

  select * into offer_row
  from public.education_admission_offers
  where org_id = new.org_id and admission_id = new.id and status = 'offered'
  for update;

  if new.status = 'admitted' then
    if old.status <> 'under_review' or not found or offer_row.expires_on < current_date then
      raise exception 'An unexpired offer must be issued before admitting this applicant.'
        using errcode = '22023';
    end if;
    update public.education_admission_offers
    set status = 'accepted',
        responded_at = now()
    where id = offer_row.id;
  elsif new.status = 'rejected' and found then
    update public.education_admission_offers
    set status = case when offer_row.expires_on < current_date then 'expired' else 'declined' end,
        responded_at = now()
    where id = offer_row.id;
  elsif new.status = 'withdrawn' and found then
    update public.education_admission_offers
    set status = 'withdrawn',
        responded_at = now()
    where id = offer_row.id;
  end if;

  return new;
end;
$$;

drop trigger if exists education_admission_offer_transition_guard on public.education_admissions;
create trigger education_admission_offer_transition_guard
  before update of status on public.education_admissions
  for each row execute function public.education_guard_admission_offer_transition();

revoke all on function public.education_issue_admission_offer(uuid, uuid, date, text) from public, anon;
grant execute on function public.education_issue_admission_offer(uuid, uuid, date, text) to authenticated;
revoke all on function public.education_guard_admission_offer_transition() from public, anon;
