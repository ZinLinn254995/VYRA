begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('27000000-0000-4000-8000-000000000001','authenticated','authenticated','media-library-a@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
  ('27000000-0000-4000-8000-000000000002','authenticated','authenticated','media-library-b@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.media_library_folders (id,user_id,parent_id,name) values
  ('27000000-0000-4000-8000-000000000011','27000000-0000-4000-8000-000000000001',null,'A Folder'),
  ('27000000-0000-4000-8000-000000000012','27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000011','A Child'),
  ('27000000-0000-4000-8000-000000000021','27000000-0000-4000-8000-000000000002',null,'B Folder');

insert into public.media_library_items (
  id,user_id,folder_id,source_kind,bucket_id,storage_path,file_name,mime_type,size_bytes,metadata
) values
  ('27000000-0000-4000-8000-000000000031','27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000011','upload','vyral-assets','27000000-0000-4000-8000-000000000001/media-library/original-a.png','original-a.png','image/png',12,'{"thumbnail_path":"27000000-0000-4000-8000-000000000001/media-library-thumbnails/thumb-a.webp"}'::jsonb),
  ('27000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000021','upload','vyral-assets','27000000-0000-4000-8000-000000000002/media-library/original-b.png','original-b.png','image/png',14,'{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub','27000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"27000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select is(auth.uid(),'27000000-0000-4000-8000-000000000001'::uuid,'Fixture authenticates as Media Library owner A');
select is((select count(*)::integer from public.media_library_folders),2,'Owner A can list only their own folders');
select is((select count(*)::integer from public.media_library_items),1,'Owner A can list only their own files');
select is((select count(*)::integer from public.media_library_folders where id='27000000-0000-4000-8000-000000000021'),0,'Owner A cannot read owner B folders');
select is((select count(*)::integer from public.media_library_items where id='27000000-0000-4000-8000-000000000002'),0,'Owner A cannot read owner B files');

select throws_ok(
  $$ insert into public.media_library_folders (user_id,name) values ('27000000-0000-4000-8000-000000000002','Spoofed Folder') $$,
  '42501', null, 'Owner A cannot create a folder owned by owner B'
);
select throws_ok(
  $$ insert into public.media_library_folders (user_id,parent_id,name) values ('27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000021','Cross-owner Child') $$,
  'P0001', 'Parent folder does not belong to this user', 'Owner A cannot place a folder inside owner B folder'
);
select throws_ok(
  $$ insert into public.media_library_items (user_id,folder_id,storage_path,file_name,mime_type,size_bytes) values ('27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000021','27000000-0000-4000-8000-000000000001/media-library/cross.png','cross.png','image/png',1) $$,
  'P0001', 'Media Library folder does not belong to this user', 'Owner A cannot add a file to owner B folder'
);
select throws_ok(
  $$ update public.media_library_folders set user_id='27000000-0000-4000-8000-000000000002' where id='27000000-0000-4000-8000-000000000011' $$,
  '42501', null, 'Owner A cannot transfer a folder to owner B'
);
select throws_ok(
  $$ delete from public.media_library_folders where id='27000000-0000-4000-8000-000000000011' $$,
  '23503', 'Media Library folder is not empty; move or remove its contents first', 'Database prevents deletion of a folder containing a child folder or file'
);
select is((select count(*)::integer from public.media_library_folders where id='27000000-0000-4000-8000-000000000012'),1,'Rejected parent deletion preserves its child folder');

select is(public.delete_media_library_items_and_queue_storage_cleanup(array['27000000-0000-4000-8000-000000000002'::uuid]),0,'Owner A cannot delete owner B file through cleanup RPC');
select is((select count(*)::integer from public.media_library_items where id='27000000-0000-4000-8000-000000000002'),0,'Owner B file remains invisible to owner A after attempted deletion');

select is(public.delete_media_library_items_and_queue_storage_cleanup(array['27000000-0000-4000-8000-000000000031'::uuid]),1,'Owner A can atomically delete their own Library file');
select is((select count(*)::integer from public.media_library_items where id='27000000-0000-4000-8000-000000000031'),0,'Deleted Library index row is removed');
select is((select count(*)::integer from public.media_library_storage_cleanup_jobs),1,'Deleting a standalone upload creates one durable cleanup job');
select is(
  (select storage_paths from public.media_library_storage_cleanup_jobs limit 1),
  array[
    '27000000-0000-4000-8000-000000000001/media-library/original-a.png',
    '27000000-0000-4000-8000-000000000001/media-library-thumbnails/thumb-a.webp'
  ]::text[],
  'Cleanup job contains the original and thumbnail paths'
);

delete from public.media_library_folders where id='27000000-0000-4000-8000-000000000012';
delete from public.media_library_folders where id='27000000-0000-4000-8000-000000000011';
select is((select count(*)::integer from public.media_library_folders where id='27000000-0000-4000-8000-000000000011'),0,'An empty folder can be deleted after its child is removed');

select * from finish();
rollback;
