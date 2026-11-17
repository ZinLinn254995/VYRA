-- Add explicit Storyboard project scope to the generic Media Library.
-- Existing personal and Universe-backed rows remain untouched (project_id stays NULL).
alter table public.media_library_folders
  add column if not exists project_id uuid references public.vyral_storyboards(id) on delete restrict;

alter table public.media_library_items
  add column if not exists project_id uuid references public.vyral_storyboards(id) on delete restrict;

create index if not exists media_library_folders_owner_project_parent_idx
  on public.media_library_folders(user_id, project_id, parent_id, name);

create index if not exists media_library_items_owner_project_folder_created_idx
  on public.media_library_items(user_id, project_id, folder_id, created_at desc);

-- Root folder names are unique inside a single scope, not across every project
-- owned by the same account. Keep legacy personal and Universe scopes distinct.
drop index if exists public.media_library_folders_root_name_unique;
create unique index media_library_folders_root_name_unique
  on public.media_library_folders(
    user_id,
    coalesce(project_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(universe_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  )
  where parent_id is null;

-- A parent and child must belong to the same owner and the same storage scope.
create or replace function public.enforce_media_library_folder_parent_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_owner uuid;
  parent_project uuid;
  parent_universe uuid;
  project_owner uuid;
  creates_cycle boolean := false;
begin
  if new.project_id is not null and new.universe_id is not null then
    raise exception 'A Media Library folder cannot belong to both a project and a Universe';
  end if;

  if new.project_id is not null then
    select user_id into project_owner
    from public.vyral_storyboards
    where id = new.project_id;
    if project_owner is distinct from new.user_id then
      raise exception 'Storyboard project does not belong to this user';
    end if;
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A folder cannot be moved into itself';
    end if;

    select user_id, project_id, universe_id
      into parent_owner, parent_project, parent_universe
    from public.media_library_folders
    where id = new.parent_id;

    if parent_owner is distinct from new.user_id then
      raise exception 'Parent folder does not belong to this user';
    end if;
    if parent_project is distinct from new.project_id
      or parent_universe is distinct from new.universe_id then
      raise exception 'Parent folder belongs to a different storage scope';
    end if;

    if tg_op = 'UPDATE' and new.parent_id is distinct from old.parent_id then
      with recursive descendants(id) as (
        select id
        from public.media_library_folders
        where parent_id = new.id and user_id = new.user_id
        union
        select child.id
        from public.media_library_folders child
        join descendants parent on child.parent_id = parent.id
        where child.user_id = new.user_id
      )
      select exists(select 1 from descendants where id = new.parent_id)
        into creates_cycle;

      if creates_cycle then
        raise exception 'A folder cannot be moved into one of its descendants';
      end if;
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists media_library_folders_parent_owner on public.media_library_folders;
create trigger media_library_folders_parent_owner
before insert or update of user_id, parent_id, name, project_id, universe_id
on public.media_library_folders
for each row execute function public.enforce_media_library_folder_parent_owner();

-- File rows must match both the owner and scope of their containing folder.
create or replace function public.enforce_media_library_item_owner_refs()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  folder_owner uuid;
  folder_project uuid;
  folder_universe uuid;
  asset_owner uuid;
  project_owner uuid;
begin
  if new.project_id is not null and new.universe_id is not null then
    raise exception 'A Media Library item cannot belong to both a project and a Universe';
  end if;

  if new.project_id is not null then
    select user_id into project_owner
    from public.vyral_storyboards
    where id = new.project_id;
    if project_owner is distinct from new.user_id then
      raise exception 'Storyboard project does not belong to this user';
    end if;
  end if;

  if new.folder_id is not null then
    select user_id, project_id, universe_id
      into folder_owner, folder_project, folder_universe
    from public.media_library_folders
    where id = new.folder_id;
    if folder_owner is distinct from new.user_id then
      raise exception 'Media Library folder does not belong to this user';
    end if;
    if folder_project is distinct from new.project_id
      or folder_universe is distinct from new.universe_id then
      raise exception 'Media Library folder belongs to a different storage scope';
    end if;
  end if;

  if new.source_asset_id is not null then
    select user_id into asset_owner
    from public.vyral_assets
    where id = new.source_asset_id;
    if asset_owner is distinct from new.user_id then
      raise exception 'Source Asset does not belong to this user';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists media_library_items_owner_refs on public.media_library_items;
create trigger media_library_items_owner_refs
before insert or update of user_id, folder_id, source_asset_id, project_id, universe_id
on public.media_library_items
for each row execute function public.enforce_media_library_item_owner_refs();

comment on column public.media_library_folders.project_id is
  'Optional Storyboard project scope for generic project Storage. NULL preserves legacy personal/Universe folders.';
comment on column public.media_library_items.project_id is
  'Optional Storyboard project scope for generic project files. NULL preserves legacy personal/Universe items.';
