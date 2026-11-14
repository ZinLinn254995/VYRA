-- Cloud-backed personal Media Library. Binary objects remain in the private vyral-assets bucket.
create table if not exists public.media_library_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.media_library_folders(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists media_library_folders_root_name_unique
  on public.media_library_folders(user_id, lower(name)) where parent_id is null;
create unique index if not exists media_library_folders_child_name_unique
  on public.media_library_folders(user_id, parent_id, lower(name)) where parent_id is not null;
create index if not exists media_library_folders_owner_parent_idx
  on public.media_library_folders(user_id, parent_id, name);

create table if not exists public.media_library_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid references public.media_library_folders(id) on delete set null,
  source_kind text not null default 'upload'
    check (source_kind in ('upload','vyral_asset','generated')),
  source_asset_id uuid references public.vyral_assets(id) on delete set null,
  bucket_id text not null default 'vyral-assets' check (bucket_id = 'vyral-assets'),
  storage_path text not null,
  file_name text not null check (length(btrim(file_name)) between 1 and 255),
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null check (size_bytes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_library_items_storage_path_nonempty check (length(btrim(storage_path)) > 0)
);

create unique index if not exists media_library_items_source_asset_unique
  on public.media_library_items(user_id, source_asset_id) where source_asset_id is not null;
create index if not exists media_library_items_owner_folder_created_idx
  on public.media_library_items(user_id, folder_id, created_at desc);
create index if not exists media_library_items_owner_type_idx
  on public.media_library_items(user_id, mime_type, created_at desc);

create or replace function public.enforce_media_library_item_owner_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  folder_owner uuid;
  asset_owner uuid;
begin
  if new.folder_id is not null then
    select user_id into folder_owner from public.media_library_folders where id = new.folder_id;
    if folder_owner is distinct from new.user_id then
      raise exception 'Media Library folder does not belong to this user';
    end if;
  end if;
  if new.source_asset_id is not null then
    select user_id into asset_owner from public.vyral_assets where id = new.source_asset_id;
    if asset_owner is distinct from new.user_id then
      raise exception 'Source Asset does not belong to this user';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists media_library_items_owner_refs on public.media_library_items;
create trigger media_library_items_owner_refs
before insert or update of user_id, folder_id, source_asset_id
on public.media_library_items
for each row execute function public.enforce_media_library_item_owner_refs();

create or replace function public.enforce_media_library_folder_parent_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_owner uuid;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A folder cannot be its own parent';
    end if;
    select user_id into parent_owner from public.media_library_folders where id = new.parent_id;
    if parent_owner is distinct from new.user_id then
      raise exception 'Parent folder does not belong to this user';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists media_library_folders_parent_owner on public.media_library_folders;
create trigger media_library_folders_parent_owner
before insert or update of user_id, parent_id, name
on public.media_library_folders
for each row execute function public.enforce_media_library_folder_parent_owner();

alter table public.media_library_folders enable row level security;
alter table public.media_library_items enable row level security;

drop policy if exists media_library_folders_select_own on public.media_library_folders;
create policy media_library_folders_select_own on public.media_library_folders
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists media_library_folders_insert_own on public.media_library_folders;
create policy media_library_folders_insert_own on public.media_library_folders
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists media_library_folders_update_own on public.media_library_folders;
create policy media_library_folders_update_own on public.media_library_folders
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists media_library_folders_delete_own on public.media_library_folders;
create policy media_library_folders_delete_own on public.media_library_folders
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists media_library_items_select_own on public.media_library_items;
create policy media_library_items_select_own on public.media_library_items
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists media_library_items_insert_own on public.media_library_items;
create policy media_library_items_insert_own on public.media_library_items
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists media_library_items_update_own on public.media_library_items;
create policy media_library_items_update_own on public.media_library_items
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists media_library_items_delete_own on public.media_library_items;
create policy media_library_items_delete_own on public.media_library_items
for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.media_library_folders to authenticated;
grant select, insert, update, delete on public.media_library_items to authenticated;

comment on table public.media_library_folders is 'Private, account-owned folders for the unified VYRA Media Library.';
comment on table public.media_library_items is 'Private Media Library index for uploaded files and existing/generated Vyral Assets. Binary files stay in private Storage.';
