begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public','vyral_asset_relationships',
  'Semantic Asset relationships have a dedicated canonical table');
select has_column('public','vyral_asset_relationships','source_asset_id',
  'Each relationship identifies its source Asset');
select has_column('public','vyral_asset_relationships','target_asset_id',
  'Each relationship identifies its target Asset');
select has_column('public','vyral_asset_relationships','relation_type',
  'Relationship semantics are stored independently of generation lineage');
select has_column('public','vyral_asset_relationships','rationale',
  'Relationship rationale can be recorded');
select has_column('public','vyral_asset_relationships','metadata',
  'Structured relationship metadata is supported');
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_not_self'),
  'An Asset cannot be related to itself'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_unique'),
  'Duplicate semantic relationships are prevented'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_source_fk')
  and exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_target_fk'),
  'Both endpoints must belong to the same Vyral and owner'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.vyral_asset_relationships'::regclass),
  'Row-level security is enabled'
);
select ok(
  exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_relationships' and policyname='Owners can read their Vyral Asset relationships'),
  'Owners can read only their own Vyral relationships'
);
select ok(
  has_table_privilege('authenticated','public.vyral_asset_relationships','select')
  and not has_table_privilege('authenticated','public.vyral_asset_relationships','insert')
  and not has_table_privilege('authenticated','public.vyral_asset_relationships','update')
  and not has_table_privilege('authenticated','public.vyral_asset_relationships','delete'),
  'Authenticated clients are read-only; writes remain server-side'
);

select * from finish();

rollback;
