begin;
set local search_path = public, extensions;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000002',
 '25000000-0000-4000-8000-000000000094',1,'vyra.vyral-master-dna',1,
 repeat('a',64),repeat('b',64),'private',null,
 '{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000094"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
);

set local role authenticated;
select set_config('request.jwt.claim.sub','25000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"25000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

select lives_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000099',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000099"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'Owner can store a complete compact reference under a Vyral they own');
select is((select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000011'),1,'Reference is stored independently of Asset rows');
select is((select count(*)::integer from public.vyral_assets where vyral_id='25000000-0000-4000-8000-000000000011'),0,'Compact import creates no placeholder Assets');
select is((select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000012'),0,'Owner cannot read another customer references');

select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000012','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000098',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000098"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'42501',null,'Owner cannot attach a reference to another customer Vyral');
select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000099',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000099"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'23505',null,'Re-importing the same source revision cannot create a duplicate');

select is(has_table_privilege('authenticated','public.vyral_collection_references','update'),false,'Authenticated clients cannot UPDATE immutable reference records');
select throws_ok($q$update public.vyral_collection_references set compact_snapshot='{}'::jsonb$q$,'42501',null,'Authenticated UPDATE is denied');

select lives_ok($q$delete from public.vyral_collection_references where source_vyral_id='25000000-0000-4000-8000-000000000099'$q$,'Owner can remove their own reference');
select is((select count(*)::integer from public.vyral_collection_references where destination_vyral_id='25000000-0000-4000-8000-000000000011'),0,'Removing a reference leaves no destination record');

select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000098',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000098"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'23514',null,'Database rejects a projection digest that differs from the snapshot digest');
select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000097',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000097"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"source_resolution":{"visibility":"public"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'23514',null,'Database rejects source visibility that differs from snapshot visibility');
select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000096',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000096"},"snapshot":{"revision":1},"source_resolution":{"visibility":"private"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'23514',null,'Database rejects snapshots missing the embedded integrity digest');
select throws_ok($q$insert into public.vyral_collection_references (
 destination_vyral_id,user_id,source_vyral_id,source_revision,source_schema_id,source_schema_version,
 source_manifest_sha256,projection_sha256,source_visibility,resolver_uri,compact_snapshot
) values (
 '25000000-0000-4000-8000-000000000011','25000000-0000-4000-8000-000000000001','25000000-0000-4000-8000-000000000095',1,'vyra.vyral-master-dna',1,
 repeat('a',64),'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','private',null,'{"schema_id":"vyra.vyral-master-dna","schema_version":1,"vyral":{"vyral_id":"25000000-0000-4000-8000-000000000095"},"snapshot":{"revision":1},"integrity":{"manifest_sha256":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"},"portable_projection":{"resolver_uri":null}}'::jsonb
 )$q$,'23514',null,'Database rejects snapshots missing source permission metadata');

select * from finish();
reset role;
rollback;
