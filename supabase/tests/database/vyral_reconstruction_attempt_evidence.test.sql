begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_column('public','vyral_reconstruction_tests','model_version',
  'Reconstruction attempts can pin the exact external model version');
select has_column('public','vyral_reconstruction_tests','prompt_sha256',
  'Reconstruction attempts can identify the exact prompt without storing its text');
select has_column('public','vyral_reconstruction_tests','session_reference',
  'Reconstruction attempts can retain an external session reference');
select has_column('public','vyral_reconstruction_tests','tool_access',
  'Reconstruction attempts can record available tools and retrieval access');
select has_column('public','vyral_reconstruction_tests','blindness_status',
  'Reconstruction attempts distinguish attested isolation from verified isolation');
select has_column('public','vyral_reconstruction_tests','attempt_evidence',
  'Reconstruction attempts preserve a structured evidence snapshot');

select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_reconstruction_tests'::regclass and conname='vyral_reconstruction_prompt_sha256_check'),
  'Prompt hash is constrained to a SHA-256 hex digest'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_reconstruction_tests'::regclass and conname='vyral_reconstruction_tool_access_object_check'),
  'Tool-access evidence must be a JSON object'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_reconstruction_tests'::regclass and conname='vyral_reconstruction_blindness_status_check'),
  'Blindness status is limited to explicit evidence levels'
);
select ok(
  exists (select 1 from pg_constraint where conrelid='public.vyral_reconstruction_tests'::regclass and conname='vyral_reconstruction_attempt_evidence_object_check'),
  'Attempt evidence must be a JSON object'
);
select ok(
  exists (select 1 from pg_indexes where schemaname='public' and tablename='vyral_reconstruction_tests' and indexname='vyral_reconstruction_prompt_sha256_idx'),
  'Prompt hash index supports evidence lookup without exposing prompt contents'
);

select * from finish();

rollback;
