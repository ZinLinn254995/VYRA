-- Preserve external reconstruction attempt metadata without overstating blind-test proof.
alter table public.vyral_reconstruction_tests
  add column if not exists model_version text,
  add column if not exists prompt_sha256 text,
  add column if not exists session_reference text,
  add column if not exists tool_access jsonb not null default '{}'::jsonb,
  add column if not exists blindness_status text not null default 'unverified',
  add column if not exists attempt_evidence jsonb not null default '{}'::jsonb;

alter table public.vyral_reconstruction_tests
  drop constraint if exists vyral_reconstruction_prompt_sha256_check,
  add constraint vyral_reconstruction_prompt_sha256_check
    check (prompt_sha256 is null or prompt_sha256 ~ '^[0-9a-f]{64}$'),
  drop constraint if exists vyral_reconstruction_tool_access_object_check,
  add constraint vyral_reconstruction_tool_access_object_check
    check (jsonb_typeof(tool_access) = 'object'),
  drop constraint if exists vyral_reconstruction_blindness_status_check,
  add constraint vyral_reconstruction_blindness_status_check
    check (blindness_status in ('unverified','creator_attested','independently_verified','invalid')),
  drop constraint if exists vyral_reconstruction_attempt_evidence_object_check,
  add constraint vyral_reconstruction_attempt_evidence_object_check
    check (jsonb_typeof(attempt_evidence) = 'object');

create index if not exists vyral_reconstruction_prompt_sha256_idx
  on public.vyral_reconstruction_tests(prompt_sha256)
  where prompt_sha256 is not null;

comment on column public.vyral_reconstruction_tests.model_version is
  'Exact external model version when supplied by the creator or provider; null means not recorded.';
comment on column public.vyral_reconstruction_tests.prompt_sha256 is
  'SHA-256 of the exact prompt used for this attempt; does not store the prompt text.';
comment on column public.vyral_reconstruction_tests.session_reference is
  'Optional external session reference supplied as provenance; not independently authenticated.';
comment on column public.vyral_reconstruction_tests.blindness_status is
  'Evidence level for original-asset isolation. Creator attestation is not independent verification.';
comment on column public.vyral_reconstruction_tests.attempt_evidence is
  'Append-only snapshot of model, prompt, tool access, blindness attestation and uploaded output evidence.';
