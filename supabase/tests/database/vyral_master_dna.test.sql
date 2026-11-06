begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('24000000-0000-4000-8000-000000000001','authenticated','authenticated','master-dna-a@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('24000000-0000-4000-8000-000000000002','authenticated','authenticated','master-dna-b@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.vyrals (id,user_id,name)
values
  ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','Master DNA Test A'),
  ('24000000-0000-4000-8000-000000000012','24000000-0000-4000-8000-000000000002','Master DNA Test B');

insert into public.vyral_assets (
  id,vyral_id,user_id,name,original_filename,asset_type,mime_type,size_bytes,storage_path
) values
  ('24000000-0000-4000-8000-000000000021','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','Main','main.png','image','image/png',100,'master-dna-test/a/main.png'),
  ('24000000-0000-4000-8000-000000000022','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','Support','support.png','image','image/png',100,'master-dna-test/a/support.png');

select is(
  (select master_dna_status from public.vyrals where id='24000000-0000-4000-8000-000000000011'),
  'needs_classification',
  'New unclassified assets require Master DNA classification'
);

update public.vyral_assets
set master_dna_role = case when id='24000000-0000-4000-8000-000000000021' then 'main' else 'supporting' end,
    master_dna_purpose = case when id='24000000-0000-4000-8000-000000000021' then 'Primary visual identity.' else 'Supporting voice identity.' end
where vyral_id='24000000-0000-4000-8000-000000000011';

select lives_ok(
  $$ insert into public.vyral_asset_relationships
     (vyral_id,user_id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       'belongs_to','asset','24000000-0000-4000-8000-000000000021','vyral',null,'The main asset defines this Vyral.') $$,
  'An asset can explicitly belong to its Vyral root'
);

select lives_ok(
  $$ insert into public.vyral_asset_relationships
     (vyral_id,user_id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       'supports','asset','24000000-0000-4000-8000-000000000022','asset','24000000-0000-4000-8000-000000000021','The support asset belongs to the main asset.') $$,
  'An asset can be related to another asset in the same Vyral'
);

select is(
  (select count(*)::integer from public.vyral_asset_relationships where vyral_id='24000000-0000-4000-8000-000000000011'),
  2,
  'Both semantic graph edges are stored'
);

select throws_ok(
  $$ insert into public.vyral_asset_relationships
     (vyral_id,user_id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       'supports','asset','24000000-0000-4000-8000-000000000022','asset','24000000-0000-4000-8000-000000000099','Invalid cross-scope target.') $$,
  '23503', null,
  'A relationship cannot reference an asset outside its Vyral'
);

select throws_ok(
  $$ insert into public.vyral_asset_relationships
     (vyral_id,user_id,relationship_type,from_kind,from_asset_id,to_kind,to_asset_id,rationale)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       'references','asset','24000000-0000-4000-8000-000000000021','asset','24000000-0000-4000-8000-000000000021','Self edge.') $$,
  '23514', null,
  'Self-relationships are rejected'
);

select throws_ok(
  $$ insert into public.vyral_asset_relationships
     (vyral_id,user_id,relationship_type,from_kind,to_kind,rationale)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       'references','vyral','vyral','Root-to-root edge.') $$,
  '23514', null,
  'Root-to-root relationships are rejected'
);

select lives_ok(
  $$ insert into public.vyral_master_dna_revisions
     (vyral_id,user_id,revision,schema_id,schema_version,manifest_sha256,vyral_fingerprint,snapshot,created_by)
     values ('24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       1,'vyra.vyral-master-dna',1,repeat('a',64),repeat('b',64),
       '{"schema_id":"vyra.vyral-master-dna","schema_version":1}'::jsonb,
       '24000000-0000-4000-8000-000000000001') $$,
  'Service role can append a Master DNA snapshot'
);

select throws_ok(
  $$ update public.vyral_master_dna_revisions set revision=2 where vyral_id='24000000-0000-4000-8000-000000000011' $$,
  '55000',
  'Master DNA revisions are immutable; create a new revision instead.',
  'Master DNA snapshots cannot be edited in place'
);

select is(
  has_table_privilege('authenticated','public.vyral_master_dna_revisions','INSERT'),
  false,
  'Authenticated clients cannot insert Master DNA revisions directly'
);

select is(
  has_table_privilege('authenticated','public.vyral_master_dna_revisions','UPDATE'),
  false,
  'Authenticated clients cannot update Master DNA revisions'
);

select is(
  has_table_privilege('authenticated','public.vyral_master_dna_revisions','DELETE'),
  false,
  'Authenticated clients cannot delete Master DNA revisions'
);

select is(
  (select master_dna_status from public.vyrals where id='24000000-0000-4000-8000-000000000011'),
  'stale',
  'Adding or editing relationships invalidates the previous Master DNA snapshot'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(
  (select count(*)::integer from public.vyral_master_dna_revisions),
  1,
  'Owner can read their own Master DNA snapshot'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000002","role":"authenticated"}',true);

select is(
  (select count(*)::integer from public.vyral_master_dna_revisions),
  0,
  'Other customers cannot read private Master DNA snapshots'
);

select * from finish();
rollback;
