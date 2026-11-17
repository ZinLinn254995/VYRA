-- Collection identity fields are part of the derived Vyral DNA snapshot.
-- Any change to them invalidates the cached snapshot so it is rebuilt from the current root.
drop trigger if exists vyrals_mark_master_dna_stale on public.vyrals;
create trigger vyrals_mark_master_dna_stale
after update of name, visibility, master_dna_purpose, master_dna_intended_uses
on public.vyrals
for each row execute function public.mark_vyral_master_dna_root_stale();
