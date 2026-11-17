-- Atomically delete standalone files from one project and queue their private binaries for cleanup.
-- Canonical Vyral-backed Asset rows are deliberately rejected and never queued here.
create or replace function public.delete_project_media_library_items_and_queue_storage_cleanup(
  p_project_id uuid,
  p_item_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_deleted_count integer := 0;
  v_invalid_count integer := 0;
begin
  if v_user_id is null then
    raise exception 'Authentication is required';
  end if;
  if p_project_id is null or coalesce(cardinality(p_item_ids), 0) = 0 then
    return 0;
  end if;

  if not exists (
    select 1 from public.vyral_storyboards
    where id = p_project_id and user_id = v_user_id
  ) then
    raise exception 'Project does not belong to the authenticated user';
  end if;

  select count(*)::integer into v_invalid_count
  from public.media_library_items
  where user_id = v_user_id
    and project_id = p_project_id
    and id = any(p_item_ids)
    and (
      source_asset_id is not null
      or bucket_id <> 'vyral-assets'
      or storage_path not like v_user_id::text || '/media-library/%'
      or position(chr(92) in storage_path) > 0
      or storage_path ~ '(^|/)\.\.?(/|$)'
      or coalesce(metadata->>'thumbnail_path', '') <> ''
        and (
          metadata->>'thumbnail_path' not like v_user_id::text || '/media-library-thumbnails/%'
          or position(chr(92) in metadata->>'thumbnail_path') > 0
          or metadata->>'thumbnail_path' ~ '(^|/)\.\.?(/|$)'
        )
    );

  if v_invalid_count > 0 then
    raise exception 'Selected project files include a canonical Asset or unsafe Storage path';
  end if;

  if (
    select count(*) from public.media_library_items
    where user_id = v_user_id and project_id = p_project_id and id = any(p_item_ids)
  ) <> cardinality(p_item_ids) then
    raise exception 'One or more files are not in this project';
  end if;

  insert into public.media_library_storage_cleanup_jobs (
    user_id, bucket_id, storage_paths, attempts, next_attempt_at, last_error
  )
  select
    v_user_id,
    'vyral-assets',
    array_remove(array[
      item.storage_path,
      nullif(item.metadata->>'thumbnail_path', '')
    ], null),
    0,
    now(),
    'Project file deletion cleanup'
  from public.media_library_items item
  where item.user_id = v_user_id
    and item.project_id = p_project_id
    and item.id = any(p_item_ids);

  delete from public.media_library_items
  where user_id = v_user_id
    and project_id = p_project_id
    and id = any(p_item_ids);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.delete_project_media_library_items_and_queue_storage_cleanup(uuid, uuid[]) from public;
grant execute on function public.delete_project_media_library_items_and_queue_storage_cleanup(uuid, uuid[]) to authenticated;
