-- Client-created fingerprints may be useful metadata, but cannot self-assert
-- that VYRA's protected source verifier performed an integrity check.
create or replace function public.guard_vyral_fingerprint_client_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if new.fingerprint_kind <> 'cryptographic' or upper(new.algorithm) <> 'SHA-256' then
      raise exception 'Perceptual, semantic and structural fingerprints must be created by trusted analysis services';
    end if;
    if new.metadata ->> 'verification_status' = 'server_verified'
       or new.metadata ? 'verified_by'
       or new.metadata ? 'comparison_status' then
      raise exception 'Server verification metadata can only be written by the protected verification service';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists vyral_fingerprint_client_insert_guard on public.vyral_fingerprints;
create trigger vyral_fingerprint_client_insert_guard
before insert on public.vyral_fingerprints
for each row execute function public.guard_vyral_fingerprint_client_insert();

revoke all on function public.guard_vyral_fingerprint_client_insert() from public, anon, authenticated, service_role;
