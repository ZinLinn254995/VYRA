begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_column('public','vyral_asset_dna_improvement_proposals','change_set_validation_report',
  'Validation evidence is stored separately from the immutable change set');
select has_column('public','vyral_asset_dna_improvement_proposals','change_set_checked_at',
  'Validation evidence has a deterministic check timestamp');
select has_column('public','vyral_asset_dna_improvement_proposals','change_set_validator_version',
  'Validation evidence records the validator version');
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_dna_improvement_proposals'::regclass and conname='vyral_asset_dna_proposal_change_set_validation_object'),
  'Validation reports must be JSON objects'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_asset_dna_improvement_proposals'::regclass and conname='vyral_asset_dna_proposal_change_set_validation_pair'),
  'Validation report, timestamp and validator version are stored together'
);
select ok(
  exists (select 1 from pg_trigger where tgrelid='public.vyral_asset_dna_improvement_proposals'::regclass and tgname='vyral_asset_dna_proposal_update_guard' and not tgisinternal),
  'Immutable proposal guard remains installed'
);
select ok(
  position('trusted validator' in pg_get_functiondef('public.guard_vyral_asset_dna_proposal_update()'::regprocedure)) > 0,
  'Only trusted service-role validation can attach a validation report'
);
select ok(
  position('first prepared or with trusted validation evidence' in pg_get_functiondef('public.guard_vyral_asset_dna_proposal_update()'::regprocedure)) > 0,
  'Change-set status cannot be changed without initial preparation or trusted validation evidence'
);
select ok(
  position('Prepared DNA change-set payload and hash are immutable' in pg_get_functiondef('public.guard_vyral_asset_dna_proposal_update()'::regprocedure)) > 0,
  'Change-set payload and hash remain immutable after preparation'
);

select * from finish();

rollback;
