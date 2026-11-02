begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('23000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'velocity-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Velocity A"}'::jsonb, now(), now()),
  ('23000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'velocity-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Velocity B"}'::jsonb, now(), now()),
  ('23000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'velocity-c@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Velocity C"}'::jsonb, now(), now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '23000000-0000-4000-8000-000000000001', null, 'velocity:grant-a',
    'grant', 200000, 'test fixture', '{}'::jsonb
  ) $$,
  'Service role can seed sender A credits'
);

select lives_ok(
  $$ select public.apply_credit_ledger_entry(
    '23000000-0000-4000-8000-000000000003', null, 'velocity:grant-c',
    'grant', 1000, 'test fixture', '{}'::jsonb
  ) $$,
  'Service role can seed sender C credits'
);

select throws_ok(
  $$ select public.transfer_credits(
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    50001, 'velocity:over-single', null
  ) $$,
  'P4292',
  'Transfer amount exceeds the configured per-transfer limit.',
  'A transfer above the per-transfer amount limit is rejected'
);

select lives_ok(
  $$ select public.transfer_credits(
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    50000, 'velocity:a-1', null
  ) $$,
  'A transfer at the per-transfer limit is allowed'
);

select lives_ok(
  $$ select public.transfer_credits(
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    50000, 'velocity:a-2', null
  ) $$,
  'A second transfer within the rolling daily cap is allowed'
);

select throws_ok(
  $$ select public.transfer_credits(
    '23000000-0000-4000-8000-000000000001',
    '23000000-0000-4000-8000-000000000002',
    1, 'velocity:a-daily-over', null
  ) $$,
  'P4293',
  'Credit transfer 24-hour amount limit exceeded.',
  'A transfer that exceeds the rolling 24-hour amount cap is rejected'
);

select lives_ok(
  $$ do $do$
     begin
       for i in 1..10 loop
         perform public.transfer_credits(
           '23000000-0000-4000-8000-000000000003',
           '23000000-0000-4000-8000-000000000002',
           1, 'velocity:c-' || i::text, null
         );
       end loop;
     end
     $do$ $$,
  'Ten transfers within one hour are allowed'
);

select is(
  (select count(*)::integer from public.credit_transfers
   where sender_user_id = '23000000-0000-4000-8000-000000000003'),
  10,
  'The sender has exactly ten completed transfers'
);

select throws_ok(
  $$ select public.transfer_credits(
    '23000000-0000-4000-8000-000000000003',
    '23000000-0000-4000-8000-000000000002',
    1, 'velocity:c-hourly-over', null
  ) $$,
  'P4291',
  'Credit transfer hourly limit exceeded.',
  'An eleventh transfer in one hour is rejected'
);

select * from finish();
rollback;
