-- Scope the unified Media Library to an optional private Storyboard Universe.
-- Personal Library rows remain NULL-scoped and are not moved or rewritten.
alter table public.media_library_folders
  add column if not exists universe_id uuid references public.vyrals(id) on delete cascade;
alter table public.media_library_items
  add column if not exists universe_id uuid references public.vyrals(id) on delete cascade;

drop index if exists public.media_library_folders_root_name_unique;
drop index if exists public.media_library_folders_child_name_unique;
create unique index media_library_folders_root_name_unique
  on public.media_library_folders(
    user_id,
    coalesce(universe_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  ) where parent_id is null;
create unique index media_library_folders_child_name_unique
  on public.media_library_folders(
    user_id,
    coalesce(universe_id, '00000000-0000-0000-0000-000000000000'::uuid),
    parent_id,
    lower(name)
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
begin
  if new.universe_id is not null then
    select user_id, metadata ->> 'universe_scope'
      into universe_owner, universe_scope
    from public.vyrals where id = new.universe_id;
    if universe_owner is distinct from new.user_id or universe_scope is distinct from 'storyboard' then
      raise exception 'Storyboard Universe does not belong to this user';
    end if;
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
      select exists(select 1 from descendants where id = new.parent_id) into strict creates_cycle;
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
