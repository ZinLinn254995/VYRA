begin;

create extension if not exists pgtap with schema extensions;
select plan(2);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'c9801424-1e4d-4604-99d3-791a8a389b48',
  'authenticated','authenticated','origin-file-dna-test@example.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

insert into public.vyrals (id,user_id,name,metadata)
values (
  'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  'c9801424-1e4d-4604-99d3-791a8a389b48',
  'ORIGIN-01',
  '{"protected":true}'::jsonb
) on conflict (id) do nothing;

insert into public.vyral_assets (
  id,vyral_id,user_id,name,original_filename,asset_type,mime_type,
  size_bytes,sha256,storage_path,processing_status,metadata
) values (
  'd2985616-36f4-4369-ab52-1ee5b63b027b',
  'b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d',
  'c9801424-1e4d-4604-99d3-791a8a389b48',
  'ORIGIN-01-DNA-ONLY-TEST.vyral',
  'ORIGIN-01-DNA-ONLY-TEST.vyral',
  'other',
  'application/octet-stream',
  4764407,
  'f4abd0f4535116dc3024bde89c04712ced6ec5d6d6fcd48d0cbb034f8ebc81a8',
  'c9801424-1e4d-4604-99d3-791a8a389b48/b2d4cc6b-d0c2-473d-afe5-7eaa06318e4d/d2985616-36f4-4369-ab52-1ee5b63b027b/v1/ORIGIN-01-DNA-ONLY-TEST.vyral',
  'uploading',
  '{"upload_source":"creator_workspace","hash_algorithm":"SHA-256"}'::jsonb
) on conflict (id) do nothing;

set local role authenticated;
select set_config('request.jwt.claim.sub','c9801424-1e4d-4604-99d3-791a8a389b48',true);
select set_config('request.jwt.claims','{"sub":"c9801424-1e4d-4604-99d3-791a8a389b48","role":"authenticated"}',true);

select lives_ok(
  $$ update public.vyral_assets
     set processing_status='ready'
     where id='d2985616-36f4-4369-ab52-1ee5b63b027b' $$,
  'The exact ORIGIN-01 File DNA test upload can finalize after recovery'
);

select throws_ok(
  $$ update public.vyral_assets
     set storage_path='tampered/origin-file-dna.vyral'
     where id='d2985616-36f4-4369-ab52-1ee5b63b027b' $$,
  '55000',
  'This Vyral is protected. Its original asset and version records are immutable.',
  'The recovery exception does not permit changing the original source path'
);

select * from finish();
rollback;
