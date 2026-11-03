begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('22000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'wallet-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Wallet A"}'::jsonb, now(), now()),
  ('22000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'wallet-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Wallet B"}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles set username = 'wallet_friend' where id = '22000000-0000-4000-8000-000000000002';

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001', null, 'wallet-test:grant',
    'grant', 120, 'Starter credits', '{}'::jsonb
  ) $$,
  'Service role can create fixture wallet credits'
);

select lives_ok(
  $$ select public.transfer_credits(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000002',
    20, 'wallet-test:transfer', 'Wallet test'
  ) $$,
  'Wallet fixture transfer completes'
);

insert into public.generation_jobs (
  id, user_id, idempotency_key, capability, model_id, estimate_status
) values (
  '22000000-0000-4000-8000-000000000010',
  '22000000-0000-4000-8000-000000000001',
  'wallet-test:generation',
  'text',
  'test/mock-model',
  'unavailable'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:reserve', 'reserve', 50, 'Reserve for generation', '{}'::jsonb
  ) $$,
  'Wallet can reserve credits for a generation job'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:commit', 'commit', 30, 'Commit consumed credits', '{}'::jsonb
  ) $$,
  'Wallet can commit only consumed reserved credits'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:release', 'release', 20, 'Release unused reservation', '{}'::jsonb
  ) $$,
  'Wallet can release unused reserved credits'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001', null,
    'wallet-test:refund', 'refund', 10, 'Refund approved credits', '{}'::jsonb
  ) $$,
  'Wallet can append a compensating refund credit'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:reserve', 'reserve', 50, 'Reserve for generation', '{}'::jsonb
  ) $$,
  'Repeated reserve idempotency key returns the original entry'
);

select throws_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:insufficient', 'reserve', 1000, 'Too many credits', '{}'::jsonb
  ) $$,
  'P0001',
  'Insufficient available credits.',
  'Wallet rejects a reservation above the available balance'
);

select throws_ok(
  $$ select public.apply_credit_ledger_entry(
    '22000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000010',
    'wallet-test:overcommit', 'commit', 1, 'Commit without reservation', '{}'::jsonb
  ) $$,
  'P0001',
  'Cannot commit more credits than are reserved for this job.',
  'Wallet rejects committing credits that are not reserved'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (public.get_credit_wallet() ->> 'availableBalance')::bigint,
  80::bigint,
  'Wallet available balance reflects grant, transfer, reserve, commit, release and refund'
);

select is(
  (public.get_credit_wallet() ->> 'reservedBalance')::bigint,
  0::bigint,
  'Wallet reserved balance is zero after commit and release'
);

select is(
  jsonb_array_length(public.get_credit_wallet() -> 'recentActivity'),
  6,
  'Wallet returns the bounded recent ledger activity list without duplicate retries'
);

select is(
  (select count(*)::integer
   from jsonb_array_elements(public.get_credit_wallet() -> 'recentActivity') activity
   where activity ->> 'counterpartyUsername' = 'wallet_friend'),
  1,
  'Transfer activity resolves only the public counterparty username'
);

select * from finish();
rollback;
