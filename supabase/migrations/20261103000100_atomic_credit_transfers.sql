-- Atomic account-to-account credit transfers.
-- This migration extends the existing append-only usage ledger. It does not
-- create payment packages, process payments, or enable customer-facing transfers.

create table if not exists public.credit_transfers (
  id uuid primary key default gen_random_uuid(),
  sender_user_id uuid not null references auth.users (id) on delete restrict,
  recipient_user_id uuid not null references auth.users (id) on delete restrict,
  amount bigint not null check (amount > 0),
  idempotency_key text not null
    check (char_length(idempotency_key) between 1 and 160)
    check (idempotency_key ~ '^[A-Za-z0-9._:-]{1,160}$'),
  status text not null default 'completed'
    check (status = 'completed'),
  note text,
  created_at timestamptz not null default now(),
  constraint credit_transfers_not_self check (sender_user_id <> recipient_user_id),
  constraint credit_transfers_sender_idempotency_unique
    unique (sender_user_id, idempotency_key)
);

create index if not exists credit_transfers_sender_created_idx
  on public.credit_transfers (sender_user_id, created_at desc);
create index if not exists credit_transfers_recipient_created_idx
  on public.credit_transfers (recipient_user_id, created_at desc);

alter table public.credit_ledger_entries
  add column if not exists transfer_id uuid
    references public.credit_transfers (id) on delete restrict;

create index if not exists credit_ledger_entries_transfer_idx
  on public.credit_ledger_entries (transfer_id)
  where transfer_id is not null;

alter table public.credit_ledger_entries
  drop constraint if exists credit_ledger_entries_valid_transition;

alter table public.credit_ledger_entries
  add constraint credit_ledger_entries_valid_transition check (
    (entry_type = 'grant' and available_delta > 0 and reserved_delta = 0 and generation_job_id is null) or
    (entry_type = 'reserve' and available_delta < 0 and reserved_delta > 0 and available_delta = -reserved_delta and generation_job_id is not null) or
    (entry_type = 'commit' and available_delta = 0 and reserved_delta < 0 and generation_job_id is not null) or
    (entry_type = 'release' and available_delta > 0 and reserved_delta < 0 and available_delta = -reserved_delta and generation_job_id is not null) or
    (entry_type = 'refund' and available_delta > 0 and reserved_delta = 0 and generation_job_id is null) or
    (entry_type = 'adjustment' and reserved_delta = 0 and available_delta <> 0 and generation_job_id is null) or
    (entry_type = 'transfer_debit' and available_delta < 0 and reserved_delta = 0 and generation_job_id is null and transfer_id is not null) or
    (entry_type = 'transfer_credit' and available_delta > 0 and reserved_delta = 0 and generation_job_id is null and transfer_id is not null)
  );

alter table public.credit_ledger_entries
  drop constraint if exists credit_ledger_entries_transfer_reference_check;

alter table public.credit_ledger_entries
  add constraint credit_ledger_entries_transfer_reference_check check (
    (entry_type in ('transfer_debit', 'transfer_credit') and transfer_id is not null) or
    (entry_type not in ('transfer_debit', 'transfer_credit') and transfer_id is null)
  );

create or replace function public.reject_credit_transfer_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Credit transfer records are immutable; use an authorized compensating ledger event.'
    using errcode = '55000';
end;
$$;

drop trigger if exists credit_transfers_immutable on public.credit_transfers;
create trigger credit_transfers_immutable
before update or delete on public.credit_transfers
for each row execute function public.reject_credit_transfer_mutation();

-- Deferred validation guarantees that a committed transfer always has exactly
-- one sender debit and one equal recipient credit in the same DB transaction.
create or replace function public.assert_credit_transfer_balanced()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transfer_id uuid;
  v_transfer public.credit_transfers;
  v_entry_count integer;
  v_debit_count integer;
  v_credit_count integer;
  v_signed_total bigint;
begin
  if tg_table_name = 'credit_transfers' then
    v_transfer_id := new.id;
  else
    v_transfer_id := new.transfer_id;
  end if;

  if v_transfer_id is null then
    return null;
  end if;

  select * into v_transfer
  from public.credit_transfers
  where id = v_transfer_id;

  if not found then
    raise exception 'Credit transfer reference does not exist.' using errcode = '23503';
  end if;

  select
    count(*)::integer,
    count(*) filter (
      where entry_type = 'transfer_debit'
        and user_id = v_transfer.sender_user_id
        and available_delta = -v_transfer.amount
        and reserved_delta = 0
    )::integer,
    count(*) filter (
      where entry_type = 'transfer_credit'
        and user_id = v_transfer.recipient_user_id
        and available_delta = v_transfer.amount
        and reserved_delta = 0
    )::integer,
    coalesce(sum(available_delta), 0)::bigint
  into v_entry_count, v_debit_count, v_credit_count, v_signed_total
  from public.credit_ledger_entries
  where transfer_id = v_transfer_id;

  if v_entry_count <> 2 or v_debit_count <> 1 or v_credit_count <> 1 or v_signed_total <> 0 then
    raise exception 'Credit transfer ledger entries are incomplete or unbalanced.'
      using errcode = '23514';
  end if;

  return null;
end;
$$;

drop trigger if exists credit_transfers_balanced_after_insert on public.credit_transfers;
create constraint trigger credit_transfers_balanced_after_insert
after insert on public.credit_transfers
deferrable initially deferred
for each row execute function public.assert_credit_transfer_balanced();

drop trigger if exists credit_ledger_transfer_balanced_after_insert on public.credit_ledger_entries;
create constraint trigger credit_ledger_transfer_balanced_after_insert
after insert on public.credit_ledger_entries
deferrable initially deferred
for each row
when (new.transfer_id is not null)
execute function public.assert_credit_transfer_balanced();

create or replace function public.transfer_credits(
  p_sender_user_id uuid,
  p_recipient_user_id uuid,
  p_amount bigint,
  p_idempotency_key text,
  p_note text default null
)
returns public.credit_transfers
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.credit_transfers;
  v_transfer public.credit_transfers;
  v_available bigint;
  v_lock_user_id uuid;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required.' using errcode = '42501';
  end if;

  if p_sender_user_id is null or p_recipient_user_id is null
     or p_sender_user_id = p_recipient_user_id then
    raise exception 'A sender and a different recipient are required.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be a positive integer.' using errcode = '22023';
  end if;
  if p_idempotency_key is null
     or p_idempotency_key !~ '^[A-Za-z0-9._:-]{1,160}$' then
    raise exception 'A valid idempotency key is required.' using errcode = '22023';
  end if;

  if not exists (select 1 from auth.users where id = p_sender_user_id)
     or not exists (select 1 from auth.users where id = p_recipient_user_id) then
    raise exception 'Sender or recipient account was not found.' using errcode = '22023';
  end if;

  -- Acquire the same per-account locks used by apply_credit_ledger_entry.
  -- Stable ordering prevents sender/recipient lock inversion between transfers.
  for v_lock_user_id in
    select account_id
    from unnest(array[p_sender_user_id, p_recipient_user_id]) as accounts(account_id)
    order by account_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_lock_user_id::text, 0)
    );
  end loop;

  select * into v_existing
  from public.credit_transfers
  where sender_user_id = p_sender_user_id
    and idempotency_key = p_idempotency_key;

  if found then
    if v_existing.recipient_user_id <> p_recipient_user_id
       or v_existing.amount <> p_amount then
      raise exception 'Idempotency key was already used with different transfer parameters.'
        using errcode = '23505';
    end if;
    return v_existing;
  end if;

  select coalesce(sum(available_delta), 0)::bigint
  into v_available
  from public.credit_ledger_entries
  where user_id = p_sender_user_id;

  if v_available < p_amount then
    raise exception 'Insufficient available credits.' using errcode = 'P0001';
  end if;

  insert into public.credit_transfers (
    sender_user_id, recipient_user_id, amount, idempotency_key, note
  ) values (
    p_sender_user_id, p_recipient_user_id, p_amount, p_idempotency_key, left(p_note, 500)
  )
  returning * into v_transfer;

  insert into public.credit_ledger_entries (
    user_id, transfer_id, idempotency_key, entry_type,
    available_delta, reserved_delta, note, metadata
  ) values
  (
    p_sender_user_id, v_transfer.id, 'transfer:' || v_transfer.id::text || ':debit',
    'transfer_debit', -p_amount, 0, left(p_note, 500),
    pg_catalog.jsonb_build_object(
      'transfer_id', v_transfer.id,
      'counterparty_user_id', p_recipient_user_id
    )
  ),
  (
    p_recipient_user_id, v_transfer.id, 'transfer:' || v_transfer.id::text || ':credit',
    'transfer_credit', p_amount, 0, left(p_note, 500),
    pg_catalog.jsonb_build_object(
      'transfer_id', v_transfer.id,
      'counterparty_user_id', p_sender_user_id
    )
  );

  return v_transfer;
end;
$$;

alter table public.credit_transfers enable row level security;

create policy credit_transfers_select_participant
  on public.credit_transfers
  for select to authenticated
  using (
    sender_user_id = (select auth.uid())
    or recipient_user_id = (select auth.uid())
  );

revoke all on public.credit_transfers from anon, authenticated, service_role;
grant select on public.credit_transfers to authenticated;

revoke all on function public.transfer_credits(uuid, uuid, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.transfer_credits(uuid, uuid, bigint, text, text)
  to service_role;

comment on table public.credit_transfers is
  'Immutable, atomic account-to-account credit movements. Every committed row is protected by a deferred balanced-ledger constraint.';
comment on function public.transfer_credits(uuid, uuid, bigint, text, text) is
  'Service-role-only atomic credit transfer. The caller must derive sender identity from a verified Supabase session.';
