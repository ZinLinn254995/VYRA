begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
 ('25000000-0000-4000-8000-000000000001','authenticated','authenticated','compact-ref-a@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
 ('25000000-0000-4000-8000-000000000002','authenticated','authenticated','compact-ref-b@example.invalid','',now(),'{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
on conflict (id) do nothing;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claims','{"role":"service_role"}',true);

insert into public.vyrals (id,user_id,name,metadata) values
 ('25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','Destination A','{}'::jsonb),
 ('25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000002','Destination B','{}'::jsonb);

set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($$test$test$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
 '25000000-0000-4000-8000-000000000099',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('b',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000099"},"snapshot":{"revision":1}}'::jsonb
)$$,'Owner can store a compact reference under a Vyral they own');

select is(
 (select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000011'),
 1,
 'Imported compact reference is stored independently of Asset rows'
);

select is(
 (select count(*)::integer from public.vyral_assets where vyral_id='25000000-0000-4000-8000-000000000011'),
 0,
 'Compact reference import does not create placeholder Assets'
);

select is(
 (select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000012'),
 0,
 'Owner cannot read another customer collection references'
);

select throws_ok(
 $$test$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
 ) values (
 '25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000001',
 '25000000-0000-4000-8000-000000000099',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('b',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000099"},"snapshot":{"revision":1}}'::jsonb
 )$$,
 '42501',
 null,
 'Owner cannot attach a compact reference to another customer Vyral'
);

select throws_ok(
 $$test$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
 ) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
 '25000000-0000-4000-8000-000000000099',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('b',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000099"},"snapshot":{"revision":1}}'::jsonb
 )$$,
 '23505',
 null,
 'Re-importing the same source revision cannot create a duplicate reference'
);

select is(
 has_table_privilege('authenticated','public.vyral_collection_references','update'),
 false,
 'Authenticated clients have no UPDATE privilege on immutable reference records'
);

select throws_ok(
 $stmt$update public.vyral_collection_references set compact_snapshot='{}'::jsonb$stmt$,
 '42501',
 null,
 'Imported reference snapshots are immutable to authenticated clients'
);

select lives_ok(
 $$delete from public.vyral_collection_references where source_vyral_id='25000000-0000-4000-8000-000000000099'$$,
 'Owner can delete their own imported reference without mutating the source'
);

select is(
 (select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000011'),
 0,
 'Deleted reference is removed from the destination collection'
);

select throws_ok(
 $test$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
 ) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
 '25000000-0000-4000-8000-000000000098',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('c',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000098"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$test$,
 '23514',
 null,
 'Database rejects a projection digest that differs from the embedded Master DNA integrity digest'
);

select throws_ok(
 $test$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
 ) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001',
 '25000000-0000-4000-8000-000000000097',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('b',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000097"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"public"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$test$,
 '23514',
 null,
 'Database rejects source visibility that differs from the embedded snapshot'
);

reset role;
rollback;
