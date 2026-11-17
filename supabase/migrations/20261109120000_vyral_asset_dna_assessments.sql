-- Append-only, owner-readable history for per-Asset DNA readiness assessments.
-- Collection quality evaluations remain a separate scope and table.

create table if not exists public.vyral_asset_dna_assessments (
  id uuid primary key default gen_random_uuid(),
  vyral_id uuid not null,
  user_id uuid not null,
  asset_id uuid not null,
  asset_version_id uuid not null,
  dna_record_id uuid not null,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  assessment_version integer not null check (assessment_version > 0),
  status text not null check (status in ('ready','partial','blocked')),
  recovery_level text not null check (recovery_level in ('source_file_exact','decoded_samples_exact','semantic_only','unavailable')),
  assessment jsonb not null check (jsonb_typeof(assessment) = 'object'),
  created_at timestamptz not null default now(),
  constraint vyral_asset_dna_assessment_asset_fk
    foreign key (asset_id,vyral_id,user_id)
    references public.vyral_assets(id,vyral_id,user_id) on delete cascade,
  constraint vyral_asset_dna_assessment_version_fk
    foreign key (asset_version_id,asset_id,user_id)
    references public.vyral_asset_versions(id,asset_id,user_id) on delete cascade,
  constraint vyral_asset_dna_assessment_record_fk
    foreign key (dna_record_id,vyral_id,user_id)
    references public.vyral_dna_records(id,vyral_id,user_id) on delete cascade
);

create index if not exists vyral_asset_dna_assessments_latest_idx
  on public.vyral_asset_dna_assessments(asset_id,asset_version_id,dna_record_id,created_at desc);

alter table public.vyral_asset_dna_assessments enable row level security;
revoke all on public.vyral_asset_dna_assessments from public, anon, authenticated;
grant select on public.vyral_asset_dna_assessments to authenticated;
grant select, insert on public.vyral_asset_dna_assessments to service_role;

create policy "vyral_asset_dna_assessments_select_own"
  on public.vyral_asset_dna_assessments for select to authenticated
  using (user_id = (select auth.uid()));

comment on table public.vyral_asset_dna_assessments is
  'Append-only, version-pinned readiness history for one Asset DNA record; separate from Vyral collection quality evaluations.';
