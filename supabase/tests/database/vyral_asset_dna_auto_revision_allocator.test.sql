begin;
create extension if not exists pgtap with schema extensions;
select plan(9);
select ok(exists (select 1 from pg_trigger where tgrelid='public.vyral_dna_records'::regclass and tgname='vyral_dna_records_allocate_asset_revision' and not tgisinternal),'Every Asset DNA insert passes through the database revision allocator');
select ok((select column_default is null and is_nullable='YES' from information_schema.columns where table_schema='public' and table_name='vyral_dna_records' and column_name='revision_number'),'Omitted revision numbers reach the allocator instead of silently defaulting to 1');
select ok(position('for update' in lower(pg_get_functiondef('public.allocate_vyral_asset_dna_revision()'::regprocedure))) > 0,'Allocator locks the owning Asset row to serialize concurrent writers');
select ok(position('latest_revision + 1' in lower(pg_get_functiondef('public.allocate_vyral_asset_dna_revision()'::regprocedure))) > 0,'Allocator increments from the latest immutable revision');
select ok(position('new.parent_dna_record_id := latest_id' in lower(pg_get_functiondef('public.allocate_vyral_asset_dna_revision()'::regprocedure))) > 0,'Allocator assigns the previous DNA record as parent');
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '25000000-0000-4000-8000-000000000001','authenticated','authenticated',
  'dna-revision-allocator@example.invalid','',now(),
  '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.vyrals (id,user_id,name,metadata)
values ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','DNA Revision Allocator Test','{}'::jsonb);

insert into public.vyral_assets (
  id,vyral_id,user_id,name,original_filename,asset_type,mime_type,size_bytes,storage_path
) values (
  '25000000-0000-4000-8000-000000000021',
  '25000000-0000-4000-8000-000000000011',
  '25000000-0000-4000-8000-000000000001',
  'Revision Test Asset','revision-test.png','image','image/png',100,'revision-test/source.png'
);

insert into public.vyral_dna_records
  (id,vyral_id,user_id,asset_id,scope,schema_version,payload,source_kind,revision_number)
values
  ('25000000-0000-4000-8000-000000000031','25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021','asset',1,'{"writer":"legacy-a"}'::jsonb,'creator',99);

insert into public.vyral_dna_records
  (id,vyral_id,user_id,asset_id,scope,schema_version,payload,source_kind)
values
  ('25000000-0000-4000-8000-000000000032','25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021','asset',1,'{"writer":"legacy-b"}'::jsonb,'vision');

insert into public.vyral_dna_records
  (id,vyral_id,user_id,asset_id,scope,schema_version,payload,source_kind)
values
  ('25000000-0000-4000-8000-000000000033','25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000021','asset',1,'{"writer":"legacy-c"}'::jsonb,'creator');

select is((select revision_number from public.vyral_dna_records where id='25000000-0000-4000-8000-000000000031'),1,'First legacy Asset DNA insert receives revision 1');
select is((select revision_number from public.vyral_dna_records where id='25000000-0000-4000-8000-000000000032'),2,'Second legacy Asset DNA insert automatically receives revision 2');
select is((select parent_dna_record_id from public.vyral_dna_records where id='25000000-0000-4000-8000-000000000032'),'25000000-0000-4000-8000-000000000031'::uuid,'Second DNA revision automatically points to its parent');
select is((select parent_dna_record_id from public.vyral_dna_records where id='25000000-0000-4000-8000-000000000033'),'25000000-0000-4000-8000-000000000032'::uuid,'Third DNA revision automatically extends the immutable lineage');

select * from finish();
rollback;
