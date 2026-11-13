begin;
create extension if not exists pgtap with schema extensions;
select plan(5);
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
values ('26000000-0000-4000-8000-000000000001','authenticated','authenticated','folder-delete-test@example.invalid','',now(),
 '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);
insert into public.vyrals (id,user_id,name,metadata,master_dna_purpose,master_dna_status)
values ('26000000-0000-4000-8000-000000000011','26000000-0000-4000-8000-000000000001',
 'Folder Delete Test Vyral','{}'::jsonb,'A test Vyral for empty-folder deletion.','stale');
insert into public.vyral_folders (id,vyral_id,user_id,parent_id,name)
values
 ('26000000-0000-4000-8000-000000000021','26000000-0000-4000-8000-000000000011','26000000-0000-4000-8000-000000000001',null,'Empty Folder'),
 ('26000000-0000-4000-8000-000000000022','26000000-0000-4000-8000-000000000011','26000000-0000-4000-8000-000000000001',null,'Nonempty Folder'),
 ('26000000-0000-4000-8000-000000000023','26000000-0000-4000-8000-000000000011','26000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000022','Child Folder');
select is((select count(*)::int from public.delete_empty_vyral_folder(
 '26000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000011',
 '26000000-0000-4000-8000-000000000021','Empty Folder',
 (select created_at from public.vyral_folders where id='26000000-0000-4000-8000-000000000021'))),1,'Deletes an exact empty owner-owned folder');
select is((select count(*)::int from public.vyral_folders where id='26000000-0000-4000-8000-000000000021'),0,'Deleted empty folder is absent');
select is((select count(*)::int from public.delete_empty_vyral_folder(
 '26000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000011',
 '26000000-0000-4000-8000-000000000022','Nonempty Folder',
 (select created_at from public.vyral_folders where id='26000000-0000-4000-8000-000000000022'))),0,'Refuses folders containing child folders');
select is((select count(*)::int from public.vyral_folders where id='26000000-0000-4000-8000-000000000023'),1,'Refused deletion preserves child folder');
select is((select count(*)::int from public.delete_empty_vyral_folder(
 '26000000-0000-4000-8000-000000000001','26000000-0000-4000-8000-000000000011',
 '26000000-0000-4000-8000-000000000022','Wrong Name',
 (select created_at from public.vyral_folders where id='26000000-0000-4000-8000-000000000022'))),0,'Refuses stale or mismatched folder identity');
select * from finish();
rollback;
