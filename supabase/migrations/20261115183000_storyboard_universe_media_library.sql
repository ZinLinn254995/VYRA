-- Scope the unified Media Library to an optional private Storyboard Universe.
-- Personal Library rows remain NULL-scoped and are not moved or rewritten.
alter table public.media_library_folders
  add column if not exists universe_id uuid references public.vyrals(id) on delete cascade;
alter table public.media_library_items
  add column if not exists universe_id uuid references public.vyrals(id) on delete cascade;
alter table public.media_library_folders
  add column if not exists vyral_folder_id uuid references public.vyral_folders(id) on delete cascade;
create unique index if not exists media_library_folders_vyral_folder_unique
  on public.media_library_folders(vyral_folder_id) where vyral_folder_id is not null;

drop index if exists public.media_library_folders_root_name_unique;
drop index if exists public.media_library_folders_child_name_unique;
create unique index media_library_folders_root_name_unique
  on public.media_library_folders(
    user_id, coalesce(universe_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name)
  ) where parent_id is null;
create unique index media_library_folders_child_name_unique
  on public.media_library_folders(
    user_id, coalesce(universe_id, '00000000-0000-0000-0000-000000000000'::uuid), parent_id, lower(name)
  ) where parent_id is not null;

create index if not exists media_library_folders_universe_parent_idx
  on public.media_library_folders(user_id, universe_id, parent_id, name);
create index if not exists media_library_items_universe_folder_idx
  on public.media_library_items(user_id, universe_id, folder_id, created_at desc);

create or replace function public.enforce_media_library_folder_parent_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_owner uuid;
  parent_universe uuid;
  universe_owner uuid;
  universe_scope text;
  canonical_folder_owner uuid;
  canonical_universe uuid;
  canonical_parent uuid;
  creates_cycle boolean := false;
begin
  if new.universe_id is not null then
    select user_id, metadata ->> 'universe_scope'
      into universe_owner, universe_scope
    from public.vyrals where id = new.universe_id;
    if universe_owner is distinct from new.user_id or universe_scope is distinct from 'storyboard' then
      raise exception 'Storyboard Universe does not belong to this user';
    end if;
    if new.vyral_folder_id is null then raise exception 'Storyboard folders must map to canonical Universe folders'; end if;
    select user_id, vyral_id, parent_id into canonical_folder_owner, canonical_universe, canonical_parent
      from public.vyral_folders where id = new.vyral_folder_id;
    if canonical_folder_owner is distinct from new.user_id or canonical_universe is distinct from new.universe_id
      or new.vyral_folder_id is distinct from new.id or canonical_parent is distinct from new.parent_id then
      raise exception 'Canonical Universe folder does not match the Media Library folder';
    end if;
  elsif new.vyral_folder_id is not null then
    raise exception 'Personal Media Library folders cannot reference Universe folders';
  end if;
  if new.parent_id is not null then
    if new.parent_id = new.id then raise exception 'A folder cannot be its own parent'; end if;
    select user_id, universe_id into parent_owner, parent_universe
      from public.media_library_folders where id = new.parent_id;
    if parent_owner is distinct from new.user_id or parent_universe is distinct from new.universe_id then
      raise exception 'Parent folder does not belong to this Library scope';
    end if;
    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      with recursive descendants(id) as (
        select id from public.media_library_folders
          where parent_id = new.id and user_id = new.user_id and universe_id is not distinct from new.universe_id
        union
        select child.id from public.media_library_folders child
          join descendants parent on child.parent_id = parent.id
          where child.user_id = new.user_id and child.universe_id is not distinct from new.universe_id
      )
      select exists(select 1 from descendants where id = new.parent_id) into creates_cycle;
      if creates_cycle then raise exception 'A folder cannot be moved into one of its descendants'; end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.enforce_media_library_item_owner_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  folder_owner uuid;
  folder_universe uuid;
  asset_owner uuid;
  asset_universe uuid;
  asset_folder uuid;
  universe_owner uuid;
  universe_scope text;
begin
  if new.universe_id is not null then
    select user_id, metadata ->> 'universe_scope'
      into universe_owner, universe_scope
    from public.vyrals where id = new.universe_id;
    if universe_owner is distinct from new.user_id or universe_scope is distinct from 'storyboard' then
      raise exception 'Storyboard Universe does not belong to this user';
    end if;
    if new.source_asset_id is null then
      raise exception 'Storyboard Universe files must be backed by a canonical Asset with DNA';
    end if;
  end if;
  if new.folder_id is not null then
    select user_id, universe_id into folder_owner, folder_universe
      from public.media_library_folders where id = new.folder_id;
    if folder_owner is distinct from new.user_id or folder_universe is distinct from new.universe_id then
      raise exception 'Media Library folder does not belong to this Library scope';
    end if;
  end if;
  if new.source_asset_id is not null then
    select user_id, vyral_id, folder_id into asset_owner, asset_universe, asset_folder
      from public.vyral_assets where id = new.source_asset_id;
    if asset_owner is distinct from new.user_id then
      raise exception 'Source Asset does not belong to this user';
    end if;
    if new.universe_id is not null and asset_universe is distinct from new.universe_id then
      raise exception 'Source Asset does not belong to this Storyboard Universe';
    end if;
    if new.universe_id is not null and asset_folder is distinct from new.folder_id then
      raise exception 'Media Library folder must match the canonical Asset folder';
    end if;
  end if;
  return new;
end;
$$;

drop policy if exists media_library_folders_select_own on public.media_library_folders;
drop index if exists public.media_library_items_source_asset_unique;
create unique index media_library_items_source_asset_unique
  on public.media_library_items(user_id, universe_id, source_asset_id);

drop trigger if exists media_library_folders_parent_owner on public.media_library_folders;
create trigger media_library_folders_parent_owner
before insert or update of user_id, parent_id, name, universe_id, vyral_folder_id
on public.media_library_folders
for each row execute function public.enforce_media_library_folder_parent_owner();

drop trigger if exists media_library_items_owner_refs on public.media_library_items;
create trigger media_library_items_owner_refs
before insert or update of user_id, folder_id, source_asset_id, universe_id
on public.media_library_items
for each row execute function public.enforce_media_library_item_owner_refs();

create policy media_library_folders_select_own on public.media_library_folders
for select to authenticated using (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = media_library_folders.universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
drop policy if exists media_library_folders_insert_own on public.media_library_folders;
create policy media_library_folders_insert_own on public.media_library_folders
for insert to authenticated with check (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
drop policy if exists media_library_folders_update_own on public.media_library_folders;
create policy media_library_folders_update_own on public.media_library_folders
for update to authenticated using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
drop policy if exists media_library_items_select_own on public.media_library_items;
create policy media_library_items_select_own on public.media_library_items
for select to authenticated using (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = media_library_items.universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
drop policy if exists media_library_items_insert_own on public.media_library_items;
create policy media_library_items_insert_own on public.media_library_items
for insert to authenticated with check (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = media_library_items.universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
drop policy if exists media_library_items_update_own on public.media_library_items;
create policy media_library_items_update_own on public.media_library_items
for update to authenticated using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid()) and (
    universe_id is null or exists (
      select 1 from public.vyrals u where u.id = media_library_items.universe_id
        and u.user_id = (select auth.uid()) and u.metadata ->> 'universe_scope' = 'storyboard'
    )
  )
);
