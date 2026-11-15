-- Durable lifecycle telemetry for provider-backed media generation jobs.
-- The initial event records the atomically reserved job; later lifecycle events are
-- appended only when a provider submission/polling worker is implemented.
create table if not exists public.media_generation_job_events (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.generation_jobs(id) on delete cascade,
  provider text not null check (provider in ('runway')),
  task text not null check (task in ('image','video','audio')),
  quality text not null check (quality in ('draft','standard','premium')),
  event_type text not null check (event_type in ('reserved','submitted','processing','succeeded','failed','cancelled')),
  provider_task_id text check (provider_task_id is null or char_length(provider_task_id) <= 240),
  model_id text check (model_id is null or char_length(model_id) <= 240),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint media_generation_job_event_completion_order
    check (completed_at is null or started_at is null or completed_at >= started_at)
);
create unique index if not exists media_generation_job_events_one_reserved
  on public.media_generation_job_events(job_id) where event_type = 'reserved';
create index if not exists media_generation_job_events_provider_created_idx
  on public.media_generation_job_events(provider, created_at desc);
create index if not exists media_generation_job_events_type_created_idx
  on public.media_generation_job_events(event_type, created_at desc);
alter table public.media_generation_job_events enable row level security;
revoke all on public.media_generation_job_events from public, anon, authenticated;
grant select, insert on public.media_generation_job_events to service_role;
