create unique index if not exists customers_org_id_id_key
  on public.customers (org_id, id);
create unique index if not exists business_locations_org_id_id_key
  on public.business_locations (org_id, id);

create table if not exists public.service_categories (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid,
  name text not null,
  description text,
  default_duration_minutes integer not null default 60 check (default_duration_minutes between 1 and 10080),
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, location_id, name),
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete cascade
);

create table if not exists public.service_assets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  customer_id uuid not null,
  asset_type text not null check (length(trim(asset_type)) between 1 and 80),
  brand text,
  model text,
  serial_number text,
  condition text,
  notes text,
  warranty_provider text check (warranty_provider is null or length(warranty_provider) <= 120),
  warranty_reference text check (warranty_reference is null or length(warranty_reference) <= 120),
  warranty_start_date date,
  warranty_end_date date,
  warranty_terms text check (warranty_terms is null or length(warranty_terms) <= 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (warranty_start_date is null and warranty_end_date is null)
    or (warranty_start_date is not null and warranty_end_date is not null and warranty_end_date >= warranty_start_date)
  ),
  unique (org_id, id),
  unique (org_id, location_id, customer_id, id),
  foreign key (org_id, customer_id) references public.customers(org_id, id) on delete restrict,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.service_technicians (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  user_id uuid not null,
  skills text[] not null default '{}',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, location_id, id),
  unique (org_id, location_id, user_id),
  foreign key (org_id, user_id) references public.organization_members(org_id, user_id) on delete cascade,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_number text not null,
  customer_id uuid not null,
  asset_id uuid,
  category_id uuid,
  technician_id uuid,
  status text not null default 'received' check (status in (
    'received', 'inspection', 'awaiting_quotation', 'awaiting_customer_approval',
    'approved', 'rejected', 'in_progress', 'awaiting_parts', 'quality_check',
    'ready_for_collection', 'awaiting_payment', 'completed', 'closed', 'cancelled'
  )),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  reported_problem text not null check (length(trim(reported_problem)) between 1 and 4000),
  condition_on_arrival text not null check (length(trim(condition_on_arrival)) between 1 and 1000),
  accessories text[] not null default '{}',
  intake_confirmed_by text not null check (length(trim(intake_confirmed_by)) between 1 and 120),
  intake_confirmed_as text not null check (intake_confirmed_as in ('customer', 'authorized_representative')),
  intake_confirmed_at timestamptz not null default now(),
  diagnosis text,
  recommended_work text,
  internal_notes text,
  customer_notes text,
  expected_completion_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, location_id, id),
  unique (org_id, location_id, customer_id, id),
  unique (org_id, job_number),
  foreign key (org_id, customer_id) references public.customers(org_id, id) on delete restrict,
  foreign key (org_id, location_id, customer_id, asset_id)
    references public.service_assets(org_id, location_id, customer_id, id) on delete restrict,
  foreign key (org_id, category_id) references public.service_categories(org_id, id) on delete restrict,
  foreign key (org_id, location_id, technician_id)
    references public.service_technicians(org_id, location_id, id) on delete restrict,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.service_job_status_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  previous_status text,
  new_status text not null,
  note text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete cascade,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.service_job_customer_contacts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  direction text not null check (direction in ('incoming', 'outgoing')),
  method text not null check (method in ('phone', 'email', 'sms', 'whatsapp', 'in_person', 'other')),
  outcome text not null check (outcome in ('completed', 'no_answer', 'left_message', 'follow_up_needed', 'other')),
  details text not null check (length(trim(details)) between 1 and 2000),
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, job_id)
  references public.service_jobs(org_id, location_id, id) on delete cascade
);

create table if not exists public.service_appointments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  customer_id uuid not null,
  asset_id uuid,
  technician_id uuid,
  job_id uuid,
  title text not null check (length(trim(title)) between 1 and 160),
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled'
  check (status in ('scheduled', 'confirmed', 'completed', 'cancelled', 'no_show')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, location_id, id),
  check (ends_at > starts_at),
  check (ends_at - starts_at <= interval '24 hours'),
  foreign key (org_id, customer_id) references public.customers(org_id, id) on delete restrict,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict,
  foreign key (org_id, location_id, customer_id, asset_id)
  references public.service_assets(org_id, location_id, customer_id, id) on delete restrict,
  foreign key (org_id, location_id, technician_id)
  references public.service_technicians(org_id, location_id, id) on delete restrict,
  foreign key (org_id, location_id, customer_id, job_id)
  references public.service_jobs(org_id, location_id, customer_id, id) on delete restrict
);

create table if not exists public.service_appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  appointment_id uuid not null,
  previous_status text,
  new_status text not null,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, appointment_id)
  references public.service_appointments(org_id, location_id, id) on delete cascade,
  foreign key (org_id, location_id) references public.business_locations(org_id, id) on delete restrict
);

create table if not exists public.service_quotations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  version integer not null check (version > 0),
  status text not null default 'draft'
    check (status in ('draft', 'sent', 'approved', 'rejected', 'superseded', 'withdrawn')),
  notes text,
  subtotal numeric(16, 2) not null check (subtotal >= 0),
  tax_rate numeric(5, 2) not null default 0 check (tax_rate between 0 and 100),
  tax_amount numeric(16, 2) not null check (tax_amount >= 0),
  total numeric(16, 2) not null check (total >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_note text,
  decided_at timestamptz,
  decision_note text,
  unique (org_id, location_id, id),
  unique (org_id, job_id, version),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete cascade
);

create table if not exists public.service_quotation_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  location_id uuid not null,
  quotation_id uuid not null,
  description text not null check (length(trim(description)) between 1 and 200),
  quantity numeric(10, 2) not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(16, 2) generated always as (round(quantity * unit_price, 2)) stored,
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, quotation_id)
    references public.service_quotations(org_id, location_id, id) on delete cascade
);

create table if not exists public.service_quotation_status_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  location_id uuid not null,
  quotation_id uuid not null,
  previous_status text,
  new_status text not null,
  note text,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, quotation_id)
    references public.service_quotations(org_id, location_id, id) on delete cascade
);

create unique index if not exists products_org_id_service_key
  on public.products (org_id, id);

create unique index if not exists service_quotations_org_job_id_key
  on public.service_quotations (org_id, job_id, id);

alter table public.invoices
  add column if not exists source_service_job_id uuid,
  add column if not exists source_service_quotation_id uuid;

alter table public.invoices
  add constraint invoices_service_quote_source_fk
    foreign key (org_id, source_service_job_id, source_service_quotation_id)
    references public.service_quotations(org_id, job_id, id)
    on delete restrict,
  add constraint invoices_service_source_complete_check
    check (
      (source_service_job_id is null and source_service_quotation_id is null)
      or (source_service_job_id is not null and source_service_quotation_id is not null)
    );

create unique index if not exists invoices_one_active_service_job_idx
  on public.invoices (org_id, source_service_job_id)
  where source_service_job_id is not null and status <> 'void';

create table if not exists public.service_job_part_movements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('issued', 'returned')),
  related_issue_id uuid,
  quantity integer not null check (quantity > 0),
  returned_quantity integer not null default 0 check (returned_quantity between 0 and quantity),
  unit_cost numeric(12, 2) not null default 0 check (unit_cost >= 0),
  note text,
  actor_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, location_id, job_id, id),
  check (
    (movement_type = 'issued' and related_issue_id is null)
    or (movement_type = 'returned' and related_issue_id is not null)
  ),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete cascade,
  foreign key (org_id, product_id)
    references public.products(org_id, id) on delete restrict,
  foreign key (org_id, location_id, job_id, related_issue_id)
    references public.service_job_part_movements(org_id, location_id, job_id, id) on delete restrict
);

create index if not exists service_categories_org_idx
  on public.service_categories (org_id, location_id, is_active, name);
create index if not exists service_assets_customer_idx
  on public.service_assets (org_id, customer_id, location_id);
create unique index if not exists service_assets_serial_per_branch_key
  on public.service_assets (org_id, location_id, lower(serial_number))
  where serial_number is not null and length(trim(serial_number)) > 0;
create index if not exists service_technicians_location_idx
  on public.service_technicians (org_id, location_id, is_active);
create index if not exists service_jobs_board_idx
  on public.service_jobs (org_id, location_id, status, created_at desc);
create index if not exists service_jobs_customer_idx
  on public.service_jobs (org_id, customer_id, created_at desc);
create index if not exists service_job_history_job_idx
  on public.service_job_status_history (org_id, job_id, created_at);
create index if not exists service_job_customer_contacts_job_idx
  on public.service_job_customer_contacts (org_id, location_id, job_id, created_at desc);
create index if not exists service_appointments_schedule_idx
  on public.service_appointments (org_id, location_id, starts_at)
  where status in ('scheduled', 'confirmed');
create index if not exists service_appointments_customer_idx
  on public.service_appointments (org_id, customer_id, starts_at desc);
create index if not exists service_appointments_technician_idx
  on public.service_appointments (org_id, location_id, technician_id, starts_at)
  where technician_id is not null and status in ('scheduled', 'confirmed');
create index if not exists service_appointment_history_idx
  on public.service_appointment_status_history (org_id, appointment_id, created_at);
create index if not exists service_quotations_job_idx
  on public.service_quotations (org_id, location_id, job_id, version desc);

create unique index if not exists communication_message_history_service_estimate_delivery_idx
  on public.communication_message_history (org_id, customer_id, event)
  where event like 'Service estimate:%' and status in ('Pending', 'Sent');
create index if not exists service_quotation_items_quote_idx
  on public.service_quotation_items (org_id, quotation_id);
create index if not exists service_quotation_history_idx
  on public.service_quotation_status_history (org_id, quotation_id, created_at);
create index if not exists service_job_part_movements_job_idx
  on public.service_job_part_movements (org_id, location_id, job_id, created_at desc);
create index if not exists service_job_part_movements_product_idx
  on public.service_job_part_movements (org_id, product_id, location_id, created_at desc);
create index if not exists service_job_part_movements_issue_idx
  on public.service_job_part_movements (related_issue_id, created_at)
  where movement_type = 'returned';

create or replace function public.touch_service_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger service_categories_touch_updated_at
  before update on public.service_categories
  for each row execute function public.touch_service_updated_at();
create trigger service_assets_touch_updated_at
  before update on public.service_assets
  for each row execute function public.touch_service_updated_at();
create trigger service_technicians_touch_updated_at
  before update on public.service_technicians
  for each row execute function public.touch_service_updated_at();
create trigger service_jobs_touch_updated_at
  before update on public.service_jobs
  for each row execute function public.touch_service_updated_at();
create trigger service_appointments_touch_updated_at
  before update on public.service_appointments
  for each row execute function public.touch_service_updated_at();

create or replace function public.prevent_service_technician_appointment_overlap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.technician_id is null or new.status not in ('scheduled', 'confirmed') then
    return new;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(new.org_id::text || ':' || new.technician_id::text, 0)
  );
  if exists (
    select 1
    from public.service_appointments appointment
    where appointment.org_id = new.org_id
      and appointment.technician_id = new.technician_id
      and appointment.id is distinct from new.id
      and appointment.status in ('scheduled', 'confirmed')
      and appointment.starts_at < new.ends_at
      and appointment.ends_at > new.starts_at
  ) then
    raise exception 'The technician already has an appointment during this time';
  end if;
  return new;
end;
$$;

create trigger service_technician_appointment_no_overlap
  before insert or update of technician_id, starts_at, ends_at, status
  on public.service_appointments
  for each row execute function public.prevent_service_technician_appointment_overlap();

alter table public.service_categories enable row level security;
alter table public.service_assets enable row level security;
alter table public.service_technicians enable row level security;
alter table public.service_jobs enable row level security;
alter table public.service_job_status_history enable row level security;
alter table public.service_job_customer_contacts enable row level security;
alter table public.service_appointments enable row level security;
alter table public.service_appointment_status_history enable row level security;
alter table public.service_quotations enable row level security;
alter table public.service_quotation_items enable row level security;
alter table public.service_quotation_status_history enable row level security;
alter table public.service_job_part_movements enable row level security;

create or replace function public.is_active_service_member_at_location(
  target_org_id uuid,
  target_user_id uuid,
  target_location_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.can_access_org_location(target_org_id, target_location_id)
    and (
      public.has_org_permission(target_org_id, 'service_jobs', 'create')
      or public.has_org_permission(target_org_id, 'service_jobs', 'edit')
      or public.has_org_permission(target_org_id, 'service_appointments', 'create')
      or public.has_org_permission(target_org_id, 'service_appointments', 'edit')
      or public.has_org_permission(target_org_id, 'service_technicians', 'create')
      or public.has_org_permission(target_org_id, 'service_technicians', 'edit')
    )
    and exists (
    select 1
    from public.organization_members member
    where member.org_id = target_org_id
      and member.user_id = target_user_id
      and member.status = 'active'
      and (
        member.branch_scope = 'all'
        or member.location_id = target_location_id
        or target_location_id = any(member.secondary_location_ids)
      )
  );
$$;

create or replace function public.is_active_service_technician(
  target_org_id uuid,
  target_location_id uuid,
  target_technician_id uuid
)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.can_access_org_location(target_org_id, target_location_id)
    and (
      public.has_org_permission(target_org_id, 'service_jobs', 'create')
      or public.has_org_permission(target_org_id, 'service_jobs', 'edit')
      or public.has_org_permission(target_org_id, 'service_appointments', 'create')
      or public.has_org_permission(target_org_id, 'service_appointments', 'edit')
    )
    and exists (
    select 1
    from public.service_technicians technician
    where technician.org_id = target_org_id
      and technician.location_id = target_location_id
      and technician.id = target_technician_id
      and technician.is_active
      and public.is_active_service_member_at_location(
        technician.org_id, technician.user_id, technician.location_id
      )
  );
$$;

revoke all on function public.is_active_service_member_at_location(uuid, uuid, uuid) from public, anon;
revoke all on function public.is_active_service_technician(uuid, uuid, uuid) from public, anon;
grant execute on function public.is_active_service_member_at_location(uuid, uuid, uuid) to authenticated;
grant execute on function public.is_active_service_technician(uuid, uuid, uuid) to authenticated;

create policy "service categories: scoped members can read"
  on public.service_categories for select
  using (
    public.is_org_member(org_id)
    and (location_id is null or public.can_access_org_location(org_id, location_id))
    and public.has_org_permission(org_id, 'service_settings', 'view')
  );
create policy "service categories: authorized members can create"
  on public.service_categories for insert
  with check (
    created_by = auth.uid()
    and (location_id is null or public.can_access_org_location(org_id, location_id))
    and public.has_org_permission(org_id, 'service_settings', 'create')
  );
create policy "service categories: authorized members can update"
  on public.service_categories for update
  using (
    (location_id is null or public.can_access_org_location(org_id, location_id))
    and public.has_org_permission(org_id, 'service_settings', 'edit')
  )
  with check (
    (location_id is null or public.can_access_org_location(org_id, location_id))
    and public.has_org_permission(org_id, 'service_settings', 'edit')
  );

create policy "service assets: branch-scoped members can read"
  on public.service_assets for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_assets', 'view')
  );
create policy "service appointment members can read linked equipment"
  on public.service_assets for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and (
      public.has_org_permission(org_id, 'service_appointments', 'view')
      or public.has_org_permission(org_id, 'service_appointments', 'create')
    )
  );
create policy "service assets: authorized members can create"
  on public.service_assets for insert
  with check (
    created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_assets', 'create')
  );
create policy "service assets: authorized members can update"
  on public.service_assets for update
  using (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_assets', 'edit')
  )
  with check (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_assets', 'edit')
  );

create policy "service technicians: branch-scoped members can read"
  on public.service_technicians for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_technicians', 'view')
  );
create policy "service appointment members can read available technicians"
  on public.service_technicians for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and is_active
    and (
      public.has_org_permission(org_id, 'service_appointments', 'view')
      or public.has_org_permission(org_id, 'service_appointments', 'create')
    )
  );
create policy "service technicians: authorized managers can create"
  on public.service_technicians for insert
  with check (
    created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and public.is_active_service_member_at_location(org_id, user_id, location_id)
    and public.has_org_permission(org_id, 'service_technicians', 'create')
  );
create policy "service technicians: authorized managers can update"
  on public.service_technicians for update
  using (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_technicians', 'edit')
  )
  with check (
    public.can_access_org_location(org_id, location_id)
    and public.is_active_service_member_at_location(org_id, user_id, location_id)
    and public.has_org_permission(org_id, 'service_technicians', 'edit')
  );

create policy "service jobs: branch-scoped members can read"
  on public.service_jobs for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service jobs: authorized members can create"
  on public.service_jobs for insert
  with check (
    created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and (
      technician_id is null
      or public.is_active_service_technician(org_id, location_id, technician_id)
    )
    and public.has_org_permission(org_id, 'service_jobs', 'create')
  );
create policy "service jobs: authorized members can update"
  on public.service_jobs for update
  using (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'edit')
  )
  with check (
    public.can_access_org_location(org_id, location_id)
    and (
      technician_id is null
      or public.is_active_service_technician(org_id, location_id, technician_id)
    )
    and public.has_org_permission(org_id, 'service_jobs', 'edit')
  );

create policy "service job history: branch-scoped members can read"
  on public.service_job_status_history for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service customer contacts: branch-scoped members can read"
  on public.service_job_customer_contacts for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service customer contacts: authorized members can create"
  on public.service_job_customer_contacts for insert
  with check (
    actor_id = auth.uid()
    and public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'edit')
  );

create policy "service appointments: branch-scoped members can read"
  on public.service_appointments for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_appointments', 'view')
  );
create policy "service appointments: authorized members can create"
  on public.service_appointments for insert
  with check (
    created_by = auth.uid()
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_appointments', 'create')
    and (
      technician_id is null
      or public.is_active_service_technician(org_id, location_id, technician_id)
    )
  );
create policy "service appointments: authorized members can update"
  on public.service_appointments for update
  using (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_appointments', 'edit')
  )
  with check (
    public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_appointments', 'edit')
    and (
      technician_id is null
      or public.is_active_service_technician(org_id, location_id, technician_id)
    )
  );
create policy "service appointment history: branch-scoped members can read"
  on public.service_appointment_status_history for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_appointments', 'view')
  );
create policy "service quotations: branch-scoped members can read"
  on public.service_quotations for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service quotation items: branch-scoped members can read"
  on public.service_quotation_items for select
  using (
    exists (
      select 1
      from public.service_quotations quotation
      where quotation.org_id = service_quotation_items.org_id
        and quotation.location_id = service_quotation_items.location_id
        and quotation.id = service_quotation_items.quotation_id
        and public.is_org_member(quotation.org_id)
        and public.can_access_org_location(quotation.org_id, quotation.location_id)
        and public.has_org_permission(quotation.org_id, 'service_jobs', 'view')
    )
  );
create policy "service quotation history: branch-scoped members can read"
  on public.service_quotation_status_history for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );
create policy "service job parts: authorized members can read"
  on public.service_job_part_movements for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
    and public.has_org_permission(org_id, 'inventory', 'view')
  );

revoke all on table public.service_quotations, public.service_quotation_items,
  public.service_quotation_status_history from anon, authenticated;
grant select on table public.service_quotations, public.service_quotation_items,
  public.service_quotation_status_history to authenticated;
revoke all on table public.service_job_customer_contacts from anon, authenticated;
grant select, insert on table public.service_job_customer_contacts to authenticated;
revoke all on table public.service_job_part_movements from anon, authenticated;
grant select on table public.service_job_part_movements to authenticated;

create or replace function public.record_service_quotation_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.service_quotation_status_history (
    org_id, location_id, quotation_id, previous_status, new_status, actor_id
  ) values (
    new.org_id, new.location_id, new.id, null, new.status, auth.uid()
  );
  return new;
end;
$$;

create trigger service_quotation_initial_status_history
  after insert on public.service_quotations
  for each row execute function public.record_service_quotation_initial_status();

create or replace function public.prevent_direct_service_appointment_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and current_user <> pg_catalog.pg_get_userbyid(
       (select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid)
     ) then
    raise exception 'Service appointment status must be changed through the transition workflow';
  end if;
  return new;
end;
$$;

create trigger service_appointment_status_transition_guard
  before update of status on public.service_appointments
  for each row execute function public.prevent_direct_service_appointment_status_change();

create or replace function public.record_service_appointment_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.service_appointment_status_history (
    org_id, location_id, appointment_id, previous_status, new_status, actor_id
  ) values (
    new.org_id, new.location_id, new.id, null, new.status, auth.uid()
  );
  return new;
end;
$$;

create trigger service_appointment_initial_status_history
  after insert on public.service_appointments
  for each row execute function public.record_service_appointment_initial_status();

create or replace function public.transition_service_appointment(
  p_appointment_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  appointment_row public.service_appointments%rowtype;
  transition_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_new_status is null or p_new_status not in (
    'scheduled', 'confirmed', 'completed', 'cancelled', 'no_show'
  ) then
    raise exception 'Unknown service appointment status';
  end if;

  select * into appointment_row
  from public.service_appointments
  where id = p_appointment_id
  for update;
  if not found then
    raise exception 'Service appointment not found';
  end if;
  if not public.is_org_member(appointment_row.org_id)
     or not public.can_access_org_location(appointment_row.org_id, appointment_row.location_id)
     or not public.has_org_permission(appointment_row.org_id, 'service_appointments', 'edit') then
    raise exception 'You do not have permission to change this appointment';
  end if;

  transition_allowed := case appointment_row.status
    when 'scheduled' then p_new_status in ('confirmed', 'cancelled', 'no_show')
    when 'confirmed' then p_new_status in ('completed', 'cancelled', 'no_show')
    else false
  end;
  if not transition_allowed then
    raise exception 'Appointment cannot transition from % to %', appointment_row.status, p_new_status;
  end if;

  update public.service_appointments
  set status = p_new_status, updated_at = now()
  where id = p_appointment_id;

  insert into public.service_appointment_status_history (
    org_id, location_id, appointment_id, previous_status, new_status, actor_id
  ) values (
    appointment_row.org_id, appointment_row.location_id, appointment_row.id,
    appointment_row.status, p_new_status, auth.uid()
  );
end;
$$;

revoke all on function public.transition_service_appointment(uuid, text) from public, anon;
grant execute on function public.transition_service_appointment(uuid, text) to authenticated;

create or replace function public.prevent_direct_service_job_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and current_user <> pg_catalog.pg_get_userbyid(
       (select relation.relowner from pg_catalog.pg_class relation where relation.oid = tg_relid)
     ) then
    raise exception 'Service job status must be changed through the transition workflow';
  end if;
  return new;
end;
$$;

create trigger service_job_status_transition_guard
  before update of status on public.service_jobs
  for each row execute function public.prevent_direct_service_job_status_change();

create or replace function public.record_service_job_initial_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, actor_id, note
  ) values (
    new.org_id, new.location_id, new.id, null, new.status, auth.uid(), 'Job created'
  );
  return new;
end;
$$;

create trigger service_job_initial_status_history
  after insert on public.service_jobs
  for each row execute function public.record_service_job_initial_status();

create or replace function public.transition_service_job(
  p_job_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  transition_allowed boolean := false;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_new_status is null or p_new_status not in (
    'received', 'inspection', 'awaiting_quotation', 'awaiting_customer_approval',
    'approved', 'rejected', 'in_progress', 'awaiting_parts', 'quality_check',
    'ready_for_collection', 'awaiting_payment', 'completed', 'closed', 'cancelled'
  ) then
    raise exception 'Unknown service job status';
  end if;
  if p_note is not null and length(p_note) > 2000 then
    raise exception 'Status note must be 2,000 characters or fewer';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to change this service job';
  end if;
  if p_new_status = 'awaiting_customer_approval'
     and not exists (
       select 1
       from public.service_quotations quotation
       where quotation.org_id = job_row.org_id
         and quotation.location_id = job_row.location_id
         and quotation.job_id = job_row.id
         and quotation.status = 'sent'
     ) then
    raise exception 'Send a quotation before requesting customer approval';
  end if;
  if p_new_status in ('approved', 'rejected') then
    raise exception 'Record customer approval or decline through the quotation workflow';
  end if;
  if p_new_status = 'completed' then
    raise exception 'A service job is completed only when its linked invoice is fully paid';
  end if;
  if job_row.status = 'completed' and p_new_status = 'closed' then
    raise exception 'Record customer collection through the handover workflow';
  end if;
  if job_row.status = 'completed' and p_new_status = 'inspection' then
    raise exception 'Record customer collection before reopening a completed service job';
  end if;
  if job_row.status = 'awaiting_payment' and p_new_status = 'completed' then
    raise exception 'Complete the linked invoice before closing this repair job';
  end if;
  if job_row.status = 'awaiting_payment'
     and p_new_status = 'ready_for_collection'
     and exists (
       select 1 from public.invoices invoice
       where invoice.org_id = job_row.org_id
         and invoice.source_service_job_id = job_row.id
         and invoice.status <> 'void'
     ) then
    raise exception 'Void the linked invoice before returning this job to collection';
  end if;
  if job_row.status = 'awaiting_customer_approval'
     and p_new_status = 'cancelled'
     and exists (
       select 1
       from public.service_quotations quotation
       where quotation.org_id = job_row.org_id
         and quotation.job_id = job_row.id
         and quotation.status = 'sent'
     ) then
    raise exception 'Withdraw the pending estimate through the quotation workflow';
  end if;

  transition_allowed := case job_row.status
    when 'received' then p_new_status in ('inspection', 'cancelled')
    when 'inspection' then p_new_status in ('awaiting_quotation', 'in_progress', 'cancelled')
    when 'awaiting_quotation' then p_new_status in ('awaiting_customer_approval', 'cancelled')
    when 'awaiting_customer_approval' then p_new_status = 'cancelled'
    when 'approved' then p_new_status in ('in_progress', 'cancelled')
    when 'rejected' then p_new_status in ('inspection', 'cancelled')
    when 'in_progress' then p_new_status in ('awaiting_parts', 'quality_check', 'cancelled')
    when 'awaiting_parts' then p_new_status in ('in_progress', 'cancelled')
    when 'quality_check' then p_new_status in ('in_progress', 'ready_for_collection')
    when 'ready_for_collection' then p_new_status in ('awaiting_payment', 'cancelled')
    when 'awaiting_payment' then p_new_status = 'ready_for_collection'
    when 'completed' then false
    when 'closed' then p_new_status = 'inspection'
    when 'cancelled' then p_new_status = 'inspection'
    else false
  end;
  if not transition_allowed then
    raise exception 'Service job cannot transition from % to %', job_row.status, p_new_status;
  end if;

  update public.service_jobs
  set status = p_new_status, updated_at = now()
  where id = p_job_id;

  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, job_row.status,
    p_new_status, nullif(trim(p_note), ''), auth.uid()
  );
end;
$$;

revoke all on function public.transition_service_job(uuid, text, text) from public, anon;
grant execute on function public.transition_service_job(uuid, text, text) to authenticated;

create or replace function public.create_service_quotation(
  p_job_id uuid,
  p_items jsonb,
  p_notes text default null,
  p_tax_rate numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  item jsonb;
  item_description text;
  item_quantity numeric;
  item_unit_price numeric;
  normalized_items jsonb := '[]'::jsonb;
  item_count integer;
  next_version integer;
  subtotal_value numeric(18, 2) := 0;
  tax_value numeric(18, 2);
  total_value numeric(18, 2);
  quotation_id uuid;
  superseded_quotation record;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Quotation items must be provided as a list';
  end if;
  item_count := jsonb_array_length(p_items);
  if item_count < 1 or item_count > 50 then
    raise exception 'A quotation must contain between 1 and 50 line items';
  end if;
  if p_tax_rate is null or p_tax_rate < 0 or p_tax_rate > 100 or p_tax_rate <> round(p_tax_rate, 2) then
    raise exception 'Tax rate must be between 0 and 100 with at most 2 decimal places';
  end if;
  if p_notes is not null and length(p_notes) > 2000 then
    raise exception 'Quotation notes must be 2,000 characters or fewer';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to create a quotation for this job';
  end if;
  if job_row.status not in ('inspection', 'awaiting_quotation') then
    raise exception 'The job must be in inspection or awaiting quotation before preparing an estimate';
  end if;

  for item in select value from jsonb_array_elements(p_items)
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Each quotation item must be an object';
    end if;
    item_description := nullif(trim(item ->> 'description'), '');
    item_quantity := (item ->> 'quantity')::numeric;
    item_unit_price := (item ->> 'unit_price')::numeric;
    if item_description is null or length(item_description) > 200 then
      raise exception 'Each item needs a description of 1 to 200 characters';
    end if;
    if item_quantity is null or item_quantity <= 0 or item_quantity > 10000
       or item_quantity <> round(item_quantity, 2) then
      raise exception 'Item quantity must be greater than 0 and no more than 10,000, with at most 2 decimal places';
    end if;
    if item_unit_price is null or item_unit_price < 0 or item_unit_price > 100000000
       or item_unit_price <> round(item_unit_price, 2) then
      raise exception 'Item price must be between 0 and 100,000,000, with at most 2 decimal places';
    end if;

    subtotal_value := subtotal_value + round(item_quantity * item_unit_price, 2);
    normalized_items := normalized_items || jsonb_build_array(jsonb_build_object(
      'description', item_description,
      'quantity', item_quantity,
      'unit_price', item_unit_price
    ));
  end loop;

  tax_value := round(subtotal_value * p_tax_rate / 100, 2);
  total_value := subtotal_value + tax_value;
  if total_value > 1000000000000 then
    raise exception 'Estimate total cannot exceed 1,000,000,000,000';
  end if;
  select coalesce(max(version), 0) + 1 into next_version
  from public.service_quotations
  where org_id = job_row.org_id and job_id = job_row.id;

  for superseded_quotation in
    update public.service_quotations
    set status = 'superseded'
    where org_id = job_row.org_id
      and location_id = job_row.location_id
      and job_id = job_row.id
      and status = 'draft'
    returning id
  loop
    insert into public.service_quotation_status_history (
      org_id, location_id, quotation_id, previous_status, new_status, note, actor_id
    ) values (
      job_row.org_id, job_row.location_id, superseded_quotation.id,
      'draft', 'superseded', 'Replaced by a newer estimate', auth.uid()
    );
  end loop;

  insert into public.service_quotations (
    org_id, location_id, job_id, version, notes,
    subtotal, tax_rate, tax_amount, total, created_by
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, next_version,
    nullif(trim(p_notes), ''), subtotal_value, p_tax_rate, tax_value,
    total_value, auth.uid()
  ) returning id into quotation_id;

  insert into public.service_quotation_items (
    org_id, location_id, quotation_id, description, quantity, unit_price
  )
  select
    job_row.org_id, job_row.location_id, quotation_id,
    item_row ->> 'description',
    (item_row ->> 'quantity')::numeric,
    (item_row ->> 'unit_price')::numeric
  from jsonb_array_elements(normalized_items) as normalized(item_row);

  return quotation_id;
end;
$$;

revoke all on function public.create_service_quotation(uuid, jsonb, text, numeric) from public, anon;
grant execute on function public.create_service_quotation(uuid, jsonb, text, numeric) to authenticated;

create or replace function public.transition_service_quotation(
  p_quotation_id uuid,
  p_new_status text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  quotation_row public.service_quotations%rowtype;
  job_row public.service_jobs%rowtype;
  new_job_status text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_new_status not in ('sent', 'approved', 'rejected', 'withdrawn') then
    raise exception 'Unknown quotation action';
  end if;
  if p_note is null or length(trim(p_note)) = 0 or length(p_note) > 1000 then
    raise exception 'Enter an action note or customer response (up to 1,000 characters)';
  end if;

  select * into quotation_row
  from public.service_quotations
  where id = p_quotation_id;
  if not found then
    raise exception 'Quotation not found';
  end if;
  select * into job_row
  from public.service_jobs
  where org_id = quotation_row.org_id
    and location_id = quotation_row.location_id
    and id = quotation_row.job_id
  for update;
  if not found then
    raise exception 'The service job for this quotation was not found';
  end if;
  select * into quotation_row
  from public.service_quotations
  where id = p_quotation_id
  for update;
  if not found then
    raise exception 'Quotation not found';
  end if;
  if not public.is_org_member(quotation_row.org_id)
     or not public.can_access_org_location(quotation_row.org_id, quotation_row.location_id)
     or not public.has_org_permission(quotation_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to update this quotation';
  end if;

  if quotation_row.status = 'draft' and p_new_status = 'sent' then
    if job_row.status not in ('inspection', 'awaiting_quotation') then
      raise exception 'The job is not ready for a customer quotation';
    end if;
    if exists (
      select 1
      from public.service_quotations other
      where other.org_id = quotation_row.org_id
        and other.job_id = quotation_row.job_id
        and other.id <> quotation_row.id
        and other.status = 'sent'
    ) then
      raise exception 'Another quotation for this job is already awaiting a customer response';
    end if;
    update public.service_quotations
    set status = 'sent', sent_at = now(), sent_note = trim(p_note)
    where id = quotation_row.id;
    new_job_status := 'awaiting_customer_approval';
    insert into public.service_quotation_status_history (
      org_id, location_id, quotation_id, previous_status, new_status, note, actor_id
    ) values (
      quotation_row.org_id, quotation_row.location_id, quotation_row.id,
      quotation_row.status, 'sent', trim(p_note), auth.uid()
    );
  elsif quotation_row.status = 'sent' and p_new_status in ('approved', 'rejected') then
    if job_row.status <> 'awaiting_customer_approval' then
      raise exception 'The job is not awaiting a customer response';
    end if;
    update public.service_quotations
    set status = p_new_status, decided_at = now(), decision_note = trim(p_note)
    where id = quotation_row.id;
    new_job_status := p_new_status;
    insert into public.service_quotation_status_history (
      org_id, location_id, quotation_id, previous_status, new_status, note, actor_id
    ) values (
      quotation_row.org_id, quotation_row.location_id, quotation_row.id,
      quotation_row.status, p_new_status, trim(p_note), auth.uid()
    );
  elsif quotation_row.status in ('draft', 'sent') and p_new_status = 'withdrawn' then
    if quotation_row.status = 'sent' and job_row.status <> 'awaiting_customer_approval' then
      raise exception 'The job is not awaiting a customer response';
    end if;
    update public.service_quotations
    set status = 'withdrawn', decided_at = now(), decision_note = trim(p_note)
    where id = quotation_row.id;
    if quotation_row.status = 'sent' then
      new_job_status := 'cancelled';
    end if;
    insert into public.service_quotation_status_history (
      org_id, location_id, quotation_id, previous_status, new_status, note, actor_id
    ) values (
      quotation_row.org_id, quotation_row.location_id, quotation_row.id,
      quotation_row.status, 'withdrawn', trim(p_note), auth.uid()
    );
  else
    raise exception 'Quotation cannot transition from % to %', quotation_row.status, p_new_status;
  end if;

  if new_job_status is not null then
    update public.service_jobs
    set status = new_job_status, updated_at = now()
    where id = job_row.id;
    insert into public.service_job_status_history (
      org_id, location_id, job_id, previous_status, new_status, note, actor_id
    ) values (
      job_row.org_id, job_row.location_id, job_row.id, job_row.status,
      new_job_status, 'Quotation v' || quotation_row.version || ': ' || trim(p_note), auth.uid()
    );
  end if;
end;
$$;

revoke all on function public.transition_service_quotation(uuid, text, text) from public, anon;
grant execute on function public.transition_service_quotation(uuid, text, text) to authenticated;

create or replace function public.issue_service_job_parts(
  p_job_id uuid,
  p_items jsonb,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  item jsonb;
  product_row public.products%rowtype;
  v_product_id uuid;
  requested_quantity numeric;
  available_quantity integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_items is null or jsonb_typeof(p_items) is distinct from 'array' then
    raise exception 'Select between 1 and 50 parts to issue';
  end if;
  if jsonb_array_length(p_items) < 1 or jsonb_array_length(p_items) > 50 then
    raise exception 'Select between 1 and 50 parts to issue';
  end if;
  if p_note is not null and length(p_note) > 1000 then
    raise exception 'Parts note must be 1,000 characters or fewer';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit')
     or not public.has_org_permission(job_row.org_id, 'inventory', 'edit') then
    raise exception 'You need service-job and inventory edit permission for this branch';
  end if;
  if job_row.status not in ('approved', 'in_progress', 'awaiting_parts') then
    raise exception 'Parts can only be issued to an approved or active repair job';
  end if;

  insert into public.product_stock_levels (org_id, product_id, location_id, quantity)
  select job_row.org_id, (part.value ->> 'product_id')::uuid, job_row.location_id, 0
  from jsonb_array_elements(p_items) as part(value)
  order by part.value ->> 'product_id'
  on conflict (product_id, location_id) do nothing;

  for item in
    select value from jsonb_array_elements(p_items)
    order by value ->> 'product_id'
  loop
    if jsonb_typeof(item) is distinct from 'object' then
      raise exception 'Each part must be a product and whole-number quantity';
    end if;
    v_product_id := nullif(item ->> 'product_id', '')::uuid;
    requested_quantity := (item ->> 'quantity')::numeric;
    if requested_quantity is null or requested_quantity <= 0
       or requested_quantity > 10000 or requested_quantity <> trunc(requested_quantity) then
      raise exception 'Part quantity must be a whole number between 1 and 10,000';
    end if;

    select * into product_row
    from public.products
    where id = v_product_id
      and org_id = job_row.org_id
      and is_active
      and track_inventory
      and product_type = 'standard'
      and status = 'active'
    for share;
    if not found then
      raise exception 'A selected part is unavailable or is not a stock-tracked product in this organization';
    end if;
    if not exists (
      select 1
      from public.product_stock_levels
      where org_id = job_row.org_id
        and product_stock_levels.product_id = v_product_id
        and location_id = job_row.location_id
    ) then
      if exists (
        select 1
        from public.product_stock_levels
        where product_stock_levels.product_id = v_product_id
          and location_id = job_row.location_id
      ) then
        raise exception 'Inventory organization does not match the service job';
      end if;
    end if;

    select quantity into available_quantity
    from public.product_stock_levels
    where org_id = job_row.org_id
      and product_stock_levels.product_id = v_product_id
      and location_id = job_row.location_id
    for update;
    if not found then
      raise exception 'Inventory could not be initialized for this product and branch';
    end if;
    if available_quantity < requested_quantity then
      raise exception 'insufficient_stock: only % available for this part at this branch', available_quantity;
    end if;

    update public.product_stock_levels
    set quantity = quantity - requested_quantity, updated_at = now()
    where org_id = job_row.org_id
      and product_stock_levels.product_id = v_product_id
      and location_id = job_row.location_id;

    insert into public.service_job_part_movements (
      org_id, location_id, job_id, product_id, movement_type,
      quantity, unit_cost, note, actor_id
    ) values (
      job_row.org_id, job_row.location_id, job_row.id, v_product_id, 'issued',
      requested_quantity::integer, coalesce(product_row.cost_price, 0),
      nullif(trim(p_note), ''), auth.uid()
    );
  end loop;
end;
$$;

revoke all on function public.issue_service_job_parts(uuid, jsonb, text) from public, anon;
grant execute on function public.issue_service_job_parts(uuid, jsonb, text) to authenticated;

create or replace function public.return_service_job_part(
  p_issue_id uuid,
  p_quantity integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  issue_row public.service_job_part_movements%rowtype;
  job_row public.service_jobs%rowtype;
  previously_returned integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Return quantity must be a positive whole number';
  end if;
  if p_note is null or length(trim(p_note)) = 0 or length(p_note) > 1000 then
    raise exception 'Enter a return reason of up to 1,000 characters';
  end if;

  select * into issue_row
  from public.service_job_part_movements
  where id = p_issue_id and movement_type = 'issued';
  if not found then
    raise exception 'Issued part record not found';
  end if;
  select * into job_row
  from public.service_jobs
  where org_id = issue_row.org_id
    and location_id = issue_row.location_id
    and id = issue_row.job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit')
     or not public.has_org_permission(job_row.org_id, 'inventory', 'edit') then
    raise exception 'You need service-job and inventory edit permission for this branch';
  end if;
  select * into issue_row
  from public.service_job_part_movements
  where id = p_issue_id and movement_type = 'issued'
  for update;
  if not found then
    raise exception 'Issued part record not found';
  end if;

  previously_returned := issue_row.returned_quantity;
  if p_quantity > issue_row.quantity - previously_returned then
    raise exception 'Return quantity exceeds the unused quantity for this issued part';
  end if;
  if exists (
    select 1
    from public.product_stock_levels
    where product_id = issue_row.product_id
      and location_id = issue_row.location_id
      and org_id <> issue_row.org_id
  ) then
    raise exception 'Inventory organization does not match the service job';
  end if;

  insert into public.product_stock_levels (org_id, product_id, location_id, quantity, updated_at)
  values (issue_row.org_id, issue_row.product_id, issue_row.location_id, p_quantity, now())
  on conflict (product_id, location_id)
  do update set
    quantity = product_stock_levels.quantity + excluded.quantity,
    updated_at = now();

  update public.service_job_part_movements
  set returned_quantity = returned_quantity + p_quantity
  where id = issue_row.id;

  insert into public.service_job_part_movements (
    org_id, location_id, job_id, product_id, movement_type,
    related_issue_id, quantity, unit_cost, note, actor_id
  ) values (
    issue_row.org_id, issue_row.location_id, issue_row.job_id, issue_row.product_id,
    'returned', issue_row.id, p_quantity, issue_row.unit_cost, trim(p_note), auth.uid()
  );
end;
$$;

revoke all on function public.return_service_job_part(uuid, integer, text) from public, anon;
grant execute on function public.return_service_job_part(uuid, integer, text) to authenticated;

create or replace function public.create_service_job_invoice(
  p_job_id uuid,
  p_due_date date
)
returns table (invoice_id uuid, invoice_number integer)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  quotation_row public.service_quotations%rowtype;
  inserted_invoice public.invoices%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_due_date is null or p_due_date < current_date then
    raise exception 'Invoice due date cannot be in the past';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to invoice this service job';
  end if;
  if job_row.status <> 'ready_for_collection' then
    raise exception 'The repair job must be ready for collection before invoicing';
  end if;

  select * into quotation_row
  from public.service_quotations
  where org_id = job_row.org_id
    and location_id = job_row.location_id
    and job_id = job_row.id
    and status = 'approved'
  order by version desc
  limit 1
  for update;
  if not found then
    raise exception 'An approved estimate is required before invoicing';
  end if;
  if quotation_row.total <= 0 then
    raise exception 'The approved estimate must have a total greater than zero';
  end if;
  if exists (
    select 1 from public.invoices
    where org_id = job_row.org_id
      and source_service_job_id = job_row.id
      and status <> 'void'
  ) then
    raise exception 'An active invoice already exists for this repair job';
  end if;

  insert into public.invoices (
    org_id, customer_name, amount, amount_paid, status, due_date,
    source_service_job_id, source_service_quotation_id, created_by
  ) values (
    job_row.org_id,
    (select customer.name from public.customers customer
     where customer.org_id = job_row.org_id and customer.id = job_row.customer_id),
    quotation_row.total,
    0,
    'sent',
    p_due_date,
    job_row.id,
    quotation_row.id,
    auth.uid()
  )
  returning * into inserted_invoice;

  update public.service_jobs
  set status = 'awaiting_payment', updated_at = now()
  where id = job_row.id;
  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, job_row.status,
    'awaiting_payment', 'Invoice #' || inserted_invoice.invoice_number || ' issued', auth.uid()
  );

  return query select inserted_invoice.id, inserted_invoice.invoice_number;
end;
$$;

revoke all on function public.create_service_job_invoice(uuid, date) from public, anon;
grant execute on function public.create_service_job_invoice(uuid, date) to authenticated;

create or replace function public.sync_service_job_invoice_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  next_job_status text;
begin
  if new.source_service_job_id is null then
    return new;
  end if;
  if new.status = 'paid' and new.amount_paid < new.amount then
    raise exception 'A service invoice must be fully paid before completing its repair job';
  end if;
  if new.status is not distinct from old.status then
    return new;
  end if;
  if old.status = 'paid' and new.status = 'void' then
    raise exception 'A paid service invoice cannot be voided';
  end if;

  next_job_status := case new.status
    when 'paid' then 'completed'
    when 'void' then 'ready_for_collection'
    else null
  end;
  if next_job_status is null then
    return new;
  end if;

  select * into job_row
  from public.service_jobs
  where org_id = new.org_id and id = new.source_service_job_id
  for update;
  if not found or job_row.status <> 'awaiting_payment' then
    return new;
  end if;

  update public.service_jobs
  set status = next_job_status, updated_at = now()
  where org_id = job_row.org_id and id = job_row.id;
  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, job_row.status,
    next_job_status,
    case when new.status = 'paid'
      then 'Invoice #' || new.invoice_number || ' paid'
      else 'Invoice #' || new.invoice_number || ' voided'
    end,
    auth.uid()
  );
  return new;
end;
$$;

drop trigger if exists service_invoice_status_sync on public.invoices;
create trigger service_invoice_status_sync
  after update of status, amount_paid on public.invoices
  for each row
  execute function public.sync_service_job_invoice_status();

revoke all on function public.sync_service_job_invoice_status() from public, anon, authenticated;

create table if not exists public.service_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  invoice_id uuid not null references public.invoices(id) on delete restrict,
  amount numeric(12, 2) not null check (amount > 0),
  payment_method text not null check (
    payment_method in ('Cash', 'Card', 'Bank Transfer', 'Mobile Money', 'Other')
  ),
  payment_date date not null,
  balance_after numeric(12, 2) not null check (balance_after >= 0),
  notes text check (notes is null or length(notes) <= 500),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete restrict
);

create index if not exists service_invoice_payments_invoice_date_idx
  on public.service_invoice_payments(org_id, invoice_id, created_at desc);

alter table public.service_invoice_payments enable row level security;

create policy "service invoice payments: branch-scoped members can read"
  on public.service_invoice_payments for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and (
      public.has_org_permission(org_id, 'accounting', 'view')
      or public.has_org_permission(org_id, 'accounting', 'edit')
    )
  );

revoke all on table public.service_invoice_payments from anon, authenticated;
grant select on table public.service_invoice_payments to authenticated;

create or replace function public.guard_service_invoice_payment_balance()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  recorded_total numeric(12, 2);
begin
  if new.source_service_job_id is null then
    return new;
  end if;

  if new.amount_paid is distinct from old.amount_paid then
    select coalesce(sum(payment.amount), 0)
    into recorded_total
    from public.service_invoice_payments payment
    where payment.org_id = new.org_id
      and payment.invoice_id = new.id;

    if new.amount_paid < old.amount_paid
       or new.amount_paid <> recorded_total then
      raise exception 'Repair invoice balances must match their recorded payments';
    end if;
  end if;

  if new.status = 'void' and new.amount_paid > 0 then
    raise exception 'A repair invoice with payments cannot be voided';
  end if;
  if new.status = 'paid' and new.amount_paid < new.amount then
    raise exception 'A repair invoice must be fully paid before it can be marked paid';
  end if;

  return new;
end;
$$;

create trigger service_invoice_payment_balance_guard
  before update of amount_paid, status on public.invoices
  for each row
  execute function public.guard_service_invoice_payment_balance();

revoke all on function public.guard_service_invoice_payment_balance() from public, anon, authenticated;

create or replace function public.record_service_invoice_payment(
  p_org_id uuid,
  p_invoice_id uuid,
  p_amount numeric,
  p_payment_method text,
  p_payment_date date,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  invoice_row public.invoices%rowtype;
  job_row public.service_jobs%rowtype;
  payment_id uuid;
  remaining_balance numeric(12, 2);
  next_amount_paid numeric(12, 2);
  next_status public.invoice_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount <> round(p_amount, 2) then
    raise exception 'Enter a valid payment amount with no more than two decimal places';
  end if;
  if p_payment_method is null or p_payment_method not in (
    'Cash', 'Card', 'Bank Transfer', 'Mobile Money', 'Other'
  ) then
    raise exception 'Select a valid payment method';
  end if;
  if p_payment_date is null or p_payment_date > current_date then
    raise exception 'Payment date cannot be in the future';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Payment notes cannot exceed 500 characters';
  end if;

  select * into invoice_row
  from public.invoices
  where org_id = p_org_id
    and id = p_invoice_id
    and source_service_job_id is not null
  for update;
  if not found then
    raise exception 'Repair invoice not found';
  end if;
  if not public.is_org_member(invoice_row.org_id)
     or not public.has_org_permission(invoice_row.org_id, 'accounting', 'edit') then
    raise exception 'You do not have permission to record this payment';
  end if;

  select * into job_row
  from public.service_jobs
  where org_id = invoice_row.org_id
    and id = invoice_row.source_service_job_id
  for update;
  if not found then
    raise exception 'The repair job for this invoice could not be found';
  end if;
  if not public.can_access_org_location(job_row.org_id, job_row.location_id) then
    raise exception 'You cannot record payments for this repair branch';
  end if;
  if job_row.status <> 'awaiting_payment' then
    raise exception 'The repair job is not awaiting payment';
  end if;
  if invoice_row.status not in ('sent', 'overdue') then
    raise exception 'Only an open repair invoice can receive a payment';
  end if;

  remaining_balance := invoice_row.amount - invoice_row.amount_paid;
  if p_amount > remaining_balance then
    raise exception 'Payment amount cannot exceed the remaining invoice balance';
  end if;
  next_amount_paid := invoice_row.amount_paid + p_amount;
  next_status := case
    when next_amount_paid = invoice_row.amount then 'paid'::public.invoice_status
    when invoice_row.due_date < current_date then 'overdue'::public.invoice_status
    else 'sent'::public.invoice_status
  end;

  insert into public.service_invoice_payments (
    org_id, location_id, job_id, invoice_id, amount, payment_method,
    payment_date, balance_after, notes, recorded_by
  ) values (
    invoice_row.org_id, job_row.location_id, job_row.id, invoice_row.id,
    p_amount, p_payment_method, p_payment_date, remaining_balance - p_amount,
    nullif(trim(p_notes), ''), auth.uid()
  )
  returning id into payment_id;

  update public.invoices
  set amount_paid = next_amount_paid,
      status = next_status,
      paid_at = case when next_status = 'paid' then now() else null end
  where id = invoice_row.id
    and org_id = invoice_row.org_id;

  return payment_id;
end;
$$;

revoke all on function public.record_service_invoice_payment(uuid, uuid, numeric, text, date, text) from public, anon;
grant execute on function public.record_service_invoice_payment(uuid, uuid, numeric, text, date, text) to authenticated;

create table if not exists public.service_job_handovers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  job_id uuid not null,
  recipient_name text not null check (length(trim(recipient_name)) between 1 and 120),
  recipient_type text not null check (recipient_type in ('customer', 'authorized_representative')),
  condition_on_handover text not null check (length(trim(condition_on_handover)) between 1 and 1000),
  accessories_returned text check (accessories_returned is null or length(accessories_returned) <= 1000),
  customer_acknowledged boolean not null check (customer_acknowledged),
  collected_at timestamptz not null default now(),
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  foreign key (org_id, location_id, job_id)
    references public.service_jobs(org_id, location_id, id) on delete restrict
);

create index if not exists service_job_handovers_job_date_idx
  on public.service_job_handovers(org_id, job_id, collected_at desc);

alter table public.service_job_handovers enable row level security;

create policy "service job handovers: branch-scoped members can read"
  on public.service_job_handovers for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );

revoke all on table public.service_job_handovers from anon, authenticated;
grant select on table public.service_job_handovers to authenticated;

create or replace function public.record_service_job_handover(
  p_job_id uuid,
  p_recipient_name text,
  p_recipient_type text,
  p_condition_on_handover text,
  p_accessories_returned text,
  p_customer_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  invoice_row public.invoices%rowtype;
  handover_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_recipient_name is null or length(trim(p_recipient_name)) not between 1 and 120 then
    raise exception 'Enter the name of the person collecting the equipment';
  end if;
  if p_recipient_type is null or p_recipient_type not in ('customer', 'authorized_representative') then
    raise exception 'Select whether the customer or an authorized representative collected the equipment';
  end if;
  if p_condition_on_handover is null or length(trim(p_condition_on_handover)) not between 1 and 1000 then
    raise exception 'Record the equipment condition at handover (up to 1,000 characters)';
  end if;
  if p_accessories_returned is not null and length(p_accessories_returned) > 1000 then
    raise exception 'Returned accessories cannot exceed 1,000 characters';
  end if;
  if p_customer_acknowledged is distinct from true then
    raise exception 'Confirm that the recipient acknowledged receiving the equipment';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to record this handover';
  end if;
  if job_row.status <> 'completed' then
    raise exception 'The repair must be fully paid before recording customer collection';
  end if;

  select * into invoice_row
  from public.invoices
  where org_id = job_row.org_id
    and source_service_job_id = job_row.id
    and status = 'paid'
    and amount_paid >= amount
  order by created_at desc
  limit 1
  for update;
  if not found then
    raise exception 'A fully paid repair invoice is required before handover';
  end if;

  insert into public.service_job_handovers (
    org_id, location_id, job_id, recipient_name, recipient_type,
    condition_on_handover, accessories_returned, customer_acknowledged,
    recorded_by
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, trim(p_recipient_name),
    p_recipient_type, trim(p_condition_on_handover),
    nullif(trim(p_accessories_returned), ''), true, auth.uid()
  )
  returning id into handover_id;

  update public.service_jobs
  set status = 'closed', updated_at = now()
  where org_id = job_row.org_id and id = job_row.id;

  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, job_row.status, 'closed',
    'Equipment handed to ' || trim(p_recipient_name) || ' (' ||
      case p_recipient_type
        when 'customer' then 'customer'
        else 'authorized representative'
      end || ')',
    auth.uid()
  );

  return handover_id;
end;
$$;

revoke all on function public.record_service_job_handover(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.record_service_job_handover(uuid, text, text, text, text, boolean) to authenticated;

create table if not exists public.service_job_warranty_claims (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  location_id uuid not null,
  original_job_id uuid not null,
  follow_up_job_id uuid not null,
  customer_id uuid not null,
  asset_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'covered', 'not_covered')),
  decision_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  recorded_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, follow_up_job_id),
  check (
    (status = 'pending' and decided_by is null and decided_at is null and decision_note is null)
    or (status <> 'pending' and decided_by is not null and decided_at is not null and decision_note is not null)
  ),
  foreign key (org_id, location_id, customer_id, original_job_id)
    references public.service_jobs(org_id, location_id, customer_id, id) on delete restrict,
  foreign key (org_id, location_id, customer_id, follow_up_job_id)
    references public.service_jobs(org_id, location_id, customer_id, id) on delete restrict,
  foreign key (org_id, location_id, customer_id, asset_id)
    references public.service_assets(org_id, location_id, customer_id, id) on delete restrict
);

create index if not exists service_job_warranty_claims_original_idx
  on public.service_job_warranty_claims(org_id, original_job_id, created_at desc);

alter table public.service_job_warranty_claims enable row level security;

create policy "service job warranty claims: branch-scoped members can read"
  on public.service_job_warranty_claims for select
  using (
    public.is_org_member(org_id)
    and public.can_access_org_location(org_id, location_id)
    and public.has_org_permission(org_id, 'service_jobs', 'view')
  );

revoke all on table public.service_job_warranty_claims from anon, authenticated;
grant select on table public.service_job_warranty_claims to authenticated;

create or replace function public.create_service_job_warranty_claim(
  p_org_id uuid,
  p_location_id uuid,
  p_customer_id uuid,
  p_asset_id uuid,
  p_original_job_id uuid,
  p_job_number text,
  p_priority text,
  p_reported_problem text,
  p_technician_id uuid,
  p_condition_on_arrival text,
  p_accessories text[],
  p_intake_confirmed_by text,
  p_intake_confirmed_as text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  original_job public.service_jobs%rowtype;
  new_job_id uuid;
begin
  if auth.uid() is null or not public.is_org_member(p_org_id) then
    raise exception 'Authentication is required';
  end if;
  if not public.has_org_permission(p_org_id, 'service_jobs', 'create')
     or not public.can_access_org_location(p_org_id, p_location_id) then
    raise exception 'You do not have permission to create a repair at this branch';
  end if;
  if p_job_number is null or length(trim(p_job_number)) not between 1 and 80 then
    raise exception 'A valid repair job number is required';
  end if;
  if p_priority is null or p_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Choose a valid job priority';
  end if;
  if p_reported_problem is null or length(trim(p_reported_problem)) not between 1 and 4000 then
    raise exception 'Describe the reported problem (up to 4,000 characters)';
  end if;
  if p_condition_on_arrival is null or length(trim(p_condition_on_arrival)) not between 1 and 1000 then
    raise exception 'Record the equipment condition at intake (up to 1,000 characters)';
  end if;
  if p_accessories is null or cardinality(p_accessories) > 20
     or exists (select 1 from unnest(p_accessories) accessory where length(trim(accessory)) not between 1 and 80) then
    raise exception 'Enter up to 20 valid accessories, with no more than 80 characters per item';
  end if;
  if p_intake_confirmed_by is null or length(trim(p_intake_confirmed_by)) not between 1 and 120 then
    raise exception 'Enter who confirmed the equipment intake';
  end if;
  if p_intake_confirmed_as is null or p_intake_confirmed_as not in ('customer', 'authorized_representative') then
    raise exception 'Select whether the customer or an authorized representative confirmed intake';
  end if;

  select * into original_job
  from public.service_jobs
  where org_id = p_org_id
    and id = p_original_job_id
  for update;
  if not found or original_job.status <> 'closed' then
    raise exception 'A previously handed-over repair is required for a warranty claim';
  end if;
  if original_job.location_id is distinct from p_location_id
     or original_job.customer_id is distinct from p_customer_id
     or original_job.asset_id is null
     or original_job.asset_id is distinct from p_asset_id then
    raise exception 'Warranty claims must use the original customer, equipment, and branch';
  end if;
  if not exists (
    select 1 from public.service_assets asset
    where asset.org_id = p_org_id
      and asset.location_id = p_location_id
      and asset.customer_id = p_customer_id
      and asset.id = p_asset_id
  ) then
    raise exception 'The selected equipment is unavailable for this warranty claim';
  end if;
  if p_technician_id is not null
     and not public.is_active_service_technician(p_org_id, p_location_id, p_technician_id) then
    raise exception 'The selected technician is not active at this branch';
  end if;

  insert into public.service_jobs (
    org_id, location_id, job_number, customer_id, asset_id, technician_id, status,
    priority, reported_problem, condition_on_arrival, accessories, intake_confirmed_by,
    intake_confirmed_as, created_by
  ) values (
    p_org_id, p_location_id, trim(p_job_number), p_customer_id, p_asset_id, p_technician_id,
    'received', p_priority, trim(p_reported_problem), trim(p_condition_on_arrival),
    p_accessories, trim(p_intake_confirmed_by), p_intake_confirmed_as, auth.uid()
  )
  returning id into new_job_id;

  insert into public.service_job_warranty_claims (
    org_id, location_id, original_job_id, follow_up_job_id,
    customer_id, asset_id, recorded_by
  ) values (
    p_org_id, p_location_id, original_job.id, new_job_id,
    p_customer_id, p_asset_id, auth.uid()
  );

  return new_job_id;
end;
$$;

revoke all on function public.create_service_job_warranty_claim(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text[], text, text) from public, anon;
grant execute on function public.create_service_job_warranty_claim(uuid, uuid, uuid, uuid, uuid, text, text, text, uuid, text, text[], text, text) to authenticated;

create or replace function public.decide_service_job_warranty_claim(
  p_claim_id uuid,
  p_decision text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  claim_row public.service_job_warranty_claims%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_decision is null or p_decision not in ('covered', 'not_covered') then
    raise exception 'Choose whether the warranty claim is covered';
  end if;
  if p_note is null or length(trim(p_note)) not between 1 and 1000 then
    raise exception 'Record the reason for the warranty decision (up to 1,000 characters)';
  end if;

  select * into claim_row
  from public.service_job_warranty_claims
  where id = p_claim_id
  for update;
  if not found then
    raise exception 'Warranty claim not found';
  end if;
  if not public.is_org_member(claim_row.org_id)
     or not public.can_access_org_location(claim_row.org_id, claim_row.location_id)
     or not public.has_org_permission(claim_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to decide this warranty claim';
  end if;
  if claim_row.status <> 'pending' then
    raise exception 'This warranty claim already has a decision';
  end if;

  update public.service_job_warranty_claims
  set status = p_decision,
      decision_note = trim(p_note),
      decided_by = auth.uid(),
      decided_at = now()
  where id = claim_row.id;
end;
$$;

revoke all on function public.decide_service_job_warranty_claim(uuid, text, text) from public, anon;
grant execute on function public.decide_service_job_warranty_claim(uuid, text, text) to authenticated;

create or replace function public.guard_service_job_warranty_workflow()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_table_name = 'service_jobs' then
    if new.status is distinct from old.status
       and old.status = 'inspection'
       and new.status <> 'inspection'
       and exists (
         select 1
         from public.service_job_warranty_claims claim
         where claim.org_id = new.org_id
           and claim.follow_up_job_id = new.id
           and claim.status = 'pending'
       ) then
      raise exception 'Record the warranty coverage decision before continuing this repair';
    end if;
    if new.status = 'awaiting_payment'
       and exists (
         select 1
         from public.service_job_warranty_claims claim
         where claim.org_id = new.org_id
           and claim.follow_up_job_id = new.id
           and claim.status = 'covered'
       ) then
      raise exception 'A covered warranty repair does not require payment; record collection instead';
    end if;
  elsif tg_table_name = 'service_quotations' then
    if exists (
      select 1
      from public.service_job_warranty_claims claim
      where claim.org_id = new.org_id
        and claim.follow_up_job_id = new.job_id
        and claim.status in ('pending', 'covered')
    ) then
      raise exception 'Record a non-covered warranty decision before preparing a customer estimate';
    end if;
  elsif tg_table_name = 'invoices' then
    if new.source_service_job_id is not null and exists (
      select 1
      from public.service_job_warranty_claims claim
      where claim.org_id = new.org_id
        and claim.follow_up_job_id = new.source_service_job_id
        and claim.status in ('pending', 'covered')
    ) then
      raise exception 'A warranty claim must be decided as not covered before charging the customer';
    end if;
  end if;
  return new;
end;
$$;

create trigger service_job_warranty_transition_guard
  before update of status on public.service_jobs
  for each row
  execute function public.guard_service_job_warranty_workflow();

create trigger service_quotation_warranty_charge_guard
  before insert on public.service_quotations
  for each row
  execute function public.guard_service_job_warranty_workflow();

create trigger service_invoice_warranty_charge_guard
  before insert on public.invoices
  for each row
  execute function public.guard_service_job_warranty_workflow();

revoke all on function public.guard_service_job_warranty_workflow() from public, anon, authenticated;

create or replace function public.record_covered_service_job_handover(
  p_job_id uuid,
  p_recipient_name text,
  p_recipient_type text,
  p_condition_on_handover text,
  p_accessories_returned text,
  p_customer_acknowledged boolean
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  job_row public.service_jobs%rowtype;
  handover_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if p_recipient_name is null or length(trim(p_recipient_name)) not between 1 and 120 then
    raise exception 'Enter the name of the person collecting the equipment';
  end if;
  if p_recipient_type is null or p_recipient_type not in ('customer', 'authorized_representative') then
    raise exception 'Select whether the customer or an authorized representative collected the equipment';
  end if;
  if p_condition_on_handover is null or length(trim(p_condition_on_handover)) not between 1 and 1000 then
    raise exception 'Record the equipment condition at handover (up to 1,000 characters)';
  end if;
  if p_accessories_returned is not null and length(p_accessories_returned) > 1000 then
    raise exception 'Returned accessories cannot exceed 1,000 characters';
  end if;
  if p_customer_acknowledged is distinct from true then
    raise exception 'Confirm that the recipient acknowledged receiving the equipment';
  end if;

  select * into job_row
  from public.service_jobs
  where id = p_job_id
  for update;
  if not found then
    raise exception 'Service job not found';
  end if;
  if not public.is_org_member(job_row.org_id)
     or not public.can_access_org_location(job_row.org_id, job_row.location_id)
     or not public.has_org_permission(job_row.org_id, 'service_jobs', 'edit') then
    raise exception 'You do not have permission to record this handover';
  end if;
  if job_row.status <> 'ready_for_collection'
     or not exists (
       select 1
       from public.service_job_warranty_claims claim
       where claim.org_id = job_row.org_id
         and claim.follow_up_job_id = job_row.id
         and claim.status = 'covered'
     ) then
    raise exception 'A covered warranty repair ready for collection is required';
  end if;

  insert into public.service_job_handovers (
    org_id, location_id, job_id, recipient_name, recipient_type,
    condition_on_handover, accessories_returned, customer_acknowledged,
    recorded_by
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, trim(p_recipient_name),
    p_recipient_type, trim(p_condition_on_handover),
    nullif(trim(p_accessories_returned), ''), true, auth.uid()
  )
  returning id into handover_id;

  update public.service_jobs
  set status = 'closed', updated_at = now()
  where org_id = job_row.org_id and id = job_row.id;

  insert into public.service_job_status_history (
    org_id, location_id, job_id, previous_status, new_status, note, actor_id
  ) values (
    job_row.org_id, job_row.location_id, job_row.id, job_row.status, 'closed',
    'Covered warranty repair handed to ' || trim(p_recipient_name) || ' (' ||
      case p_recipient_type
        when 'customer' then 'customer'
        else 'authorized representative'
      end || ')',
    auth.uid()
  );
  return handover_id;
end;
$$;

revoke all on function public.record_covered_service_job_handover(uuid, text, text, text, text, boolean) from public, anon;
grant execute on function public.record_covered_service_job_handover(uuid, text, text, text, text, boolean) to authenticated;
