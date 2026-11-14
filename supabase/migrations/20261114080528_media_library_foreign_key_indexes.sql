create index if not exists media_library_folders_parent_fk_idx
  on public.media_library_folders(parent_id);
create index if not exists media_library_items_folder_fk_idx
  on public.media_library_items(folder_id);
create index if not exists media_library_items_source_asset_fk_idx
  on public.media_library_items(source_asset_id);
