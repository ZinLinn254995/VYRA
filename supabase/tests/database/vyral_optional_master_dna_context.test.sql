begin;

create extension if not exists pgtap with schema extensions;
select plan(4);

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

reset role;
set local role authenticated;
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

select * from finish();
rollback;
