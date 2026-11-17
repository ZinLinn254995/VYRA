create or replace function public.set_vyra_openai_secret(secret_value text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_id uuid;
begin
  if secret_value is null or length(btrim(secret_value)) < 20 or length(secret_value) > 512 then
    raise exception 'Invalid OpenAI API key format';
  end if;

  select id into existing_id
  from vault.decrypted_secrets
  where name = 'vyra_openai_api_key'
  limit 1;

  if existing_id is null then
    perform vault.create_secret(secret_value, 'vyra_openai_api_key', 'VYRA OpenAI API key');
  else
    perform vault.update_secret(existing_id, secret_value, 'vyra_openai_api_key', 'VYRA OpenAI API key');
  end if;
end;
$$;

create or replace function public.get_vyra_openai_secret()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'vyra_openai_api_key'
  limit 1;
$$;

revoke all on function public.set_vyra_openai_secret(text) from public, anon, authenticated;
revoke all on function public.get_vyra_openai_secret() from public, anon, authenticated;
grant execute on function public.set_vyra_openai_secret(text) to service_role;
grant execute on function public.get_vyra_openai_secret() to service_role;
