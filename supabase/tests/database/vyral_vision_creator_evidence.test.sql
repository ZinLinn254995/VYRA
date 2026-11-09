begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

select has_table('public','vyral_vision_creator_evidence',
  'Creator reviews and field confirmations have a dedicated evidence table');
select has_column('public','vyral_vision_creator_evidence','asset_version_id',
  'Evidence is pinned to an immutable Asset Version');
select has_column('public','vyral_vision_creator_evidence','source_sha256',
  'Evidence is pinned to the source SHA-256');
select has_column('public','vyral_vision_creator_evidence','observation_id',
  'Evidence is linked to its original Vision observation');
select has_column('public','vyral_vision_creator_evidence','review_evidence_id',
  'Field confirmation references the creator review that authorized it');
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_vision_creator_evidence'::regclass and conname='vyral_vision_creator_evidence_shape'),
  'Review and field-confirmation row shapes are constrained'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_vision_creator_evidence' and indexname='vyral_vision_creator_evidence_one_review'),
  'An observation can have only one immutable creator review'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_vision_creator_evidence' and indexname='vyral_vision_creator_evidence_one_field'),
  'An observation field can have only one immutable confirmation'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.vyral_vision_creator_evidence'::regclass),
  'Row-level security is enabled'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid='public.vyral_vision_creator_evidence'::regclass and tgname='vyral_vision_creator_evidence_immutable' and not tgisinternal),
  'Creator evidence rows cannot be updated or deleted'
);

select * from finish();
rollback;
