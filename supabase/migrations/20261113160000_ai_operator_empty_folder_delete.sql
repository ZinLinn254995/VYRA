create or replace function public.delete_empty_vyral_folder(
  p_user_id uuid,
  p_vyral_id uuid,
  p_folder_id uuid,
  p_expected_name text,
  p_expected_created_at timestamptz
)
returns table (id uuid, name text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_folder public.vyral_folders%rowtype;
begin
  if p_user_id is null or p_vyral_id is null or p_folder_id is null
     or p_expected_name is null or p_expected_created_at is null then
    return;
  end if;

  -- Serialize folder-content insertion against deletion. FK checks for new
  -- child folders and Assets take a key-share lock on this row.
  select * into v_folder
  from public.vyral_folders f
  where f.id = p_folder_id
    and f.vyral_id = p_vyral_id
    and f.user_id = p_user_id
  for update;

  if not found
     or v_folder.name <> p_expected_name
     or v_folder.created_at <> p_expected_created_at then
    return;
  end if;

  if exists (
    select 1 from public.vyral_folders child
    where child.parent_id = p_folder_id
      and child.vyral_id = p_vyral_id
      and child.user_id = p_user_id
  ) or exists (
    select 1 from public.vyral_assets asset
    where asset.folder_id = p_folder_id
      and asset.vyral_id = p_vyral_id
      and asset.user_id = p_user_id
  ) then
    return;
  end if;

  return query
  delete from public.vyral_folders f
  where f.id = p_folder_id
    and f.vyral_id = p_vyral_id
    and f.user_id = p_user_id
    and f.name = p_expected_name
    and f.created_at = p_expected_created_at
  returning f.id, f.name;
end;
$$;

revoke all on function public.delete_empty_vyral_folder(uuid, uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.delete_empty_vyral_folder(uuid, uuid, uuid, text, timestamptz) to service_role;
