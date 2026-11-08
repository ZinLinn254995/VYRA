-- Atomic publication of a validated Vyral Quality Standard.
-- The Edge Function performs full schema/rubric validation and restricts callers
-- to the explicitly configured publisher allowlist. This RPC is service-role only.
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
      message = 'Only the trusted publisher may activate a quality standard version.';
  end if;

  if (to_jsonb(new) - 'is_active') is distinct from (to_jsonb(old) - 'is_active') then
    raise exception using errcode = '55000',
      message = 'Quality standard profile content is immutable; publish a new version instead.';
  end if;

  return new;
end;
$$;

create or replace function public.publish_vyral_quality_standard(
  p_profile jsonb,
  p_created_by uuid
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_standard_id text;
  v_standard_version integer;
  v_row_id uuid;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501',
      message = 'Quality standard publication requires the trusted server role.';
  end if;

  -- Serialize publishers so two concurrent requests cannot activate an older version last.
  lock table public.vyral_quality_standards in exclusive mode;

  if p_created_by is null
     or jsonb_typeof(p_profile) <> 'object'
     or jsonb_typeof(p_profile -> 'rules') <> 'array'
     or jsonb_array_length(p_profile -> 'rules') = 0
     or jsonb_typeof(p_profile -> 'gradeBands') <> 'object' then
    raise exception using errcode = '22023',
      message = 'A complete versioned quality standard profile is required.';
  end if;

  v_standard_id := p_profile ->> 'id';
  if v_standard_id is null or v_standard_id !~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'
     or coalesce(p_profile ->> 'version', '') !~ '^[1-9][0-9]*$' then
    raise exception using errcode = '22023',
      message = 'The quality standard identity and positive version are invalid.';
  end if;
  v_standard_version := (p_profile ->> 'version')::integer;

  if exists (
    select 1 from public.vyral_quality_standards
    where standard_id = v_standard_id
      and standard_version >= v_standard_version
  ) then
    raise exception using errcode = '23505',
      message = 'A quality standard version must be newer than every previously published version with this identity.';
  end if;

  insert into public.vyral_quality_standards (
    standard_id, standard_version, profile, is_active, created_by
  ) values (
    v_standard_id, v_standard_version, p_profile, false, p_created_by
  ) returning id into v_row_id;

  update public.vyral_quality_standards
     set is_active = false
   where is_active = true;

  update public.vyral_quality_standards
     set is_active = true
   where id = v_row_id;

  return v_row_id;
end;
$$;

revoke all on function public.publish_vyral_quality_standard(jsonb, uuid) from public, anon, authenticated;
grant execute on function public.publish_vyral_quality_standard(jsonb, uuid) to service_role;

comment on function public.publish_vyral_quality_standard(jsonb, uuid) is
  'Atomically inserts a new immutable version and switches the single active Vyral quality standard. Callable only with service_role.';
