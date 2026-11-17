-- Reconstructed from the live Development function catalog for migration-ledger alignment.
-- This migration creates accessors only; it does not insert, read, or rotate provider secrets.
create or replace function public.set_vyra_runway_secret(secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  existing_id uuid;
begin
  if secret_value is null or length(btrim(secret_value)) < 20 or length(secret_value) > 512
     or secret_value ~ '\s' then
    raise exception 'Invalid Runway API key format';
  end if;

  select id into existing_id
  from vault.decrypted_secrets
  where name = 'vyra_runway_api_key'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(secret_value, 'vyra_runway_api_key', 'VYRA Runway media provider API key');
  else
    perform vault.update_secret(existing_id, secret_value, 'vyra_runway_api_key', 'VYRA Runway media provider API key');
  end if;
end;
$function$;

create or replace function public.get_vyra_runway_secret()
returns text
language sql
security definer
set search_path = ''
as $function$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'vyra_runway_api_key'
  limit 1;
$function$;

revoke all on function public.set_vyra_runway_secret(text) from public, anon, authenticated;
revoke all on function public.get_vyra_runway_secret() from public, anon, authenticated;
grant execute on function public.set_vyra_runway_secret(text) to service_role;
grant execute on function public.get_vyra_runway_secret() to service_role;
