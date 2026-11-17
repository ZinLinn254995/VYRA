create table if not exists public.media_library_storage_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_id text not null check (length(btrim(bucket_id)) > 0),
  storage_paths text[] not null check (cardinality(storage_paths) > 0),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now()
);

create index if not exists media_library_storage_cleanup_due_idx
  on public.media_library_storage_cleanup_jobs(user_id, next_attempt_at, created_at);

alter table public.media_library_storage_cleanup_jobs enable row level security;

drop policy if exists media_library_storage_cleanup_select_own on public.media_library_storage_cleanup_jobs;
create policy media_library_storage_cleanup_select_own
  on public.media_library_storage_cleanup_jobs
  for select to authenticated using (user_id = (select auth.uid()));

drop policy if exists media_library_storage_cleanup_insert_own on public.media_library_storage_cleanup_jobs;
create policy media_library_storage_cleanup_insert_own
  on public.media_library_storage_cleanup_jobs
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists media_library_storage_cleanup_update_own on public.media_library_storage_cleanup_jobs;
create policy media_library_storage_cleanup_update_own
  on public.media_library_storage_cleanup_jobs
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists media_library_storage_cleanup_delete_own on public.media_library_storage_cleanup_jobs;
create policy media_library_storage_cleanup_delete_own
  on public.media_library_storage_cleanup_jobs
  for delete to authenticated using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.media_library_storage_cleanup_jobs to authenticated;

create or replace function public.delete_media_library_items_and_queue_storage_cleanup(p_item_ids uuid[])
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  owner_id uuid := auth.uid();
  deleted_count integer := 0;
begin
  if owner_id is null then
    raise exception 'Sign in to delete Media Library files' using errcode = '42501';
  end if;

  if coalesce(cardinality(p_item_ids), 0) = 0 then
    return 0;
  end if;

  insert into public.media_library_storage_cleanup_jobs (user_id, bucket_id, storage_paths)
  select
    item.user_id,
    item.bucket_id,
    array_remove(array[item.storage_path, nullif(item.metadata->>'thumbnail_path', '')], null)
  from public.media_library_items as item
  where item.user_id = owner_id
    and item.id = any(p_item_ids)
    and item.source_asset_id is null;

  delete from public.media_library_items as item
  where item.user_id = owner_id
    and item.id = any(p_item_ids);

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_media_library_items_and_queue_storage_cleanup(uuid[]) from public;
grant execute on function public.delete_media_library_items_and_queue_storage_cleanup(uuid[]) to authenticated;

comment on table public.media_library_storage_cleanup_jobs is
  'Owner-scoped durable retry queue for private Storage objects whose Media Library index rows have already been safely deleted.';
