-- Public resolver permission changes affect the compact Master DNA projection.
-- Rebuild the derived snapshot when the creator toggles AI analysis or redistribution.
drop trigger if exists vyrals_mark_master_dna_stale on public.vyrals;
create trigger vyrals_mark_master_dna_stale
after update of name, visibility, license_policy, master_dna_purpose, master_dna_intended_uses
on public.vyrals
for each row
when (
  old.name is distinct from new.name
  or old.visibility is distinct from new.visibility
  or old.license_policy is distinct from new.license_policy
  or old.master_dna_purpose is distinct from new.master_dna_purpose
  or old.master_dna_intended_uses is distinct from new.master_dna_intended_uses
)
execute function public.mark_vyral_master_dna_root_stale();

comment on trigger vyrals_mark_master_dna_stale on public.vyrals is
  'Invalidates the derived Master DNA snapshot when collection identity, visibility, or public resolver permissions change.';
