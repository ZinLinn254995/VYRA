begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

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

set local role authenticated;
select set_config('request.jwt.claim.sub', '22000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"22000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (public.get_credit_wallet() ->> 'availableBalance')::bigint,
  100::bigint,
  'Wallet available balance reflects all ledger entries'
);

select is(
  jsonb_array_length(public.get_credit_wallet() -> 'recentActivity'),
  2,
  'Wallet returns a bounded recent ledger activity list'
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
