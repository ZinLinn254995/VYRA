-- Keep the derived Master DNA projection in sync with changes that affect
-- public discoverability, remote retrieval permissions, or collection identity.
-- The latest mark_vyral_master_dna_root_stale() implementation only marks the
-- snapshot stale; it does not require optional purpose/role/relationship metadata.

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
  'Refreshes the derived Master DNA projection when collection identity, visibility, retrieval permissions, or optional creator context changes.';
