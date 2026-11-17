-- Cover composite foreign keys introduced by Master DNA persistence.
-- These indexes improve delete/update checks and owner-scoped joins without changing data.
create index if not exists vyral_asset_relationships_from_asset_fk_idx
  on public.vyral_asset_relationships (from_asset_id, vyral_id, user_id);

create index if not exists vyral_asset_relationships_to_asset_fk_idx
  on public.vyral_asset_relationships (to_asset_id, vyral_id, user_id);

create index if not exists vyral_master_dna_revisions_creator_fk_idx
  on public.vyral_master_dna_revisions (created_by);

create index if not exists vyral_master_dna_revisions_owner_fk_idx
  on public.vyral_master_dna_revisions (vyral_id, user_id);

create index if not exists vyral_master_dna_revisions_parent_fk_idx
  on public.vyral_master_dna_revisions (parent_revision_id, vyral_id, user_id);
