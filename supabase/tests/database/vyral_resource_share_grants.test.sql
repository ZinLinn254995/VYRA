begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '25000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','resource-grant-owner@example.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

select ok(
  to_regclass('public.vyral_resource_share_grants') is not null,
  'Revision-pinned resource share grants table exists'
);
select ok(
  to_regclass('public.vyral_resource_share_tokens') is not null,
  'Hashed bearer-token table exists separately'
);
select ok(
  to_regclass('public.vyral_resource_share_audit') is not null,
  'Resource share audit table exists'
);

select is(
  has_table_privilege('authenticated','public.vyral_resource_share_grants','SELECT'),
  true,
  'Owners can read their own grant metadata through RLS'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_grants','INSERT'),
  false,
  'Clients cannot create grants directly'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_grants','UPDATE'),
  false,
  'Clients cannot mutate grant scope or status directly'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_grants','DELETE'),
  false,
  'Clients cannot delete grant records'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_tokens','SELECT'),
  false,
  'Clients cannot read token hashes'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_audit','SELECT'),
  true,
  'Owners can read their own audit events through RLS'
);
select is(
  has_table_privilege('authenticated','public.vyral_resource_share_audit','INSERT'),
  false,
  'Clients cannot forge resource share audit events'
);

select is(
  has_function_privilege('authenticated','public.revoke_vyral_resource_share_grant(uuid)','EXECUTE'),
  true,
  'Authenticated owners can invoke the scoped revoke RPC'
);
select is(
  has_function_privilege('anon','public.revoke_vyral_resource_share_grant(uuid)','EXECUTE'),
  false,
  'Anonymous callers cannot revoke resource share grants'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(
  public.revoke_vyral_resource_share_grant('25000000-0000-4000-8000-000000000099'),
  false,
  'A non-existent or out-of-scope grant cannot be revoked'
);

select * from finish();
rollback;
