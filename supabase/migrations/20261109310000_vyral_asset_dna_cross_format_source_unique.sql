-- Enforce one canonical extraction per Asset Version across raster DNA v3 and File DNA v1.
-- Vision observations and creator knowledge revisions remain appendable evidence records.
drop index if exists public.vyral_dna_records_asset_source_version_unique;

create unique index vyral_dna_records_asset_source_version_unique
  on public.vyral_dna_records (
    asset_id,
    (coalesce(
      payload #>> '{dna_record,source,asset_version_id}',
      payload ->> 'source_version_id'
    ))
  )
  where scope = 'asset'
    and asset_id is not null
    and (
      payload ->> 'record_kind' = 'lossless_decoded_samples_v3'
      or payload ->> 'dna_schema_id' = 'vyra.asset-file-dna'
    )
    and coalesce(
      payload #>> '{dna_record,source,asset_version_id}',
      payload ->> 'source_version_id'
    ) is not null;

comment on index public.vyral_dna_records_asset_source_version_unique is
  'Allows one canonical raster DNA v3 or File DNA v1 extraction per Asset Version; excludes append-only Vision and creator-evidence revisions.';
