-- Initial customer-owned metadata schema for VYRA.
-- Apply with: supabase db push (after linking/configuring a Supabase project).
-- This migration intentionally excludes billing, credits, provider secrets and binary media.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_id text not null check (char_length(local_id) between 1 and 128),
  title text not null check (char_length(title) between 1 and 200),
  status text not null default 'draft'
    check (status in ('draft', 'in_review', 'changes_requested', 'approved', 'ready_to_publish', 'archived')),
  project_data jsonb not null check (jsonb_typeof(project_data) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_user_local_id_unique unique (user_id, local_id)
);

create index if not exists projects_user_updated_at_idx
  on public.projects (user_id, updated_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.projects enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own"
  on public.projects for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own"
  on public.projects for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own"
  on public.projects for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own"
  on public.projects for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.profiles from anon, authenticated;
revoke all on public.projects from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;

comment on table public.projects is
  'Customer-owned project metadata. Binary media belongs in object storage, not project_data.';
comment on column public.projects.local_id is
  'Original browser-local project ID, unique only within the owning customer account.';
comment on column public.projects.project_data is
  'Portable project JSON only. Exclude API keys, base64/blob payloads and device-local media references.';
