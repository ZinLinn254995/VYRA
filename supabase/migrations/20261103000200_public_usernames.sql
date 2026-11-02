-- Public, privacy-safe VYRA usernames and rate-limited recipient discovery.
-- This migration does not expose email addresses or private profile columns.

alter table public.profiles
  add column if not exists username text;

alter table public.profiles
  drop constraint if exists profiles_username_format_check;

alter table public.profiles
  add constraint profiles_username_format_check
  check (username is null or username ~ '^[a-z0-9_]{3,24}$');

create unique index if not exists profiles_username_unique
  on public.profiles (username)
  where username is not null;

create table if not exists public.profile_lookup_limits (
  user_id uuid primary key references auth.users (id) on delete cascade,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0)
);

alter table public.profile_lookup_limits enable row level security;
revoke all on public.profile_lookup_limits from anon, authenticated, service_role;

create or replace function public.search_credit_recipients(p_query text)
returns table (user_id uuid, username text, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_query text := lower(btrim(coalesce(p_query, '')));
  v_request_count integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if length(v_query) not between 3 and 24
     or v_query !~ '^[a-z0-9_]+$' then
    raise exception 'Enter at least 3 valid username characters.' using errcode = '22023';
  end if;

  insert into public.profile_lookup_limits (user_id, window_started_at, request_count)
  values (v_user_id, now(), 1)
  on conflict (user_id) do update
  set
    request_count = case
      when public.profile_lookup_limits.window_started_at <= now() - interval '1 minute' then 1
      else public.profile_lookup_limits.request_count + 1
    end,
    window_started_at = case
      when public.profile_lookup_limits.window_started_at <= now() - interval '1 minute' then now()
      else public.profile_lookup_limits.window_started_at
    end
  returning request_count into v_request_count;

  if v_request_count > 20 then
    raise exception 'Recipient lookup rate limit exceeded.' using errcode = 'P4290';
  end if;

  return query
  select p.id, p.username, p.display_name
  from public.profiles p
  where p.id <> v_user_id
    and p.username is not null
    and p.username like v_query || '%'
  order by p.username
  limit 8;
end;
$$;

revoke all on function public.search_credit_recipients(text) from public, anon;
grant execute on function public.search_credit_recipients(text) to authenticated;

comment on column public.profiles.username is
  'Public, unique, lowercase recipient handle. Never use email as a public lookup identifier.';
comment on function public.search_credit_recipients(text) is
  'Authenticated prefix lookup returning only user ID, public username and display name; limited to 20 calls per user per rolling minute and 8 results.';
