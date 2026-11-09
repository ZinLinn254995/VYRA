-- Versioned, server-managed quality standards. No client may publish or alter standards.
create table if not exists public.vyral_quality_standards (
  id uuid primary key default gen_random_uuid(),
  standard_id text not null check (char_length(standard_id) between 1 and 128),
  standard_version integer not null check (standard_version > 0),
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  is_active boolean not null default false,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint vyral_quality_standards_version_unique unique (standard_id,standard_version),
  constraint vyral_quality_standards_profile_identity_check check (
    profile ->> 'id' = standard_id
    and (profile ->> 'version') ~ '^[1-9][0-9]*$'
    and (profile ->> 'version')::integer = standard_version
    and jsonb_typeof(profile -> 'rules') = 'array'
    and jsonb_typeof(profile -> 'gradeBands') = 'object'
  )
);

create index if not exists vyral_quality_standards_active_lookup_idx
  on public.vyral_quality_standards(standard_id,standard_version)
  where is_active = true;

create or replace function public.prevent_vyral_quality_standard_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = '55000',
    message = 'Quality standard versions are immutable; publish a new version instead.';
end;
$$;

revoke all on function public.prevent_vyral_quality_standard_mutation() from public, anon, authenticated;
drop trigger if exists vyral_quality_standard_immutable on public.vyral_quality_standards;
create trigger vyral_quality_standard_immutable
before update or delete on public.vyral_quality_standards
for each row execute function public.prevent_vyral_quality_standard_mutation();

alter table public.vyral_quality_standards enable row level security;
revoke all on public.vyral_quality_standards from public, anon, authenticated;
grant select, insert on public.vyral_quality_standards to service_role;

comment on table public.vyral_quality_standards is
  'Immutable, server-managed versioned Vyral quality standard profiles. Client roles cannot read or publish standards.';
