begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('21000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'username-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Username A"}'::jsonb, now(), now()),
  ('21000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'username-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Username B"}'::jsonb, now(), now()),
  ('21000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'username-c@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"Username C"}'::jsonb, now(), now())
on conflict (id) do nothing;

update public.profiles set username = 'vyra_creator' where id = '21000000-0000-4000-8000-000000000002';
update public.profiles set username = 'vyra_studio' where id = '21000000-0000-4000-8000-000000000003';

select throws_ok(
  $$ update public.profiles set username = 'UPPERCASE' where id = '21000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'Uppercase usernames are rejected by the database'
);

select throws_ok(
  $$ update public.profiles set username = 'ab' where id = '21000000-0000-4000-8000-000000000001' $$,
  '23514',
  null,
  'Usernames shorter than three characters are rejected'
);

select throws_ok(
  $$ update public.profiles set username = 'vyra_creator' where id = '21000000-0000-4000-8000-000000000001' $$,
  '23505',
  null,
  'Duplicate usernames are rejected case-insensitively by the unique index'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '21000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.search_credit_recipients('vyra')),
  2,
  'Authenticated prefix lookup returns matching public profiles'
);

select is(
  (select count(*)::integer from public.search_credit_recipients('vyra')
   where username in ('vyra_creator', 'vyra_studio')),
  2,
  'Lookup returns public usernames only for matching accounts'
);

select is(
  (select count(*)::integer from public.search_credit_recipients('vyra')
   where user_id = '21000000-0000-4000-8000-000000000001'),
  0,
  'A user cannot discover themselves as a transfer recipient'
);

select throws_ok(
  $$ select * from public.search_credit_recipients('ab') $$,
  '22023',
  'Enter at least 3 valid username characters.',
  'Short lookup queries are rejected'
);

select is(
  has_function_privilege('anon', 'public.search_credit_recipients(text)', 'EXECUTE'),
  false,
  'Anonymous users cannot search recipient profiles'
);

select is(
  has_table_privilege('authenticated', 'public.profile_lookup_limits', 'SELECT'),
  false,
  'Authenticated users cannot inspect lookup rate-limit records'
);

do $ begin
  for i in 1..17 loop
    perform * from public.search_credit_recipients('vyra');
  end loop;
end $;

select throws_ok(
  $ select * from public.search_credit_recipients('vyra') $,
  'P4290',
  'Recipient lookup rate limit exceeded.',
  'Recipient discovery is rate limited after 20 lookups per minute'
);

reset role;
select * from finish();
rollback;
