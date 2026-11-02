-- Configurable, database-enforced transfer velocity and amount controls.
-- Defaults are conservative launch safeguards; operators may adjust them through
-- an audited database migration after product/legal/payment review.

create table if not exists public.credit_transfer_policy (
  singleton boolean primary key default true check (singleton),
  max_transfers_per_hour integer not null check (max_transfers_per_hour between 1 and 100),
  max_amount_per_transfer bigint not null check (max_amount_per_transfer > 0),
  max_amount_per_24h bigint not null check (max_amount_per_24h >= max_amount_per_transfer),
  updated_at timestamptz not null default now()
);

insert into public.credit_transfer_policy (
  singleton, max_transfers_per_hour, max_amount_per_transfer, max_amount_per_24h
) values (true, 10, 50000, 100000)
on conflict (singleton) do nothing;

alter table public.credit_transfer_policy enable row level security;
revoke all on public.credit_transfer_policy from public, anon, authenticated, service_role;

create or replace function public.enforce_credit_transfer_policy()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_policy public.credit_transfer_policy;
  v_hourly_count integer;
  v_daily_total bigint;
begin
  select * into v_policy
  from public.credit_transfer_policy
  where singleton = true;

  if not found then
    raise exception 'Credit transfer policy is not configured.'
      using errcode = '55000';
  end if;

  -- Match the sender lock used by transfer_credits so concurrent requests
  -- cannot race past the velocity checks.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.sender_user_id::text, 0)
  );

  if new.amount > v_policy.max_amount_per_transfer then
    raise exception 'Transfer amount exceeds the configured per-transfer limit.'
      using errcode = 'P4292';
  end if;

  select count(*)::integer
  into v_hourly_count
  from public.credit_transfers t
  where t.sender_user_id = new.sender_user_id
    and t.created_at > now() - interval '1 hour';

  if v_hourly_count >= v_policy.max_transfers_per_hour then
    raise exception 'Credit transfer hourly limit exceeded.'
      using errcode = 'P4291';
  end if;

  select coalesce(sum(t.amount), 0)::bigint
  into v_daily_total
  from public.credit_transfers t
  where t.sender_user_id = new.sender_user_id
    and t.created_at > now() - interval '24 hours';

  if v_daily_total + new.amount > v_policy.max_amount_per_24h then
    raise exception 'Credit transfer 24-hour amount limit exceeded.'
      using errcode = 'P4293';
  end if;

  return new;
end;
$$;

drop trigger if exists credit_transfers_velocity_guard on public.credit_transfers;
create trigger credit_transfers_velocity_guard
before insert on public.credit_transfers
for each row execute function public.enforce_credit_transfer_policy();

revoke all on function public.enforce_credit_transfer_policy() from public, anon, authenticated, service_role;

comment on table public.credit_transfer_policy is
  'Private operator-controlled transfer velocity policy. Defaults: 10 transfers/hour, 50,000 credits/transfer, 100,000 credits/rolling 24 hours.';
