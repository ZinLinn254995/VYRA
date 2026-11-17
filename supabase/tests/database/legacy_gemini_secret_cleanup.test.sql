begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

select ok(
  to_regprocedure('public.set_vyra_gemini_secret(text)') is null,
  'legacy Gemini secret setter is no longer installed'
);

select ok(
  to_regprocedure('public.get_vyra_gemini_secret()') is null,
  'legacy Gemini secret getter is no longer installed'
);

select is(
  (select count(*)::integer from vault.secrets where name = 'vyra_gemini_api_key'),
  0,
  'legacy Gemini API key is removed from Vault'
);

select * from finish();
rollback;
