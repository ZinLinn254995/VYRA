-- Gemini is no longer part of VYRA's approved provider architecture.
-- Keep the historical migration that introduced these functions immutable;
-- remove its obsolete service-only accessors and stored key with a forward migration.

drop function if exists public.set_vyra_gemini_secret(text);
drop function if exists public.get_vyra_gemini_secret();

do $$
declare
  legacy_secret_id uuid;
begin
  select id
    into legacy_secret_id
    from vault.secrets
   where name = 'vyra_gemini_api_key'
   limit 1;

  if legacy_secret_id is not null then
    perform vault.delete_secret(legacy_secret_id);
  end if;
end;
$$;
