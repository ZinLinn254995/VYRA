begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'vyra-ledger-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Ledger A"}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'vyra-ledger-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Ledger B"}'::jsonb, now(), now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.generation_jobs (
  id, user_id, idempotency_key, capability, model_id, estimate_status
) values (
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'job-a-1', 'video', 'provider/model', 'approximate'
);

select is(
  (public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001', null,
    'welcome-grant-a', 'grant', 100, 'Test grant'
  )).available_delta,
  100::bigint,
  'A service-side credit grant creates an available balance'
);

select is(
  (public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001', null,
    'welcome-grant-a', 'grant', 100, 'Test grant'
  )).id,
  (select id from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000001'
     and idempotency_key = 'welcome-grant-a'),
  'Repeating a grant with the same idempotency key returns the original entry'
);

select is(
  (public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'reserve-job-a', 'reserve', 30, 'Reserve for generation'
  )).id,
  (public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'reserve-job-a', 'reserve', 30, 'Reserve for generation'
  )).id,
  'Repeating a reservation does not create a second debit'
);

select is(
  (select sum(available_delta)::bigint from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000001'),
  70::bigint,
  'A reservation reduces available credits exactly once'
);

select is(
  (select sum(reserved_delta)::bigint from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000001'
     and generation_job_id = '30000000-0000-4000-8000-000000000001'),
  30::bigint,
  'Reserved credits are tracked separately from available credits'
);

select throws_ok(
  $$ select public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'reserve-too-much', 'reserve', 100, 'Must fail'
  ) $$,
  'P0001',
  null,
  'A reservation cannot exceed the available credit balance'
);

select public.apply_credit_ledger_entry(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'commit-job-a', 'commit', 20, 'Commit consumed credits'
);
select public.apply_credit_ledger_entry(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'release-job-a', 'release', 10, 'Release unused credits'
);

select is(
  (select sum(available_delta)::bigint from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000001'),
  80::bigint,
  'Commit and release settle a reservation without double charging'
);

select (public.record_provider_cost(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  null, 'provider-cost-job-a', 'openrouter', 'provider/model',
  'provider-generation-123', 0.0123, '{"units":1}'::jsonb, 'provider_usage'
)).id;
select (public.record_provider_cost(
  '20000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  null, 'provider-cost-job-a', 'openrouter', 'provider/model',
  'provider-generation-123', 0.0123, '{"units":1}'::jsonb, 'provider_usage'
)).id;

select is(
  (select count(*)::integer from public.provider_cost_records
   where user_id = '20000000-0000-4000-8000-000000000001'),
  1,
  'Repeated provider cost ingestion is idempotent'
);

select public.apply_credit_ledger_entry(
  '20000000-0000-4000-8000-000000000002', null,
  'welcome-grant-b', 'grant', 25, 'Other customer grant'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.credit_ledger_entries),
  4,
  'A customer can read their own ledger but not another customer ledger'
);

select throws_ok(
  $$ insert into public.credit_ledger_entries (
       user_id, idempotency_key, entry_type, available_delta
     ) values (
       '20000000-0000-4000-8000-000000000001', 'browser-forged', 'grant', 999
     ) $$,
  '42501',
  null,
  'A browser session cannot create or grant credits'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select throws_ok(
  $$ update public.credit_ledger_entries
     set note = 'tampered'
     where user_id = '20000000-0000-4000-8000-000000000001'
       and idempotency_key = 'welcome-grant-a' $$,
  '55000',
  'Credit ledger entries are immutable; append a compensating entry instead.',
  'Even privileged writes cannot edit an existing ledger entry'
);

select * from finish();
rollback;
