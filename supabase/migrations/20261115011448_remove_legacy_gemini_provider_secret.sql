-- Gemini is no longer part of VYRA's approved provider architecture.
-- Keep the historical migration that introduced these functions immutable;
-- remove its obsolete service-only accessors and stored key with a forward migration.

drop function if exists public.set_vyra_gemini_secret(text);
drop function if exists public.get_vyra_gemini_secret();

delete from vault.secrets
 where name = 'vyra_gemini_api_key';
