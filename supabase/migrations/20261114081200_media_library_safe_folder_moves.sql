-- Prevent moving a folder into itself or any descendant.
-- UNION (not UNION ALL) makes the traversal terminate even if legacy data
-- already contains a cycle.
create or replace function public.enforce_media_library_folder_parent_owner()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  parent_owner uuid;
  creates_cycle boolean := false;
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'A folder cannot be moved into itself';
    end if;

    select user_id into parent_owner
    from public.media_library_folders
    where id = new.parent_id;

    if parent_owner is distinct from new.user_id then
      raise exception 'Parent folder does not belong to this user';
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
