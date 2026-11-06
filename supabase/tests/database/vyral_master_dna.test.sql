begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

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
update public.vyrals
set master_dna_purpose = 'A primary character with supporting production resources.',
    master_dna_intended_uses = '["storyboarding","video_generation"]'::jsonb
where id='24000000-0000-4000-8000-000000000011';


set local role authenticated;
select set_config('request.jwt.claim.sub','24000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"24000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok(
  $ select public.set_vyral_master_dna_asset_classification(
    '24000000-0000-4000-8000-000000000021','main','Primary visual identity.',null,'The main asset defines this Vyral.'
  ) $,
  'Owner can atomically classify a Main Asset and link it to the Vyral root'
);

select lives_ok(
  $ select public.set_vyral_master_dna_asset_classification(
    '24000000-0000-4000-8000-000000000022','supporting','Supporting voice identity.',
    '24000000-0000-4000-8000-000000000021','The support asset belongs to the main asset.'
  ) $,
  'Owner can atomically classify a Supporting Asset and link it to a Main Asset'
);

select is(
  has_function_privilege('authenticated','public.set_vyral_master_dna_asset_classification(uuid,text,text,uuid,text)','EXECUTE'),
  true,
  'Authenticated owners can call the scoped classification function'
);

select is(
  has_function_privilege('anon','public.set_vyral_master_dna_asset_classification(uuid,text,text,uuid,text)','EXECUTE'),
  false,
  'Anonymous users cannot call the classification function'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

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

insert into public.vyral_asset_versions
  (id,asset_id,vyral_id,user_id,version_number,storage_path,mime_type,size_bytes,sha256)
values
  ('24000000-0000-4000-8000-000000000031','24000000-0000-4000-8000-000000000021','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',1,'master-dna-test/a/main-v1.png','image/png',100,repeat('c',64)),
  ('24000000-0000-4000-8000-000000000032','24000000-0000-4000-8000-000000000022','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',1,'master-dna-test/a/support-v1.png','image/png',100,repeat('d',64));

insert into public.vyral_dna_records
  (id,vyral_id,user_id,asset_id,scope,schema_version,payload,source_kind)
values
  ('24000000-0000-4000-8000-000000000041','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000021','asset',3,'{}'::jsonb,'system'),
  ('24000000-0000-4000-8000-000000000042','24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001','24000000-0000-4000-8000-000000000022','asset',3,'{}'::jsonb,'system');

select lives_ok(
  $$ insert into public.vyral_master_dna_revisions
     (vyral_id,user_id,revision,schema_id,schema_version,manifest_sha256,vyral_fingerprint,snapshot,created_by)
     values (
       '24000000-0000-4000-8000-000000000011','24000000-0000-4000-8000-000000000001',
       1,'vyra.vyral-master-dna',1,repeat('a',64),repeat('b',64),
       jsonb_build_object(
         'schema_id','vyra.vyral-master-dna',
         'schema_version',1,
         'vyral',jsonb_build_object('vyral_id','24000000-0000-4000-8000-000000000011'),
         'snapshot',jsonb_build_object('revision',1),
         'purpose',jsonb_build_object('summary','A primary character with supporting production resources.','intended_uses','["storyboarding","video_generation"]'::jsonb),
         'assets',jsonb_build_array(
           jsonb_build_object('asset_id','24000000-0000-4000-8000-000000000021','asset_version_id','24000000-0000-4000-8000-000000000031','role','main','purpose','Primary visual identity.','dna_ref',jsonb_build_object('record_id','24000000-0000-4000-8000-000000000041')),
           jsonb_build_object('asset_id','24000000-0000-4000-8000-000000000022','asset_version_id','24000000-0000-4000-8000-000000000032','role','supporting','purpose','Supporting voice identity.','dna_ref',jsonb_build_object('record_id','24000000-0000-4000-8000-000000000042'))
         ),
         'relationships',jsonb_build_array(
           jsonb_build_object('relationship_id','edge-1'),
           jsonb_build_object('relationship_id','edge-2')
         ),
         'integrity',jsonb_build_object('manifest_sha256',repeat('a',64),'vyral_fingerprint',repeat('b',64))
       ),
       '24000000-0000-4000-8000-000000000001'
     ) $$,
  'Service role can append a Master DNA snapshot after canonical membership validation'
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
  'ready',
  'A validated Master DNA revision marks the Vyral ready'
);

update public.vyral_asset_relationships
set rationale = 'Updated rationale makes the prior snapshot stale.'
where vyral_id='24000000-0000-4000-8000-000000000011'
  and relationship_type='belongs_to';

select is(
  (select master_dna_status from public.vyrals where id='24000000-0000-4000-8000-000000000011'),
  'stale',
  'Changing a relationship invalidates the previous Master DNA snapshot'
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
