-- SalesMate ERP — AI Assistant module (v1): stored executive summaries.
-- Depends on 0001_core_schema.sql. Generating a summary calls the
-- Anthropic API (server-side only), so this is gated to 'manager'+ to
-- keep API usage under deliberate control; anyone can read past summaries.

create table public.ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  content text not null,
  generated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.ai_insights enable row level security;

create policy "ai_insights: members can read"
  on public.ai_insights for select
  using (public.is_org_member(org_id));

create policy "ai_insights: managers can generate"
  on public.ai_insights for insert
  with check (public.has_org_role(org_id, 'manager') and generated_by = auth.uid());

create index idx_ai_insights_org on public.ai_insights(org_id, created_at desc);