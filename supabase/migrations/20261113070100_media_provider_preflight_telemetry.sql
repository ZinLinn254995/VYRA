-- Server-only provider preflight telemetry for measured Runway quote latency.
-- This measures provider quote/preflight response time, not completed media-generation latency.
create table if not exists public.media_provider_preflight_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('runway')),
  task text not null check (task in ('image','video','audio')),
  quality text not null check (quality in ('draft','standard','premium')),
  outcome text not null check (outcome in ('succeeded','provider_error','invalid_response','network_error')),
  http_status integer check (http_status is null or http_status between 100 and 599),
  duration_ms integer not null check (duration_ms >= 0),
  model_id text check (model_id is null or char_length(model_id) <= 240),
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  provider_request_id text check (provider_request_id is null or char_length(provider_request_id) <= 160),
  started_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists media_provider_preflight_events_provider_created_idx
  on public.media_provider_preflight_events (provider, created_at desc);
create index if not exists media_provider_preflight_events_task_created_idx
  on public.media_provider_preflight_events (task, created_at desc);
alter table public.media_provider_preflight_events enable row level security;
revoke all on public.media_provider_preflight_events from public, anon, authenticated;
grant select, insert on public.media_provider_preflight_events to service_role;
