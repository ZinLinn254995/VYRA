-- Cover both ownership and immutable Master DNA revision foreign keys.
create index if not exists vyral_quality_evaluations_master_revision_fk_idx
  on public.vyral_quality_evaluations(master_dna_revision_id,vyral_id,user_id);

create index if not exists vyral_quality_evaluations_vyral_owner_fk_idx
  on public.vyral_quality_evaluations(vyral_id,user_id);
