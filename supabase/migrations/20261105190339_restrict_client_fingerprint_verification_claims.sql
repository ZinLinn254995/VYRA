-- Prevent authenticated browser clients from forging trusted fingerprint verification metadata.
-- Client-created fingerprints are limited to explicitly unverified SHA-256 evidence.
-- Trusted server-side verification services run with the service role and bypass this client guard.

create or replace function public.guard_vyral_fingerprint_client_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' and (
    new.fingerprint_kind <> 'cryptographic'
    or upper(new.algorithm) <> 'SHA-256'
    or coalesce(new.metadata->>'verification_status', '') <> 'unverified'
    or coalesce(new.metadata->>'computed_by', '') <> 'browser_web_crypto'
  ) then
    raise exception 'Client fingerprint records must be unverified browser-calculated SHA-256 evidence; trusted verification metadata is server-only';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_vyral_fingerprint_client_insert() from public, anon, authenticated, service_role;
