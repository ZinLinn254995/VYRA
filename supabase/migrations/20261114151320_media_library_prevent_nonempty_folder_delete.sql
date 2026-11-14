-- Enforce empty-folder deletion in the database, not only in the UI.
-- The row lock taken by DELETE serializes this check with inserts/moves that
-- reference the folder, closing the check-then-delete race between browser tabs.
create or replace function public.prevent_nonempty_media_library_folder_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Preserve account-level cascading deletes (auth.users -> folders).
  if pg_trigger_depth() > 1 then
    return old;
  end if;

  if exists (
    select 1
    from public.media_library_folders
    where user_id = old.user_id
      and parent_id = old.id
  ) or exists (
    select 1
    from public.media_library_items
    where user_id = old.user_id
      and folder_id = old.id
  ) then
    raise exception 'Media Library folder is not empty; move or remove its contents first'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists media_library_folders_prevent_nonempty_delete on public.media_library_folders;
create trigger media_library_folders_prevent_nonempty_delete
before delete on public.media_library_folders
for each row execute function public.prevent_nonempty_media_library_folder_delete();
