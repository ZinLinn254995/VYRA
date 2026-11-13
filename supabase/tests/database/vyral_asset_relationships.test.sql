begin;

create extension if not exists pgtap with schema extensions;

select plan(13);

select has_table('public','vyral_asset_relationships',
  'Canonical semantic Asset relationship table exists');
select has_column('public','vyral_asset_relationships','relationship_type',
  'Relationship type is explicit');
select has_column('public','vyral_asset_relationships','from_kind',
  'Relationship source supports Asset or Vyral root');
select has_column('public','vyral_asset_relationships','to_kind',
  'Relationship target supports Asset or Vyral root');
select has_column('public','vyral_asset_relationships','rationale',
  'Relationship rationale is persisted');
select has_column('public','vyral_asset_relationships','evidence_ref',
  'Optional evidence reference is supported');
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_from_asset_fk')
  and exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_to_asset_fk'),
  'Asset endpoints are constrained to the same Vyral and owner'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_not_asset_self_check')
  and exists (select 1 from pg_constraint where conrelid='public.vyral_asset_relationships'::regclass and conname='vyral_asset_relationships_not_root_self_check'),
  'Self-referential relationships are rejected'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.vyral_asset_relationships'::regclass),
  'Row-level security is enabled'
);
select ok(
  exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_relationships' and policyname='vyral_asset_relationships_select_own'),
  'Owner-scoped read policy exists'
);
select ok(
  exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_relationships' and policyname='vyral_asset_relationships_insert_own')
  and exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_relationships' and policyname='vyral_asset_relationships_update_own')
  and exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_relationships' and policyname='vyral_asset_relationships_delete_own'),
  'Relationship write policies remain owner-scoped for existing creator workflows'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_asset_relationships' and indexname='vyral_asset_relationships_from_idx')
  and exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_asset_relationships' and indexname='vyral_asset_relationships_to_idx'),
  'Relationship traversal indexes exist'
);
select ok(
  exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    where idx.relname = 'vyral_asset_relationships_edge_unique'
      and i.indisunique
      and i.indnullsnotdistinct
  ),
  'Directed semantic edges are unique, including NULL Vyral-root endpoints'
);

select * from finish();

rollback;
