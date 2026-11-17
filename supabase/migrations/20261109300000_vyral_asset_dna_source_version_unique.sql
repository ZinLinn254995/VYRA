-- A source Asset Version can have only one immutable extracted DNA record.
-- This closes the concurrent/retry duplicate-extraction race independently of API checks.
create unique index if not exists vyral_dna_records_asset_source_version_unique
  on public.vyral_dna_records (
    asset_id,
    ((payload #>> '{dna_record,source,asset_version_id}'))
  )
  where scope = 'asset'
    and asset_id is not null
    and payload #>> '{dna_record,source,asset_version_id}' is not null;

comment on index public.vyral_dna_records_asset_source_version_unique is
  'Prevents multiple immutable Asset-DNA records from claiming the same source Asset Version.';
