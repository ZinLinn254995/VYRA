-- Durable per-sender transfer velocity controls.
-- Defaults are conservative launch safeguards, not a pricing or balance policy.
-- Change the singleton policy row through a reviewed database migration.
create table if not exists public.credit_transfer_policy (
  id smallint primary key default 1 check (id = 1),
  max_transfers_per_hour integer not null default 10
    check (max_transfers_per_hour between 1 and 1000),
  max_transfers_per_day integer not null default 30
    check (max_transfers_per_day between 1 and 10000
      and max_transfers_per_day >= max_transfers_per_hour),
  updated_at timestamptz not null default now()
);

insert into public.credit_transfer_policy (id)
values (1)
on conflict (id) do nothing;

alter table public.credit_transfer_policy enable row level security;
revoke all on public.credit_transfer_policy from public, anon, authenticated, service_role;

create or replace function public.enforce_credit_transfer_velocity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hour_limit integer;
  v_day_limit integer;
  v_hour_count integer;
  v_day_count integer;
begin
  -- Match transfer_credits' per-account lock so concurrent requests cannot
  -- race past the count checks. This trigger runs only for a genuinely new
  -- transfer row; idempotent retries return before the insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.sender_user_id::text, 0)
  );

  select max_transfers_per_hour, max_transfers_per_day
  into v_hour_limit, v_day_limit
  from public.credit_transfer_policy
  where id = 1;

  if v_hour_limit is null or v_day_limit is null then
    raise exception 'Credit transfer policy is not configured.'
      using errcode = '55000';
  end if;

  select
    count(*) filter (where created_at >= now() - interval '1 hour')::integer,
    count(*) filter (where created_at >= now() - interval '24 hours')::integer
  into v_hour_count, v_day_count
  from public.credit_transfers
  where sender_user_id = new.sender_user_id
    and created_at >= now() - interval '24 hours';

  if v_hour_count >= v_hour_limit then
    raise exception 'Credit transfer hourly limit exceeded.'
      using errcode = 'P4291';
  end if;

  if v_day_count >= v_day_limit then
    raise exception 'Credit transfer daily limit exceeded.'
      using errcode = 'P4291';
  end if;

  return new;
end;
$$;

drop trigger if exists credit_transfers_velocity_before_insert on public.credit_transfers;
create trigger credit_transfers_velocity_before_insert
before insert on public.credit_transfers
for each row execute function public.enforce_credit_transfer_velocity();

revoke all on function public.enforce_credit_transfer_velocity() from public, anon, authenticated, service_role;

comment on table public.credit_transfer_policy is
  'Server-enforced per-sender transfer velocity limits. Defaults: 10 transfers per rolling hour and 30 per rolling 24 hours. Policy changes require a reviewed database migration.';
comment on function public.enforce_credit_transfer_velocity() is
  'Serializes sender transfers and enforces configurable rolling hourly/daily transfer-count limits before a transfer can be inserted.';
