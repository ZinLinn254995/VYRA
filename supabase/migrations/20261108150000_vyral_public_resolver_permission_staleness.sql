-- Public resolver permission changes affect the compact Master DNA projection.
-- Rebuild the derived snapshot when the creator toggles AI analysis or redistribution.
drop trigger if exists vyrals_mark_master_dna_stale on public.vyrals;
create trigger vyrals_mark_master_dna_stale
after update of name, visibility, license_policy, master_dna_purpose, master_dna_intended_uses
on public.vyrals
for each row execute function public.mark_vyral_master_dna_root_stale();

comment on trigger vyrals_mark_master_dna_stale on public.vyrals is
  'Invalidates the derived Master DNA snapshot when collection identity, visibility, or public resolver permissions change.';
