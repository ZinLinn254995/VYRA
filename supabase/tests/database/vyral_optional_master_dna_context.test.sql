begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '25000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'optional-context@example.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.vyrals (id,user_id,name,metadata)
values ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','Single Asset Vyral','{}'::jsonb);

insert into public.vyral_assets (
  id,vyral_id,user_id,name,original_filename,asset_type,mime_type,size_bytes,storage_path
) values (
  '25000000-0000-4000-8000-000000000021','25000000-0000-4000-8000-000000000011',
  '25000000-0000-4000-8000-000000000001','Independent Image','image.png','image','image/png',100,
  'optional-context/one/image.png'
);

insert into public.vyral_asset_versions (
  id,asset_id,vyral_id,user_id,version_number,storage_path,mime_type,size_bytes,sha256
) values (
  '25000000-0000-4000-8000-000000000031','25000000-0000-4000-8000-000000000021',
  '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
  1,'optional-context/one/image.png','image/png',100,repeat('e',64)
);

insert into public.vyral_dna_records (
  id,vyral_id,user_id,asset_id,scope,schema_version,payload,source_kind
) values (
  '25000000-0000-4000-8000-000000000041','25000000-0000-4000-8000-000000000011',
  '25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021',
  'asset',3,
  jsonb_build_object(
    'dna_schema_id','vyra.asset-dna',
    'dna_record',jsonb_build_object('schema_id','vyra.asset-dna','source',jsonb_build_object(
      'asset_version_id','25000000-0000-4000-8000-000000000031','sha256',repeat('e',64)
    ))
  ),
  'system'
);

select lives_ok(
  $$ insert into public.vyral_master_dna_revisions (
    vyral_id,user_id,revision,schema_id,schema_version,manifest_sha256,vyral_fingerprint,snapshot,created_by
  ) values (
    '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
    1,'vyra.vyral-master-dna',1,repeat('a',64),repeat('b',64),
    jsonb_build_object(
      'schema_id','vyra.vyral-master-dna',
      'schema_version',1,
      'master_dna_id','25000000-0000-4000-8000-000000000011',
      'vyral',jsonb_build_object(
        'vyral_id','25000000-0000-4000-8000-000000000011',
        'name','Single Asset Vyral',
        'created_at',(select created_at from public.vyrals where id='25000000-0000-4000-8000-000000000011')
      ),
      'snapshot',jsonb_build_object(
        'revision',1,
        'created_at',(select updated_at from public.vyrals where id='25000000-0000-4000-8000-000000000011')
      ),
      'purpose',jsonb_build_object('summary',null,'intended_uses','[]'::jsonb),
      'assets',jsonb_build_array(jsonb_build_object(
        'asset_id','25000000-0000-4000-8000-000000000021',
        'asset_version_id','25000000-0000-4000-8000-000000000031',
        'name','Independent Image',
        'asset_type','image',
        'updated_at',(select updated_at from public.vyral_assets where id='25000000-0000-4000-8000-000000000021'),
        'asset_fingerprint',repeat('e',64),
        'dna_ref',jsonb_build_object('record_id','25000000-0000-4000-8000-000000000041','schema_version',3)
      )),
      'relationships','[]'::jsonb,
      'source_resolution',jsonb_build_object('visibility','private'),
      'integrity',jsonb_build_object('manifest_sha256',repeat('a',64),'vyral_fingerprint',repeat('b',64))
    ),
    '25000000-0000-4000-8000-000000000001'
  ) $$,
  'A single Asset snapshot is accepted without purpose, role, or relationships'
);

select is(
  (select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
  'ready',
  'A valid single-Asset Vyral becomes ready without optional metadata'
);

select is(
  (select count(*)::integer from public.vyral_asset_relationships where vyral_id='25000000-0000-4000-8000-000000000011'),
  0,
  'No synthetic relationship is created for an independent Asset'
);

update public.vyrals
set name = 'Renamed Single Asset Vyral'
where id='25000000-0000-4000-8000-000000000011';

select is(
  (select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
  'stale',
  'Changing collection identity invalidates the derived Vyral DNA snapshot'
);

update public.vyrals set master_dna_status = 'ready'
where id='25000000-0000-4000-8000-000000000011';
update public.vyrals set visibility = 'public'
where id='25000000-0000-4000-8000-000000000011';
select is(
  (select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
  'stale',
  'Changing public visibility refreshes the derived resolver projection'
);

update public.vyrals set master_dna_status = 'ready'
where id='25000000-0000-4000-8000-000000000011';
update public.vyrals
set license_policy = coalesce(license_policy, '{}'::jsonb) || '{"allow_ai_analysis":false}'::jsonb
where id='25000000-0000-4000-8000-000000000011';
select is(
  (select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
  'stale',
  'Changing Vyral AI permissions refreshes the derived resolver projection'
);

update public.vyrals set master_dna_status = 'ready'
where id='25000000-0000-4000-8000-000000000011';
update public.vyral_assets
set license_override = '{"allow_ai_analysis":false}'::jsonb
where id='25000000-0000-4000-8000-000000000021';
select is(
  (select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
  'stale',
  'Changing Asset-level permissions refreshes the derived resolver projection'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select public.set_vyral_master_dna_asset_context(
  '25000000-0000-4000-8000-000000000021', null, 'Creator-supplied context'
);

select is(
  (select role is null and purpose = 'Creator-supplied context'
   from public.vyral_master_dna_asset_metadata
   where asset_id='25000000-0000-4000-8000-000000000021'),
  true,
  'Optional Asset context is stored without a synthetic Main/Supporting role'
);

select public.set_vyral_master_dna_asset_context(
  '25000000-0000-4000-8000-000000000021', null, null
);

select is(
  (select role is null and purpose is null
   from public.vyral_master_dna_asset_metadata
   where asset_id='25000000-0000-4000-8000-000000000021'),
  true,
  'Creators can clear optional Asset context without invalidating the Asset'
);

select * from finish();
rollback;
