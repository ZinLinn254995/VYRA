-- Cover every composite foreign key on the append-only Asset DNA assessment history.
-- These indexes keep parent-row checks and cascades efficient as history grows.

create index if not exists vyral_asset_dna_assessments_asset_fk_idx
  on public.vyral_asset_dna_assessments(asset_id, vyral_id, user_id);

create index if not exists vyral_asset_dna_assessments_version_fk_idx
  on public.vyral_asset_dna_assessments(asset_version_id, asset_id, user_id);

create index if not exists vyral_asset_dna_assessments_record_fk_idx
  on public.vyral_asset_dna_assessments(dna_record_id, vyral_id, user_id);
