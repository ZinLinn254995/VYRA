-- Durable generation usage, provider-reported cost and credit ledger foundation.
-- This migration is schema-only. Do not apply to the production Supabase project
-- until the API integration and authenticated end-to-end tests are complete.

create table if not exists public.generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  capability text not null check (capability in ('text', 'image', 'audio', 'video')),
  model_id text not null check (char_length(model_id) between 1 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'processing', 'succeeded', 'failed', 'cancelled', 'unknown')),
  estimate_status text not null check (estimate_status in ('exact', 'approximate', 'unavailable')),
  estimated_cost_usd numeric(20, 10) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  reserved_credits bigint not null default 0 check (reserved_credits >= 0),
  request_parameters jsonb not null default '{}'::jsonb
    check (jsonb_typeof(request_parameters) = 'object'),
  provider_request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generation_jobs_user_idempotency_unique unique (user_id, idempotency_key),
  constraint generation_jobs_id_user_unique unique (id, user_id)
);

create index if not exists generation_jobs_user_created_idx
  on public.generation_jobs (user_id, created_at desc);

create table if not exists public.provider_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_job_id uuid not null,
  provider text not null check (char_length(provider) between 1 and 100),
  model_id text not null check (char_length(model_id) between 1 and 240),
  provider_request_id text,
  status text not null check (status in ('submitted', 'processing', 'succeeded', 'failed', 'unknown')),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint provider_attempts_job_owner_fk
    foreign key (generation_job_id, user_id)
    references public.generation_jobs (id, user_id) on delete restrict
);

create index if not exists provider_attempts_job_created_idx
  on public.provider_attempts (user_id, generation_job_id, created_at desc);

create table if not exists public.provider_cost_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_job_id uuid not null,
  provider_attempt_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  provider text not null check (char_length(provider) between 1 and 100),
  model_id text not null check (char_length(model_id) between 1 and 240),
  provider_generation_id text,
  actual_cost_usd numeric(20, 10) not null check (actual_cost_usd >= 0),
  usage jsonb not null default '{}'::jsonb check (jsonb_typeof(usage) = 'object'),
  source text not null check (source in ('provider_usage', 'provider_activity', 'provider_invoice', 'manual_verified')),
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint provider_cost_records_job_owner_fk
    foreign key (generation_job_id, user_id)
    references public.generation_jobs (id, user_id) on delete restrict,
  constraint provider_cost_records_attempt_owner_fk
    foreign key (provider_attempt_id, user_id)
    references public.provider_attempts (id, user_id) on delete restrict,
  constraint provider_cost_records_user_idempotency_unique unique (user_id, idempotency_key)
);

create unique index if not exists provider_cost_records_provider_generation_unique
  on public.provider_cost_records (user_id, provider, provider_generation_id)
  where provider_generation_id is not null;

create index if not exists provider_cost_records_user_reported_idx
  on public.provider_cost_records (user_id, reported_at desc);

create table if not exists public.credit_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  generation_job_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 160),
  entry_type text not null check (entry_type in ('grant', 'reserve', 'commit', 'release', 'refund', 'adjustment')),
  available_delta bigint not null default 0,
  reserved_delta bigint not null default 0,
  note text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz not null default now(),
  constraint credit_ledger_entries_user_idempotency_unique unique (user_id, idempotency_key),
  constraint credit_ledger_entries_job_owner_fk
    foreign key (generation_job_id, user_id)
    references public.generation_jobs (id, user_id) on delete restrict,
  constraint credit_ledger_entries_nonzero_delta
    check (available_delta <> 0 or reserved_delta <> 0),
  constraint credit_ledger_entries_valid_transition check (
    (entry_type = 'grant' and available_delta > 0 and reserved_delta = 0) or
    (entry_type = 'reserve' and available_delta < 0 and reserved_delta > 0 and available_delta = -reserved_delta and generation_job_id is not null) or
    (entry_type = 'commit' and available_delta = 0 and reserved_delta < 0 and generation_job_id is not null) or
    (entry_type = 'release' and available_delta > 0 and reserved_delta < 0 and available_delta = -reserved_delta and generation_job_id is not null) or
    (entry_type = 'refund' and available_delta > 0 and reserved_delta = 0) or
    (entry_type = 'adjustment' and reserved_delta = 0 and available_delta <> 0)
  )
);

create index if not exists credit_ledger_entries_user_created_idx
  on public.credit_ledger_entries (user_id, created_at desc);
create index if not exists credit_ledger_entries_job_idx
  on public.credit_ledger_entries (user_id, generation_job_id, created_at)
  where generation_job_id is not null;

create or replace function public.reject_credit_ledger_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Credit ledger entries are immutable; append a compensating entry instead.'
    using errcode = '55000';
end;
$$;

drop trigger if exists credit_ledger_entries_immutable on public.credit_ledger_entries;
create trigger credit_ledger_entries_immutable
before update or delete on public.credit_ledger_entries
for each row execute function public.reject_credit_ledger_mutation();

-- All financial writes are service-role-only. Browser sessions may read their own
-- history, but cannot grant, reserve, settle or refund credits themselves.
create or replace function public.apply_credit_ledger_entry(
  p_user_id uuid,
  p_generation_job_id uuid,
  p_idempotency_key text,
  p_entry_type text,
  p_amount bigint,
  p_note text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.credit_ledger_entries
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.credit_ledger_entries;
  v_entry public.credit_ledger_entries;
  v_available bigint;
  v_reserved bigint;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 160 then
    raise exception 'A customer ID and valid idempotency key are required.' using errcode = '22023';
  end if;
  if p_entry_type not in ('grant', 'reserve', 'commit', 'release', 'refund', 'adjustment') then
    raise exception 'Unsupported ledger entry type.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount = 0 then
    raise exception 'Credit amount must be non-zero.' using errcode = '22023';
  end if;
  if p_entry_type <> 'adjustment' and p_amount < 0 then
    raise exception 'Credit amount must be positive for this entry type.' using errcode = '22023';
  end if;
  if p_entry_type in ('reserve', 'commit', 'release') and p_generation_job_id is null then
    raise exception 'A generation job is required for reserve, commit and release.' using errcode = '22023';
  end if;
  if p_metadata is null or jsonb_typeof(p_metadata) <> 'object' then
    raise exception 'Ledger metadata must be a JSON object.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select * into v_existing
  from public.credit_ledger_entries
  where user_id = p_user_id and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.entry_type <> p_entry_type
       or v_existing.generation_job_id is distinct from p_generation_job_id
       or v_existing.available_delta + v_existing.reserved_delta <> p_amount
       and p_entry_type <> 'reserve'
    then
      raise exception 'Idempotency key was already used with different parameters.' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select coalesce(sum(available_delta), 0)::bigint into v_available
  from public.credit_ledger_entries where user_id = p_user_id;
  select coalesce(sum(reserved_delta), 0)::bigint into v_reserved
  from public.credit_ledger_entries where user_id = p_user_id and generation_job_id = p_generation_job_id;

  case p_entry_type
    when 'grant' then
      v_entry.available_delta := p_amount;
      v_entry.reserved_delta := 0;
    when 'reserve' then
      if v_available < p_amount then
        raise exception 'Insufficient available credits.' using errcode = 'P0001';
      end if;
      v_entry.available_delta := -p_amount;
      v_entry.reserved_delta := p_amount;
    when 'commit' then
      if v_reserved < p_amount then
        raise exception 'Cannot commit more credits than are reserved for this job.' using errcode = 'P0001';
      end if;
      v_entry.available_delta := 0;
      v_entry.reserved_delta := -p_amount;
    when 'release' then
      if v_reserved < p_amount then
        raise exception 'Cannot release more credits than are reserved for this job.' using errcode = 'P0001';
      end if;
      v_entry.available_delta := p_amount;
      v_entry.reserved_delta := -p_amount;
    when 'refund' then
      v_entry.available_delta := p_amount;
      v_entry.reserved_delta := 0;
    when 'adjustment' then
      v_entry.available_delta := p_amount;
      v_entry.reserved_delta := 0;
  end case;

  insert into public.credit_ledger_entries (
    user_id, generation_job_id, idempotency_key, entry_type,
    available_delta, reserved_delta, note, metadata
  ) values (
    p_user_id, p_generation_job_id, p_idempotency_key, p_entry_type,
    v_entry.available_delta, v_entry.reserved_delta, left(p_note, 500), p_metadata
  ) returning * into v_entry;

  return v_entry;
end;
$$;

create or replace function public.record_provider_cost(
  p_user_id uuid,
  p_generation_job_id uuid,
  p_provider_attempt_id uuid,
  p_idempotency_key text,
  p_provider text,
  p_model_id text,
  p_provider_generation_id text,
  p_actual_cost_usd numeric,
  p_usage jsonb,
  p_source text
)
returns public.provider_cost_records
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.provider_cost_records;
  v_record public.provider_cost_records;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;
  if p_user_id is null or p_generation_job_id is null
     or p_idempotency_key is null or length(p_idempotency_key) not between 1 and 160
     or p_provider is null or length(p_provider) not between 1 and 100
     or p_model_id is null or length(p_model_id) not between 1 and 240
     or p_actual_cost_usd is null or p_actual_cost_usd < 0
     or p_usage is null or jsonb_typeof(p_usage) <> 'object'
     or p_source not in ('provider_usage', 'provider_activity', 'provider_invoice', 'manual_verified')
  then
    raise exception 'Invalid provider cost record.' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select * into v_existing
  from public.provider_cost_records
  where user_id = p_user_id and idempotency_key = p_idempotency_key;
  if found then
    if v_existing.generation_job_id <> p_generation_job_id
       or v_existing.provider <> p_provider
       or v_existing.model_id <> p_model_id
       or v_existing.actual_cost_usd <> p_actual_cost_usd
    then
      raise exception 'Provider cost idempotency key conflicts with a different record.' using errcode = '23505';
    end if;
    return v_existing;
  end if;

  insert into public.provider_cost_records (
    user_id, generation_job_id, provider_attempt_id, idempotency_key,
    provider, model_id, provider_generation_id, actual_cost_usd, usage, source
  ) values (
    p_user_id, p_generation_job_id, p_provider_attempt_id, p_idempotency_key,
    p_provider, p_model_id, nullif(p_provider_generation_id, ''),
    p_actual_cost_usd, p_usage, p_source
  ) returning * into v_record;

  return v_record;
end;
$$;

alter table public.generation_jobs enable row level security;
alter table public.provider_attempts enable row level security;
alter table public.provider_cost_records enable row level security;
alter table public.credit_ledger_entries enable row level security;

create policy generation_jobs_select_own on public.generation_jobs
  for select to authenticated using (user_id = (select auth.uid()));
create policy provider_attempts_select_own on public.provider_attempts
  for select to authenticated using (user_id = (select auth.uid()));
create policy provider_cost_records_select_own on public.provider_cost_records
  for select to authenticated using (user_id = (select auth.uid()));
create policy credit_ledger_entries_select_own on public.credit_ledger_entries
  for select to authenticated using (user_id = (select auth.uid()));

revoke all on public.generation_jobs, public.provider_attempts,
  public.provider_cost_records, public.credit_ledger_entries
  from anon, authenticated;
grant select on public.generation_jobs, public.provider_attempts,
  public.provider_cost_records, public.credit_ledger_entries to authenticated;
grant all on public.generation_jobs, public.provider_attempts,
  public.provider_cost_records, public.credit_ledger_entries to service_role;

revoke all on function public.apply_credit_ledger_entry(uuid, uuid, text, text, bigint, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_credit_ledger_entry(uuid, uuid, text, text, bigint, text, jsonb)
  to service_role;
revoke all on function public.record_provider_cost(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_provider_cost(uuid, uuid, uuid, text, text, text, text, numeric, jsonb, text)
  to service_role;

comment on table public.generation_jobs is
  'Server-owned generation job records. Estimate and actual provider cost are intentionally stored separately.';
comment on table public.provider_attempts is
  'Server-owned provider attempts and raw non-secret usage metadata for one generation job.';
comment on table public.provider_cost_records is
  'Provider-reported actual USD cost. Missing provider cost remains absent; never derive actual cost from an estimate.';
comment on table public.credit_ledger_entries is
  'Append-only credit movements. Corrections use compensating entries; browser users have read-only access.';
