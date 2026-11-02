begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('20000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'credit-transfer-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Credit A"}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'credit-transfer-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Credit B"}'::jsonb, now(), now()),
  ('20000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'credit-transfer-c@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Credit C"}'::jsonb, now(), now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '20000000-0000-4000-8000-000000000001', null, 'transfer-test:grant-a',
    'grant', 100, 'test fixture', '{}'::jsonb
  ) $$,
  'Service role can grant fixture credits'
);

select lives_ok(
  $$ select public.transfer_credits(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    25, 'transfer-test:one', 'fixture transfer'
  ) $$,
  'A valid transfer completes atomically'
);

select is(
  (select coalesce(sum(available_delta), 0)::bigint
   from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000001'),
  75::bigint,
  'Sender balance is debited exactly once'
);

select is(
  (select coalesce(sum(available_delta), 0)::bigint
   from public.credit_ledger_entries
   where user_id = '20000000-0000-4000-8000-000000000002'),
  25::bigint,
  'Recipient balance is credited exactly once'
);

select is(
  (select count(*)::integer from public.credit_ledger_entries
   where transfer_id = (select id from public.credit_transfers
     where sender_user_id = '20000000-0000-4000-8000-000000000001'
       and idempotency_key = 'transfer-test:one')),
  2,
  'A completed transfer has exactly two ledger entries'
);

select is(
  (select coalesce(sum(available_delta), 0)::bigint
   from public.credit_ledger_entries
   where transfer_id = (select id from public.credit_transfers
     where sender_user_id = '20000000-0000-4000-8000-000000000001'
       and idempotency_key = 'transfer-test:one')),
  0::bigint,
  'The debit and credit reconcile to zero'
);

select lives_ok(
  $$ select public.transfer_credits(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    25, 'transfer-test:one', 'duplicate retry'
  ) $$,
  'A retry with the same idempotency key returns the original transfer'
);

select is(
  (select count(*)::integer from public.credit_transfers),
  1,
  'An idempotent retry does not create a second transfer'
);

select throws_ok(
  $$ select public.transfer_credits(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    26, 'transfer-test:one', null
  ) $$,
  '23505',
  'Idempotency key was already used with different transfer parameters.',
  'Reusing an idempotency key with different parameters is rejected'
);

select throws_ok(
  $$ select public.transfer_credits(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000002',
    1000, 'transfer-test:insufficient', null
  ) $$,
  'P0001',
  'Insufficient available credits.',
  'A sender cannot transfer more than the available balance'
);

select throws_ok(
  $$ select public.transfer_credits(
    '20000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    1, 'transfer-test:self', null
  ) $$,
  '22023',
  'A sender and a different recipient are required.',
  'Self-transfers are rejected'
);

select is(
  has_function_privilege(
    'authenticated',
    'public.transfer_credits(uuid,uuid,bigint,text,text)',
    'EXECUTE'
  ),
  false,
  'Authenticated browser sessions cannot execute the financial transfer RPC'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.credit_transfers),
  1,
  'Sender can read their own transfer history'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.credit_transfers),
  1,
  'Recipient can read their own transfer history'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '20000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims',
  '{"sub":"20000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.credit_transfers),
  0,
  'Unrelated customers cannot read another transfer'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select throws_ok(
  $$ update public.credit_ledger_entries
     set note = 'tampered'
     where transfer_id = (select id from public.credit_transfers limit 1) $$,
  '55000',
  'Credit ledger entries are immutable; append a compensating entry instead.',
  'Transfer ledger entries cannot be edited'
);

select throws_ok(
  $$ update public.credit_transfers set note = 'tampered' $$,
  '55000',
  'Credit transfer records are immutable; use an authorized compensating ledger event.',
  'Completed transfer records cannot be edited'
);

select * from finish();
rollback;
