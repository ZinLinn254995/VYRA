begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_table('public','vyral_asset_dna_improvement_proposals',
  'Asset DNA improvement proposals are persisted separately from canonical DNA');
select has_column('public','vyral_asset_dna_improvement_proposals','assessment_id',
  'Every proposal is pinned to its source assessment');
select has_column('public','vyral_asset_dna_improvement_proposals','proposal_snapshot',
  'The complete improvement plan is stored as an immutable snapshot');
select has_column('public','vyral_asset_dna_improvement_proposals','status',
  'Proposal review state is explicit');
select has_column('public','vyral_asset_dna_improvement_proposals','reviewed_at',
  'Approval and rejection are auditable');
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_dna_improvement_proposals'::regclass and conname='vyral_asset_dna_improvement_proposals_assessment_id_key'),
  'A source assessment can produce at most one proposal'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_dna_improvement_proposals'::regclass and conname='vyral_asset_dna_improvement_proposals_status_check'),
  'Proposal states are constrained to the supported lifecycle'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_asset_dna_improvement_proposals' and indexname='vyral_asset_dna_proposals_owner_latest_idx'),
  'Owner and Asset proposal history is indexed'
);
select ok(
  (select relrowsecurity from pg_class where oid='public.vyral_asset_dna_improvement_proposals'::regclass),
  'Row-level security is enabled'
);
select ok(
  exists (select 1 from pg_policies where schemaname='public' and tablename='vyral_asset_dna_improvement_proposals' and policyname='vyral_asset_dna_improvement_proposals_select_own'),
  'Users can read only their own proposals'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid='public.vyral_asset_dna_improvement_proposals'::regclass and tgname='vyral_asset_dna_proposal_update_guard' and not tgisinternal),
  'Proposal snapshot immutability and state transitions are guarded'
);
select ok(
  has_function('public','guard_vyral_asset_dna_proposal_update',0),
  'Proposal lifecycle guard function exists'
);

select * from finish();

rollback;
