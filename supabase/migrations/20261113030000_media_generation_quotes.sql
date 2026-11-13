-- Canonical owner-scoped quote records for VYRA's platform-managed media preflight.
-- This stores estimates only; it never creates a generation job or reserves credits.
create table if not exists public.media_generation_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  task text not null check (task in ('image', 'video', 'audio')),
  quality text not null check (quality in ('draft', 'standard', 'premium')),
  selection_mode text not null default 'auto' check (selection_mode in ('auto', 'manual')),
  request_fingerprint text not null check (request_fingerprint ~ '^[a-f0-9]{64}$'),
  provider text not null check (char_length(provider) between 1 and 80),
  provider_config_id text not null check (char_length(provider_config_id) between 1 and 64),
  provider_model_id text not null check (char_length(provider_model_id) between 1 and 240),
  estimated_credits numeric(18,6) not null check (estimated_credits >= 0),
  estimated_cost_usd numeric(18,6) not null check (estimated_cost_usd >= 0),
  request_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(request_payload) = 'object'),
  routing_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(routing_metadata) = 'object'),
  status text not null default 'quoted' check (status in ('quoted', 'approved', 'used', 'expired', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null,
  constraint media_generation_quotes_expiry_after_creation check (expires_at > created_at)
);

create index if not exists media_generation_quotes_owner_created_idx
  on public.media_generation_quotes(user_id, created_at desc);
create index if not exists media_generation_quotes_expiry_idx
  on public.media_generation_quotes(expires_at)
  where status in ('quoted', 'approved');

alter table public.media_generation_quotes enable row level security;
revoke all on table public.media_generation_quotes from public, anon, authenticated;
grant select, insert, update on table public.media_generation_quotes to service_role;
