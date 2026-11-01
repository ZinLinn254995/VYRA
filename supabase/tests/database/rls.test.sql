begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Isolated fixture users. These rows are removed by the transaction rollback.
insert into auth.users (
  id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at
) values
  ('10000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'vyra-rls-a@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"RLS A"}'::jsonb, now(), now()),
  ('10000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'vyra-rls-b@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
   '{"display_name":"RLS B"}'::jsonb, now(), now())
on conflict (id) do nothing;

insert into public.projects (user_id, local_id, title, project_data)
values
  ('10000000-0000-4000-8000-000000000001', 'a-project', 'A private project', '{"format":"short_form"}'),
  ('10000000-0000-4000-8000-000000000002', 'b-project', 'B private project', '{"format":"long_form"}')
on conflict (user_id, local_id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select is(
  (select count(*)::integer from public.projects),
  1,
  'Customer A can only list their own project'
);

select is(
  (select count(*)::integer from public.projects where local_id = 'b-project'),
  0,
  'Customer A cannot read Customer B project'
);

select throws_ok(
  $$ insert into public.projects (user_id, local_id, title, project_data)
     values ('10000000-0000-4000-8000-000000000002', 'spoofed-project', 'Spoofed', '{}') $$,
  '42501',
  null,
  'Customer A cannot create a project owned by Customer B'
);

update public.projects set title = 'A updated project' where local_id = 'a-project';
select is(
  (select title from public.projects where local_id = 'a-project'),
  'A updated project',
  'Customer A can update their own project'
);

update public.projects set title = 'B tampered' where local_id = 'b-project';
reset role;
select is(
  (select title from public.projects where local_id = 'b-project'),
  'B private project',
  'Customer A cannot update Customer B project'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
delete from public.projects where local_id = 'b-project';
reset role;
select is(
  (select count(*)::integer from public.projects where local_id = 'b-project'),
  1,
  'Customer A cannot delete Customer B project'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claims',
  '{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select count(*)::integer from public.profiles),
  1,
  'Customer A can only read their own profile'
);

select is(
  (select count(*)::integer from public.profiles where id = '10000000-0000-4000-8000-000000000002'),
  0,
  'Customer A cannot read Customer B profile'
);

select * from finish();
rollback;
