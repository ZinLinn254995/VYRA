-- Allow only server-controlled activation changes while keeping every
-- published profile/version immutable. Exactly one global default profile
-- is active at a time; its rules can still be scoped by asset/purpose/workflow.
create or replace function public.prevent_vyral_quality_standard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using errcode = '55000',
      message = 'Published quality standard versions cannot be deleted.';
  end if;

  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Only the trusted service may activate a quality standard version.';
  end if;

  if (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
    raise exception using errcode = '55000',
      message = 'Quality standard profile content is immutable; publish a new version instead.';
  end if;

  return new;
end;
$$;

revoke all on function public.prevent_vyral_quality_standard_mutation() from public, anon, authenticated;
grant select, insert on public.vyral_quality_standards to service_role;
grant update (is_active) on public.vyral_quality_standards to service_role;

create unique index if not exists vyral_quality_standards_single_active_idx
  on public.vyral_quality_standards(is_active)
  where is_active = true;
