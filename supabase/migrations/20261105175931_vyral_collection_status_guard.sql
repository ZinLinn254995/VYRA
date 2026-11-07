-- Prevent browser clients from asserting a completed VYRAL DNA verification state.
create or replace function public.guard_vyral_collection_status()
returns trigger language plpgsql set search_path = '' as $$
begin
  if current_user = 'authenticated' and new.dna_status <> 'evolving' then
    raise exception 'VYRAL DNA verification status is assigned only by the verification service';
  end if;
  return new;
end;
$$;
drop trigger if exists vyral_collection_status_guard on public.vyrals;
create trigger vyral_collection_status_guard
before insert or update of dna_status on public.vyrals
for each row execute function public.guard_vyral_collection_status();
revoke all on function public.guard_vyral_collection_status() from public, anon, authenticated, service_role;
