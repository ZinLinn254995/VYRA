begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('25000000-0000-4000-8000-000000000001','authenticated','authenticated','asset-restore-test@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.vyrals (id,user_id,name,metadata,master_dna_purpose,master_dna_status)
values ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
 'Asset Restore Test Vyral','{}'::jsonb,'A test Vyral for archive and restore lifecycle.','stale');
insert into public.vyral_assets (id,vyral_id,user_id,name,original_filename,asset_type,mime_type,size_bytes,storage_path,sha256,processing_status)
values ('25000000-0000-4000-8000-000000000021','25000000-0000-4000-8000-000000000011',
 '25000000-0000-4000-8000-000000000001','Reference Image','reference.png','image','image/png',1234,
 'asset-restore-test/reference.png',repeat('a',64),'ready');
insert into public.vyral_master_dna_asset_metadata (asset_id,vyral_id,user_id,role,purpose)
values ('25000000-0000-4000-8000-000000000021','25000000-0000-4000-8000-000000000011',
 '25000000-0000-4000-8000-000000000001','main','Primary reference image for restore lifecycle testing.');
update public.vyrals set master_dna_status='ready' where id='25000000-0000-4000-8000-000000000011';
update public.vyral_assets set processing_status='archived'
where id='25000000-0000-4000-8000-000000000021' and processing_status='ready';
select is((select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
 'stale','Archiving an Asset invalidates the Vyral Master DNA snapshot');
select is((select processing_status from public.vyral_assets where id='25000000-0000-4000-8000-000000000021'),
 'archived','Archive lifecycle changes only the Asset status');
update public.vyrals set master_dna_status='ready' where id='25000000-0000-4000-8000-000000000011';
update public.vyral_assets set processing_status='ready'
where id='25000000-0000-4000-8000-000000000021' and processing_status='archived';
select is((select master_dna_status from public.vyrals where id='25000000-0000-4000-8000-000000000011'),
 'stale','Restoring an Asset invalidates the Vyral Master DNA snapshot again');
select is((select storage_path from public.vyral_assets where id='25000000-0000-4000-8000-000000000021'),
 'asset-restore-test/reference.png','Restore preserves the original canonical storage path');
select is((select sha256 from public.vyral_assets where id='25000000-0000-4000-8000-000000000021'),
 repeat('a',64),'Restore preserves the original SHA-256 fingerprint');
select is((select size_bytes from public.vyral_assets where id='25000000-0000-4000-8000-000000000021'),
 1234::bigint,'Restore preserves the original file size');
select * from finish();
rollback;
